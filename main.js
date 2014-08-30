/*-------------------------------------   BRANCH -------------------------------------*/

function branch(c, r, p, l){
    this.parent = p || null
    this.label = l || null

    //parse and filter restrictions
    this.parseRestrictions = parseRestrictions
    r = this.parseRestrictions(r)

    //load the requested construction
    c = c(r)
    if(!c) return {text: ''} //this is necessary for some reason, since reworking complements

    //if c returned an array
    while(typeOf(c)==='array'){

        if(typeof c[0] == 'function') {

            //some constructions just reroute to other constructions
            c = c[0]( $.extend({}, r, c[1]) )

        } else if ("children".in(c[0]) || "text".in(c[0])) {

            //here we are dealing with a complement which provides an array of one or more pseudo-branches
            //so we run the branch processing on each "branch" and return the processed array
            //but a copy of each branch must be made because executeBranch expects a real branch for context
            //and the return value of a construction function for its first argument
            var multi = []
            for (var cx in c ) {
                multi[cx] = _.clone(c[cx])
                executeBranch.apply( multi[cx],  [c[cx], {}, this, c[cx].head] )
            }
            return multi
        }
        else break //just prevent infinite loops
    }

    this.executeBranch = executeBranch;
    executeBranch.apply(this, [c, r])

    //dump almost all other c.properties into this
    for(var prop in c){
        if(prop!='head' && prop!='children')
            this[prop] = c[prop];
    }

    //this is probably a word
    if(!"children".in(c)) {
        //words need a text property
        if(!"text".in(c)) this.text = c.inflected || c.name

        //create a happy package of all the important restrictions on this word, for grabbing from elsewhere
        this.R = safe(this)
    }

//////////////////////////////////////////////////////////////////////////////////////////////////

    function executeBranch(c, r){

        //evaluate head first
        if("head".in(c)){
            this.order = c.order
            this.children = {}

            var newbranch = c.children[c.head][0]
            var headr = $.extend({}, c.restrictions, r, c.children[c.head][1])
            this.head = this.children[c.head] = new branch(newbranch, headr, this, c.head)

        }

        //run special functions after head is loaded, if any
        //if(this.head.midlogic)

        //evaluate rest of children
        if("children".in(c)){
            for(var child in c.children){
                if(this.children[child] != this.head){
                    if(typeOf(c.children[child])=='array'){
                        var R = this.parseRestrictions(c.children[child][1]) //restrictions explicitly passed in to branch
                        if(R=="LEAVE") this.children[child] = {text: ""} //this is how we deal with branches that our restrictions told us not to follow

                        else {
                            //if a restriction reset has been requested, clear everything accept nocomplement
//                            if (c.children[child][1] && c.children[child][1].reset) r = {nocomplement: r.nocomplement}

                            var probability = c.children[child][2] || 1 //if children have a probability of occurence
                            var tempchildren = []
                            while (probability > Math.random()) { //repeat until the probability dies

                                //Fetch the child branch
                                var sprout = new branch(c.children[child][0], $.extend({}, c.restrictions, R), this, child)
                                if (typeOf(sprout) == 'array')
                                    { tempchildren = tempchildren.concat(sprout) }
                                else
                                    { tempchildren.push(sprout) }

                                if (probability == 1) probability = 0
                                else probability *= 0.85
                            }

                            //sort the multiple child instances if there is sort criteria
                            if (c.children[child][3]!==undefined) {
                                var sortby = c.children[child][3]
                                tempchildren = tempchildren.sort(function(b,a){
                                    if (a[sortby]) {
                                        //items being sorted have property directly, like when sorting words
                                        return a[sortby] - b[sortby]
                                    } else {
                                        //items being sorted do not have property, such as when sorting phrases
                                        //property must exist on the head or grandchildhead etc.
                                        return propertySearch2(a,sortby) - propertySearch2(b,sortby)
                                    }
                                })
                            }

                            if (tempchildren.length==1) tempchildren = tempchildren[0]
                            else if (tempchildren.length===0) tempchildren = {text: ""}
                            this.children[child] = tempchildren
                        }
                    }
                    else //presumably this is just a straight object rather than a construction + restrictions to evaluate
                    {this.children[child] = c.children[child]}
                }
            }
        }
    }

    /*-------------------------------------   RESTRICTIONS -------------------------------------*/

    function parseRestrictions(restrictions){
        if (typeof restrictions==='undefined') return;
        if (isEmpty(restrictions)) return restrictions;

        //strings can be passed as restrictions. they are expected to eval to just an object, no property
        if (typeof restrictions==='string') {
            return parseSingleRestriction(restrictions, this, true) || {}
        }

        //if restrictions is an object (usually), parse the string values of each element
        var that = this
        var out_restrictions = {}

        $.each(restrictions, function(r){

            var expando = r=='unpack' ? true : false //this allows entire words to be unpacked in the restrictions
            var arrr = parseSingleRestriction(restrictions[r], that, expando)
            if (arrr===null) console.warn(r + " evaluated to null in " + that.label)
            else if (typeOf(arrr)=='object') $.extend( out_restrictions, arrr )
            else if (arrr===true) out_restrictions[r] = restrictions[r] //plain strings and numbers

        }) //end each restriction

        return out_restrictions

    } //end parseRestrictions

} //end branch

function parseSingleRestriction(s, context, expandPlainStrings){
    //type check
    if(typeof s === 'object' || typeof s === 'function'){
        //we don't allow objects or other crazy nonsense inside the restrictions object
        return false
    }
    if(typeof s != 'string') return true //numbers could make it up to this point

    //expand "object.property(-property)(,obj.property)" to {property:value}
    if(/^\w+\.(\w+(-\w+)*)(,\w+\.(\w+(-\w+)*))*$/.test(s)) {

        //split comma separated values and parse each one
        if(s.findChar(",")) {
            var multi =  s.split(",").map(function(x){
                return parseSingleRestriction(x)
            })
            //collapse array of objects down to one
            multi = $.extend.apply( this, _.compact(multi) )
            return multi
        }

        //split 'object.property'
        var obj_prop = s.split('.')
        var obj = objectSearch2(obj_prop[0],context)
        var prop = obj_prop[1]

        if (prop.findChar('-')){

            //parse properties that are like anim-class-thing
            var props = prop.split('-')
            props = props.map(function(x){
                //get the {property:value} for each x under obj
                var p = propertySearch2(obj,x)
                var out = {}
                out[x] = p
                return out
            })
            return $.extend.apply( this, _.compact(props) )

        } else {
            //parse simple properties
            var found = propertySearch2(obj,prop)
            if (typeOf(found) == 'object') return found
            var out = {}
            out[prop] = found
            return out
        }
    }

    //restriction has no dots or dashes
    if (expandPlainStrings) return objectSearch2(s, context) // it is either asking for an object
    else return true
}



/*//processing of special instruction characters in
function r_special(r){
    matcha = '!@~<>='.match(/[@~$&#!<>=]/g)[0];

    if(!matcha) return false

    switch(matcha){
        case '#': console.log('Pound it.');
            break;
        case '!': console.log("n't!")
    }

    return matcha
}*/




/*-------------------------------------   INFLECT -------------------------------------*/

//picks a specific inflection of/for a word if it has anything special
//determines all categories that apply to the word type that haven't been specified by restrictions
function inflect(word, r){
    word.inflections = word.inflections||""


    r = r || {}
    var query = []
    //paradigms specific to this word type, and a new copy so we can hack and slash it
    var pdigms = $.extend(true,{}, paradigms[word.type])
    //word level prohibitions
    var prohib = word.prohibitions
    prohib = prohib ? toObject(prohib) : null

    for(var para in pdigms){

        //remove prohibited categories from paradigm
        for (var cg = pdigms[para].length - 1; cg >= 0; cg--) {

            var cat = pdigms[para][cg]
            var uni = prohibitions.descend(para, cat)

            //merge universal and word-level prohibitions
            var prohibz = $.extend({}, uni, prohib)
            var phb = prohibz[para] ? toNumBool(prohibz[para]) : null

            //create modified word for collision detection
            var wrd = _.extend({}, word, prohib) //if prohibs specify a word property they get to overwrite/mask that word prop

            if( (goodVal(phb) && magicCompare(phb,cat)) || uni && collide(wrd, uni) )
                pdigms[para].splice(cg, 1)

        }

        //if a category has already been specified use it
        if(para.in(r)  && goodVal(r[para])) {
            /////////////////////////////////////////if (pdigms[para].indexOf(r[para].toString())>-1 || pdigms[para].indexOf(r[para])>-1)
            if (magicCompare(r[para], pdigms[para].toString())) {word[para] = r[para]}
            else {
                console.warn(
                    "Category '"+para+':'+r[para]+"' not found for "+word.type+" '"+word.name+"'. " +
                    "A random category will be assigned."
                )
                word[para] = pickOne(pdigms[para])
            }
        }
        //otherwise pick one at random
        else word[para] = pickOne(pdigms[para])

        query.push(word[para])
    }

    //if the word doesn't have a custom inflection we can stop here
    if(word.inflections=="") {
        word.inflected = ""
        return word
    }

    //magical CSS-like application of inflections

    //find all rules that possibly apply to the given restrictions
    query = query.join("|")
    var regex = "(^|,) *("+query+"|\\.)*("+query+ ")+ *:[^,]*"
    var outcome = word.inflections.match( new RegExp(regex, "gi"))

    if(outcome!==null){

        //pick the most specific rule (the one with the most dots)
        word.inflected = outcome.sort(function(a,b){
            return a.split(".").length>b.split(".").length
        })
        .pop().split(":").pop().trim()

        return word

    } else {
        word.inflected = ""
        return word
    }
}

/*-------------------------------------   COMPLEMENT   -------------------------------------*/

//expand a word with a complement, if it has one
function complement(r){
    if (goodVal(r.complements) && !r.nocomplement){
        var complement = r.complements.split(",")
        var chosen = choose2(complement)
        if (chosen) {
            chosen = chosen.split('/') //some things have multiple complements
            var parsed = chosen.map(function(a){
                return parseComplement(a, r)
            })

            return parsed
        }
    }
}

//take string complement description, return complement construction object
function parseComplement(complement, r){

    var c = complement.match(/\b[A-Z]+\w*({.+})*/g)

    if(c) c = c[0] //for now we assume there is only one construction per complement
    else return {text: complement} //this must be a simple word complement like fall _down_

    var func = c.match(/[A-Z]+\w*/)[0]

    var arg = c.match(/{.+}/)
    if (arg===null) {
        arg = r
    } else {
        arg = toObject(arg[0].slice(1,-1))
        arg = $.extend(arg,r)
    }
    delete arg.complements
    delete arg.reset

    if (window[func]===undefined) {
        return {text: error("No such construction exists as '"+func+"'.")}
    }

    complement = complement.replace(c, 'c')

    return {
        order: complement,
        head: "c",
        children: {
            c: [window[func], arg]
        }
    }
}


/*-------------------------------------   WORD GETTING -------------------------------------*/

//selects a word from the database that matches the given restrictions
function get(r){
    if(r.type==undefined) console.warn("Word type not specified for get function.")

    var word = pickOne(database[r.type], r) || false

    if(!'name'.in(word))
        return {text: console.warn("No word could be get'd with the following restrictions: "+JSON.stringify(r))}

    //add existing restrictions to the word
    word = $.extend({},r,word)

    //inflect the word
    if(!r.noinflection) inflect(word,r)

    //record this word so it isn't overused within the same sentence
    if (r.type == 'noun' || r.type == 'adjective') recentlyUsed.push(word.name)

    return word
}

//utility function for randomly picking one element from an array
function pickOne(arr, r){

    if(typeOf(arr) == 'object') arr = toArray(arr).slice() //in case object was past in
    else arr = arr.slice();
    r = r || null;
    var randex;

    if(!isEmpty(r)){
        while (arr.length) {
            randex=Math.floor(Math.random()*arr.length)
            if (r_match(r, arr[randex])) return arr[randex]
            else arr.splice(randex,1)
                }
        //var slim = $.grep(arr, slimmer)
        //return slim[Math.floor(Math.random()*slim.length)]
    }
    //just pick one at random
    else return arr[Math.floor(Math.random()*arr.length)]

    function slimmer(a){
        return r_match(r,a)
    }
}

//tests an object against a restrictions template
//if they have the same properties they must match, otherwise, who cares
//also rejected if restrictions match prohibitions on object
function r_match(restrictions, test_object){

    if (isEmpty(restrictions)) return true

    //prevent the repetitive use of words
    if (typeof recentlyUsed !== 'undefined' && recentlyUsed.indexOf(test_object.name) > -1) return false

    var prohib = test_object.prohibitions
    if(goodVal(prohib)) {//prohib = prohib.replace(/ /g, '')
        //reject if restrictions match prohibitions
        if (prohibited(restrictions, prohib)===true) return false
        prohib = toObject(prohib)
    }

    for(var r in restrictions){

        var rval = restrictions[r];

        //merge word-level and universal prohibitions for given paradigm (r)
        //word level overwrites universal
        var prohibz = $.extend({}, prohibitions.descend(r,rval))
        if (typeOf(prohib)=='object') $.extend(prohibz, prohib)
        if (prohibz && prohibited(test_object, prohibz)===true) return false

        if (typeof test_object[r] !== 'undefined') {
            
            var compareUs = 'reverse'.in(restrictions) ? [test_object[r],rval] : [rval, test_object[r]]
            if (magicCompare(compareUs[0], compareUs[1])) {
                continue
            } else return false

        } else continue

        }
    return true
}

function prohibited(testee,prohibs){
    if(isEmpty(prohibs) || testee===undefined || prohibs===undefined) return

    //convert to objects
    testee=toObject(testee)
    prohibs=toObject(prohibs)

    for(var p in prohibs){

        //if testee and prohib have opinions on the same topic...
        if(!goodVal(testee[p]) || !goodVal(prohibs[p])) continue

        var prohb = prohibs[p]+""
        var testy = testee[p]+""
        prohb = prohb.replace(/,/g,'|')
        testy = testy.replace(/,/g,'|')

        //if testee and prohib are straight up equal then prohibit
        if (prohb==testy) return true
        //if there are multiple options for one prohib have a showdown
        if(/[(|)]/.test(prohb)) {
            prohb = prohb.match(/[^(|)]+/g)
            testy = testy.match(/[^(|)]+/g)
            if (_.difference(testy, prohb).length===0) return true
                }
        //if testee has options and prohibs doesn't then obviously we're good
    }

    return false

    //"asd:123 (<<9a+ |_.)".match(/[^\s(|)]+/g)
    //return true
}

/*-------------------------------------   BRANCH NAVIGATION   -------------------------------------*/

function objectSearch2(what, context){
    if (!context) {
        console.warn("Object search failed for "+what)
        return null
    }

    if (context.label==what) return context //haha!

    if (!context.children) {
        if (!context.parent) {
            console.warn("Object search failed for "+what)
            return null
        }
        else {
            return objectSearch2(what, context.parent)
        }
    }
    return what.in(context.children) ? context.children[what] : objectSearch2(what, context.parent)
}

function propertySearch2(object, property) {
    if (typeOf(object)!=='object') {
        //console.warn("Invalid object passed to propertySearch.")
        return null
    }

    if (property.in(object)) return object[property]

    if ('head'.in(object)) {
        return propertySearch2(object.head, property)
    } else {
        //console.warn("Property search failed for " + property)
        return null
    }
}


/*-------------------------------------   OUTPUT -------------------------------------*/

//essentially the toString method for constructions
function stringOut(c){
    if(c===undefined) return undefined
    if("children".in(c)){

        var c = c

        var string = c.order.replace(/([^_ ])+/g, function(a){

            //optional words have an asterisk
            if (a.match(/\*/)){

                //optional undefined or empty words return ''
                if (!c.children[a.slice(0,-1)])
                    return ''
                else
                    a = a.slice(0,-1)

            }else{ //not optional

                //if there is no child with the given name then treat it as litteral
                if (!c.children[a])
                    return a
            }

            //break down arrays of adjectives or whatnot
            if(typeOf(c.children[a])=='array') {
                var tempstr = ""
                $.each(c.children[a], function (index, value){tempstr += " "+stringOut(value)})
                return tempstr
            }

            //or fetch single item
            else {
                var furtherIn = stringOut(c.children[a])

                //if (!furtherIn) {} //error("There was no child '"+a+"' to render.")
                return furtherIn===undefined ? '[???]' : furtherIn
            }

        })

        if (typeof c.postlogic==='function') string = c.postlogic(string)

        return string.replace(/(^|\s)([^\[\d]+)[0-9]+/g,"$2")       // remove numbers, except for [e123] errors
                     .replace("_","")                               // remove underscores
                     .replace(/\ba +([aeio])/g, "an $1")            // a -> an
                     .replace(/  +/g,' ')                           // remove extra spaces
    }

    else return c.text

}



/*------------------------------------- Construction Instructions -------------------------------------*/

function route(r, choices){
    if (typeof r==='undefined') {
        console.warn('Undefined selector for route function. Picking one of these at random: '+ JSON.stringify(choices))
        return pickOne(choices)
    }

    if (r==='' || r===null) {
        console.warn('Empty selector for route function.')
        return pickOne(choices)
    }

    return choices[r] || choices.rest || ""
}

function choose(){
    var total = 0
    var weights = []
    var values = []
    var argz = typeOf(arguments[0])=="array" ? arguments[0]: arguments

    for(var arg in argz){
        //even numbers need to be the weights (0,2,4,6)
        if(arg%2==0) {
            if(argz[arg]==0) continue
            total += argz[arg]
            weights.push(total)
            values.push(argz[parseInt(arg)+1])
        }
    }
    var rand = Math.random()*total
    for (var w=0; w<weights.length; w++){
        if(weights[w] > rand)	return values[w]
    }
}

//assumes sum of weights <= 1.0
//can return undefined
function choose2 () {
    var rand = Math.random()
    var total = 0
    var weights = []
    var values = []
    var argz = typeOf(arguments[0])=="array" ? arguments[0]: arguments

    for(var arg in argz){
        //even numbers need to be the weights (0,2,4,6)
        var a = parseFloat(argz[arg])

        if(arg%2==0) {
            if(a==0) continue
            total += a
            weights.push(total)
            values.push(argz[parseInt(arg)+1])
        }
    }

    for (var w=0; w<weights.length; w++){
        if(weights[w] > rand)	return values[w]
            }
}

//take a restriction object and return just the ones specified in 'pdgms'
//if a paradigm hasn't been specified then add a random choice for it
//according to the global probabilities settings
function decide(r, pdgms, filter){
    var out_r = filter ? {} : r //filter==true removes all restrictions except the ones passed in to pdgms

    pdgms = pdgms.split(',')

    $.each(pdgms, function (index, pdm){

        if (!goodVal(r[pdm])) { //gotta choose one at random, sort of

            var pdm_list = _.clone(probabilities[pdm])
            for (var i=1; i<pdm_list.length; i+=2){

                var pval = pdm_list[i]
                var prohib = prohibitions.descend(pdm, pval)
                if ( collide(prohib,r) ) pdm_list[i-1] = 0

            }
            out_r[pdm] = choose(pdm_list)

        } else { //keep the existing value
            out_r[pdm] = r[pdm]
        }

        if (out_r[pdm]===undefined) console.warn("Could not decide '"+pdm+"'.")
    })

    return out_r
}

//clear out all possible troublesome properties from a restriction object
function safe(r){
    var rr = _.clone(r)
    delete rr.name
    delete rr.proto
    delete rr.prohibitions
    delete rr.complements
    delete rr.inflections

    delete rr.inflected
    delete rr.type

    delete rr.label
    delete rr.text

    rr = _.omit(rr, function(x){
        return typeof x == 'object' || typeof x == 'function'
    })

    return rr
}

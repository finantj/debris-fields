/**
 * @module DEER Data Encoding and Exhibition for RERUM
 * @author Patrick Cuba <cubap@slu.edu>
 * @author Bryan Haberberger <bryan.j.haberberger@slu.edu>
 * @version 0.7

 * This code should serve as a basis for developers wishing to
 * use TinyThings as a RERUM proxy for an application for data entry,
 * especially within the Eventities model.
 * @see tiny.rerum.io
 */

import { default as UTILS } from './deer-utils.js'
import { default as config } from './deer-config.js'

const changeLoader = new MutationObserver(renderChange)
var DEER = config

/**
 * Observer callback for rendering newly loaded objects. Checks the
 * mutationsList for "deep-object" attribute changes.
 * @param {Array} mutationsList of MutationRecord objects
 */
async function renderChange(mutationsList) {
    for (var mutation of mutationsList) {
        switch (mutation.attributeName) {
            case DEER.ID:
            let id = mutation.target.getAttribute(DEER.ID)
            if (id === "null") return
            let obj = {}
            try {
                obj = JSON.parse(localStorage.getItem(id))
            } catch (err) {}
            if (!obj||!obj["@id"]) {
                obj = await fetch(id).then(response => response.json()).catch(error => error)
                if (obj) {
                    localStorage.setItem(obj["@id"] || obj.id, JSON.stringify(obj))
                } else {
                    return false
                }
            }
            new DeerReport(mutation.target,DEER)
            // TODO: This is too heavy. Create a "populateFormFields" method and call it instead.
            break
            case DEER.LISTENING:
            let listensTo = mutation.target.getAttribute(DEER.LISTENING)
            if(listensTo){
                mutation.target.addEventListener(DEER.EVENTS.CLICKED,e=>{
                    let loadId = e.detail["@id"]
                    if(loadId===listensTo) { mutation.target.setAttribute("deer-id",loadId) }
                })
            }
		}
	}
}

export default class DeerReport {
    constructor(elem,deer={}) {
        for(let key in DEER) {
            if(typeof DEER[key] === "string") {
                DEER[key] = deer[key] || config[key]
            } else {
                DEER[key] = Object.assign(config[key],deer[key])
            }
        }
        this.$isDirty = false
        this.id = elem.getAttribute(DEER.ID)
        this.elem = elem
        this.evidence = elem.getAttribute(DEER.EVIDENCE) // inherited to inputs
        this.context = elem.getAttribute(DEER.CONTEXT) // inherited to inputs
        this.type = elem.getAttribute(DEER.TYPE)
        this.inputs = elem.querySelectorAll(DEER.INPUTS.map(s=>s+"["+DEER.KEY+"]").join(","))
        changeLoader.observe(elem, {
            attributes:true
        })
        elem.oninput = event => this.$isDirty = true
        elem.onsubmit = this.processRecord.bind(this)
        
        if (this.id) {
            //Do we want to expand for all types?
            UTILS.expand({"@id":this.id})
            //What if there are no annotations on it and the things I need to know are already in the object?
            .then((function(obj){
                try {
                    let inputs_no_duplicates = Array.from(this.inputs)
                    let flatKeys = inputs_no_duplicates.map(input => {
                        return input.getAttribute(DEER.KEY)
                    })
                    inputs_no_duplicates = inputs_no_duplicates.filter((inpt, i)=>{
                        //Throw a soft error if we detect duplicate deer-key entries, and only respect the first one.
                        if(flatKeys.indexOf(el.getAttribute(DEER.KEY))!==i){
                            console.warn("Duplicate deer-key '"+inpt.getAttribute(DEER.KEY)+"'' detected.  This one will be ignored and the first instance will be respected upon form submission.")
                            console.log(el)
                            //When this is saved, the same logic will run and the annotation value will only respect the first instance of this key.
                            inpt.setAttribute(DEER.KEY+"-ignored", "true")
                            //Could also remove DEER.KEY, which would make the form submission logic ignore it.  
                            //el.removeAttribute(DEER.KEY)
                        }
                        return flatKeys.indexOf(inpt.getAttribute(DEER.KEY))===i
                    })
                    for(let el of inputs_no_duplicates){
                        let key=el.getAttribute(DEER.KEY)
                        if(key){
                            //Then this is a DEER form input.  Check if an annotation maps to this deer key.
                            el.addEventListener('input', (inpt) => inpt.target.$isDirty = true)
                            if(obj.hasOwnProperty(key)){
                                //Then there is an annotation that maps to this deer key.
                                let assertedValue = UTILS.getValue(obj[key])
                                let containerObjectType = (obj[key].hasOwnProperty("value")) ? obj[key].value.type || obj[key].value["@type"] || "" : "" 
                                let delim = el.getAttribute(DEER.ARRAYDELIMETER) || DEER.DELIMETERDEFAULT || "," //super fail safe
                                let arrayOfValues = []
                                if(Array.isArray(assertedValue)){
                                    /**
                                    //The body value of this annotation is an array.  At the moment, this is unsupported.  DEER saves this kind of data in supported container objects.  
                                    //This would support annotation.body.value : ["like", "this"] 
                                    arrayOfValues = UTILS.cleanArray(assertedValue)
                                    assertedValue = UTILS.stringifyArray(arrayOfValues, delim)
                                    UTILS.assertElementValue(el, assertedValue)
                                    */
                                    UTILS.assertElementValue(el, "")
                                    console.error("We do not support annotation body values that are arrays.  The array of values should be in a container object.  Therefore, the value of annotation is being ignored.  See annotation below.")
                                    console.log(obj[key])
                                } 
                                else if(typeof assertedValue === "object"){
                                    //The body value of this annotation is an object.  Perhaps it is a container object that DEER supports
                                    if(el.getAttribute(DEER.ARRAYTYPE)){
                                        if(el.getAttribute(DEER.ARRAYTYPE) !== containerObjectType){
                                            console.warn("Container type mismatch!.  See attribute '"+DEER.ARRAYTYPE+"'' on element "+el.outerHTML+".  We will force the type found in the annotation seen below.")
                                            console.log(obj[key])
                                            el.setAttribute(DEER.ARRAYTYPE, containerObjectType)
                                        }
                                        arrayOfValues = UTILS.getArrayFromObj(assertedValue)
                                        assertedValue =  UTILS.stringifyArray(arrayOfValues, delim)
                                        UTILS.assertElementValue(el, assertedValue)
                                    } else{
                                        console.error("We do not support annotation body values that are objects, unless they are a supported container object and the element "+el.outerHTML+" notes '"+DEER.ARRAYTYPE+"'.  Therefore, the value of annotation is being ignored.  See annotation below.")
                                        console.log(obj[key])
                                        UTILS.assertElementValue(el, "")
                                    } 
                                    
                                } else if((["string","number"].indexOf(typeof assertedValue)>-1)){
                                    //The body value of this annotation is a string or number that we can grab outright.  
                                    UTILS.assertElementValue(el, assertedValue)
                                } else{
                                    console.error("We do not support values of this type '"+typeof assertedValue+"'.  Therefore, the value of annotation is being ignored.  See annotation below.")
                                    console.log(obj[key])
                                    UTILS.assertElementValue(el, "")
                                }
                                if(obj[key].source) {
                                    el.setAttribute(DEER.SOURCE,UTILS.getValue(obj[key].source,"citationSource"))
                                }
                            } else{
                                //An annotation for this input has not been created yet.
                                if(el.type==="hidden" && el.value !== ""){
                                    //Notice this will not consider hidden inputs with empty values, but perhaps it should?
                                    console.log("Found a hidden element that did not have an annotation for it.  Making it dirty.")
                                    console.log(el.outerHTML)
                                    el.$isDirty = true
                                } 
                            }                              
                        }
                    }
                } catch(err){ console.log(err) }
                UTILS.broadcast(undefined,DEER.EVENTS.LOADED,elem,obj)
            }).bind(this))
            .then(()=>elem.click())
        } else {
            Array.from(this.inputs).filter(el=>el.type==="hidden").forEach(inpt=>inpt.$isDirty = true)
        }
    }
    
    processRecord(event) {
        event.preventDefault()  
        if (!this.$isDirty) {
            console.warn(event.target.id+" form submitted unchanged.")
        }
        if(this.elem.getAttribute(DEER.ITEMTYPE)==="simple") {
            return this.simpleUpsert(event).bind(this).then(entity => {
                this.elem.setAttribute(DEER.ID,entity["@id"])
                new DeerReport(this.elem)
            })
        }
        let record = {
            "@type": this.type
        }
        if(this.context) { record["@context"] = this.context }
        try {
            record.name = this.elem.querySelectorAll(DEER.ENTITYNAME)[0].value
        } catch(err){}
        let formAction
        if (this.id) {
            record["@id"] = this.id
            formAction = Promise.resolve(record)
        } else {
            formAction = fetch(DEER.URLS.CREATE, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json; charset=utf-8"
                },
                body: JSON.stringify(record)
            })
            .then(response => response.json())
            .then(data => data.new_obj_state)
            UTILS.broadcast(undefined,DEER.EVENTS.CREATED,this.elem,record)
        }

        formAction.then((function(entity) {
            let annotations = Array.from(this.elem.querySelectorAll(DEER.INPUTS.map(s=>s+"["+DEER.KEY+"]").join(",")))
            .filter(el=>Boolean(el.$isDirty))
            let flatKeys = annotations.map(input => {
                return input.getAttribute(DEER.KEY)
            })
            annotations.filter((el, i)=>{
                //Throw a soft error if we detect duplicate deer-key entries, and only respect the first one.
                if(flatKeys.indexOf(el.getAttribute(DEER.KEY))!==i){
                    console.warn("Duplicate deer-key '"+el.getAttribute(DEER.KEY)+"'' detected, we will only respect the first value we found.")
                }
                return flatKeys.indexOf(el.getAttribute(DEER.KEY))===i
            })
            .map(input => {
                let inputId = input.getAttribute(DEER.SOURCE)
                let action = (inputId) ? "UPDATE" : "CREATE"
                let annotation = {
                    type: "Annotation",
                    creator: DEER.ATTRIBUTION,
                    target: entity["@id"],
                    body: {}
                }
                let delim = input.getAttribute(DEER.ARRAYDELIMETER) || DEER.DELIMETERDEFAULT
                let val = input.value
                let arrType = input.getAttribute(DEER.ARRAYTYPE)
                //On page load, if there was a mismatch, the attribute was overwritten to be the one from the annotation.  The type here and on the annotation match now, don't check again.
                if(input.hasAttribute(DEER.ARRAYTYPE)){
                    if(DEER.CONTAINERS.indexOf(arrType) > -1){
                        val = val.split(delim)
                        if(["List", "Set", "set","list", "@set", "@list"].indexOf(arrType) > -1){
                            annotation.body[input.getAttribute(DEER.KEY)] = {
                                "@type":arrType,
                                "items":val
                            }
                        } else if(["ItemList"].indexOf(arrType > -1)){
                            annotation.body[input.getAttribute(DEER.KEY)] = {
                                "@type":arrType,
                                "itemListElement":val
                            }
                        }
                    } 
                    else{
                        console.error("Cannot save array value of unsupported type "+arrType+".  This annotation will not be saved or updated.")
                        return false
                        // Could save it as a string instead of failing...
                        // annotation.body[input.getAttribute(DEER.KEY)] = {
                        //     "value":input.value
                        // }
                    }
                } else{
                    annotation.body[input.getAttribute(DEER.KEY)] = {
                        "value":val
                    }
                }  
            
                if(inputId) { annotation["@id"] = inputId }
                // TODO: maybe we need a deer-value to assign things here... or some option...
                if(input.getAttribute(DEER.KEY)==="targetCollection"){
                    annotation.body.targetCollection = input.value
                }
                let ev = input.getAttribute(DEER.EVIDENCE) || this.evidence
                if(ev) { annotation.body[input.getAttribute(DEER.KEY)].evidence = ev }
                let name = input.getAttribute("title")
                if(name) { annotation.body[input.getAttribute(DEER.KEY)].name = name }
                return fetch(DEER.URLS[action], {
                    method: (inputId) ? "PUT" : "POST",
                    headers: {
                        "Content-Type": "application/json; charset=utf-8"
                    },
                    body: JSON.stringify(annotation)
                })
                .then(response=>response.json())
                .then(anno=>input.setAttribute(DEER.SOURCE,anno.new_obj_state["@id"]))
            })
            return Promise.all(annotations).then(()=>entity)
        }).bind(this))
        .then(entity => {
            this.elem.setAttribute(DEER.ID,entity["@id"])
            new DeerReport(this.elem)
        })
    }

    simpleUpsert(event) {
        let record = {
            "@type": this.type
        }
        if(this.context) { record["@context"] = this.context }
        if(this.evidence) { record.evidence = this.evidence }
        try {
            record.name = this.elem.querySelectorAll(DEER.ENTITYNAME)[0].value
        } catch(err){}
        Array.from(this.elem.querySelectorAll(DEER.INPUTS.map(s=>s+"["+DEER.KEY+"]").join(","))).map(input => {
            let key = input.getAttribute(DEER.KEY)
            let val = input.value
            let title = input.getAttribute("title")
            let evidence = input.getAttribute(DEER.EVIDENCE)

            if(title || evidence) {
                val = { "@value" : val }
                if(title) val.name = title
                if(evidence) val.evidence = evidence
            }

            record[key] = (record.hasOwnProperty(key)) 
                ? ((Array.isArray(record[key])) ? record[key].push(val) : [record[key], val])
                : val

            let formId = this.elem.getAttribute(DEER.ID)
            let action = "CREATE"

            if (formId) {
                action = "OVERWRITE"
                record["@id"] = formId
            }

            return fetch(DEER.URLS[action], {
                method: (formId) ? "PUT" : "POST",
                headers: {
                    "Content-Type": "application/json; charset=utf-8"
                },
                body: JSON.stringify(record)
            })
            .then(response=>response.json())
            .then(obj=>input.setAttribute(DEER.ID,obj.new_obj_state["@id"]))
        })
    }
}

/**
 * Generate a new object URI for a resource. Abstract additional
 * properties to annotations.
 * @param {Object} obj complete resource to process
 * @param {Object} attribution creator and generator identities
 */
async function create(obj, attribution, evidence) {
    let mint = {
        "@context": obj["@context"] || this.default.context,
        "@type": obj["@type"] || this.default.type,
        "name": this.getValue(obj.name || obj.label) || this.default.name,
        "creator": attribution || this.default.creator
    }
    if (evidence) {
        mint.evidence = evidence
    }
    const newObj = await fetch(CREATE_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify(mint)
    })
    .then(this.handleHTTPError)
    .then(response => response.json())
    const listID = localStorage.getItem("CURRENT_LIST_ID") || this.DEFAULT_LIST_ID
    let list = await get(listID)
    const objID = newObj.new_obj_state["@id"]
    list.resources.push({
        "@id": objID,
        "label": newObj.new_obj_state.name
    })
    try {
        list = await fetch(UPDATE_URL, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json; charset=utf-8"
            },
            body: JSON.stringify(list)
        })
        .then(this.handleHTTPError)
        .then(response => response.json().new_obj_state)
        .catch(err => Promise.reject(err))
    } catch (err) {}
    localStorage.setItem(list["@id"], JSON.stringify(list))
    localStorage.setItem("CURRENT_LIST_ID", list["@id"])
    let annotations = []
    for (var key of Object.keys(obj)) {
        if (["@context", "@type", "name"].indexOf(key) > -1) {
            continue
        }
        let annotation = {
            "@context": "",
            "@type": "Annotation",
            "motivation": "describing",
            "target": objID,
            "body": {}
        }
        annotation.body[key] = obj[key]
        if (attribution) {
            annotation.creator = attribution
        }
        if (evidence) {
            annotation.evidence = evidence
        }
        annotations.push(annotation)
    }
    // just enforcing the delay
    let temp = await Promise.all(annotations.map(upsert))
    return newObj.new_obj_state
}

export function initializeDeerForms(config) {
    const forms = document.querySelectorAll(config.FORM)
    const formArray = Array.from(forms)
    Array.from(forms).forEach(elem => new DeerReport(elem,config))
    document.addEventListener(DEER.EVENTS.NEW_FORM,e => Array.from(e.detail.set).forEach(elem=>new DeerReport(elem,config)))
}
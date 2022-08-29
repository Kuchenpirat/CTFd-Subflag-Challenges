// creates a array to store the ids of all used hints
var used_hints = [];

CTFd.plugin.run((_CTFd) => {
    const $ = _CTFd.lib.$
    const md = _CTFd.lib.markdown()
    $(document).ready(function() {
        // run insert_subflags when the page is loaded
        insert_subflags();
    });
});

// inserts the subflags
function insert_subflags(){
    // fetches the information needed from the backend
    $.get("/api/v1/get_subflag_upgrade_info", {'id': CHALLENGE_ID }).done( function(data) {
        // pushed the id of all subflags into an array
        let order_array = [];
        Object.keys(data).forEach(key => {
            order_array.push(key);
        });
        // orders the ids based on the order of the subflags
        order_array.sort(function(a,b){return data[a]["order"] - data[b]["order"]});
        let len = order_array.length;
        // for all subflags
        for (let i = 0; i < len; i++) {
            // temp save for needed variables
            let id = order_array[i];
            let name = data[id].name;
            let key = data[id].key;
            let order = data[id].order;

            // creates html code to append a hint to the specified subflag section
            // displays: subflag id, subflag solution, subflag order, button to update the subflag, button to delete the subflag, button to add a hint to the subflag
            let keys = `<div id="subflag` + id + `">
                            <form id="subflag_update_form" onsubmit="submit_subflag_update(${id}, event)">
                                <label> 
                                    Subflag ID: ` + id + `<br>
                                </label>
                                <small class="form-text text-muted">
                                    The Subflag Name:
                                </small>
                                <input type="text" class="form-control chal" name="subflag_name" value="` + name + `" required>
                                <small class="form-text text-muted">
                                    The Subflag Key:
                                </small>
                                <input type="text" class="form-control chal" name="subflag_key" value="` + key + `" required>
                                <small class="form-text text-muted">
                                    The Subflag Order:
                                </small>
                                <input type="text" class="form-control chal" name="subflag_order" value="` + order + `" step="1" required>

                                <div class="row" style="margin-top: 12px; margin-bottom: 15px;">
                                    <div class="col-md-6" style="text-align:left;">
                                        <button class="btn btn-theme btn-outlined" id="add-new-subflag" type="submit">
                                            Update Subflag
                                        </button>
                                    </div>
                                    <div class="col-md-6" style="text-align:right;" >
                                        <button type="button" class="btn btn-outline-danger" data-toggle="tooltip" title="delete Subflag" id="challenges-delete-button" data-original-title="Delete Subflag" onclick="delete_subflag(` + id + `)">
                                            <i class="btn-fa fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                </div>
                            </form>
                            <div id="subflaghints` + id + `">
                                <label> Attached Hints: </label>
                            </div>
                            <div style="text-align:center;">
                                <button class="btn btn-theme btn-outlined" id="add_hint` + id + `" onclick="add_hint(` + id + `)">
                                    Add new Hint
                                </button>
                            </div>
                            <hr style="border-top: 1px solid grey;">
                        </div>`;
            $("#subflags").append(keys);

            // calls funtion to add hint to the subflag
            insert_subflag_hints(id, data[id]["hints"])
        }
    });
}

// inserts the hints for a specified subflag
// inputs: subflag id; array containing objects composed of hint_id: (order, content)
function insert_subflag_hints(subflag_id, subflag_hintdata){
        // orders the array of objects according to the order of the hints
        let order_array = [];
        Object.keys(subflag_hintdata).forEach(key => {
            order_array.push(key);
        });
        order_array.sort(function(a,b){return subflag_hintdata[a]["order"] - subflag_hintdata[b]["order"]});
        
        // inserts a div placeholder for the hint beneath the subflag
        for (let i = 0; i< order_array.length; i++){
            let hint_id = order_array[i];
            let insert = `<div id = subflag_hint_` + hint_id + `> </div>`
            $("#subflaghints" + subflag_id).append(insert);
        }

        // gets a list of all hints including the content of the hint 
        $.get("/api/v1/challenges/" + CHALLENGE_ID + "/hints").done(function(data) {
            let hintdata = data.data;
            // for all hints to the 
            for (let i = 0; i < order_array.length; i++){
                // create temp variables for needed data
                let hint_id = order_array[i];
                let hint_order = subflag_hintdata[hint_id].order;
                let hint_content = hintdata.filter(hint => hint.id == hint_id)[0].content;
                
                // pushes the id of the hint to the array of used hints
                used_hints.push(parseInt(hint_id));

                // creates html code to append a hint to the specified subflag section
                // displays: hint content, hint id, hint order, detach button
                let insert =   `<small class="form-text text-muted">
                                    Hint Content: 
                                </small>
                                <p> ` + hint_content + ` </p>
                                <div class="row">
                                    <div class="col-md-4" style="text-align:left;">
                                        <small class="form-text text-muted">
                                            Hint ID: 
                                        </small>
                                        <p> ` + hint_id + ` </p>
                                    </div>
                                    <div class="col-md-4" style="text-align:center;">
                                        <small class="form-text text-muted">
                                            Hint Order: 
                                        </small>
                                        <p> ` + String(hint_order) + ` </p>
                                    </div>
                                    <div class="col-md-4" style="text-align:right;">
                                        <small class="form-text text-muted">
                                            Detach Hint:
                                        </small>
                                        <button type="button" class="btn btn-outline-danger" data-toggle="tooltip" title="delete Hint" id="hint_deattach_button" data-original-title="Deattach Hint" onclick="remove_hint(` + hint_id + `)">
                                            <i class="btn-fa fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                </div>
                                <hr>`;
                $("#subflag_hint_" + hint_id).append(insert);
            }
        });
}

// function to submit the changes made to a subflag
// inputs: event from the update form containing: subflag id, name, key, order
function update_subflag(subflag_id, event){
    event.preventDefault();
    let params = $(event.target).serializeJSON(true);
    console.log(subflag_id);
    console.log(params);
    // calls api endpoint to update the subflag with the form input fields
    CTFd.fetch(`/api/v1/subflags/${subflag_id}`, {
        method: "PATCH",
        body: JSON.stringify(params)
    })
        .then((response) => response.json())
        .then((data) => {
            if (data.success) {
                location.reload();
            }
            else {
                console.log(data);
                alert("something went wrong!");
            }
        });
}

// function to delete a subflag
// input: subflag id
function delete_subflag(subflag_id){
    // calls api endpoint to delete a subflag with the subflag id
    CTFd.fetch(`/api/v1/subflags/${subflag_id}`, {
        method: "DELETE",
    })
        .then((response) => response.json())
        .then((data) => {
            if (data.success) {
                location.reload();
            }
            else {
                console.log(data);
                alert("something went wrong!");
            }
        });
}

//function to add a subflag
function add_subflag() {
    // defines the parameters to create a new challenge with
    let params = {
        challenge_id: window.CHALLENGE_ID, 
        subflag_name: "CHANGE ME",
        subflag_key: "CHANGE ME",
        subflag_order: 1
    }

    // calls api endpoint to create a new challenge with the name and key "CHANGE_ME" and order 0 and then reloads the page
    CTFd.fetch("/api/v1/subflags", {
        method: "POST",
        body: JSON.stringify(params)
    })
        .then((response) => response.json())
        .then((data) => {
            if (data.success) {
                location.reload();
            }
            else {
                console.log(data);
                alert("something went wrong!");
            }
        });
}

// adds fields to attach a new hint to a specific subflag
// inputs: subflag id
function add_hint(subflag_id) {
    let element = document.getElementById("add_hint" + subflag_id);
    element.parentNode.removeChild(element);

    // allows the player to select a hint from the available hints and define the order in which the hint will be displayed in relation to other hints
    $.get("/api/v1/challenges/" + CHALLENGE_ID + "/hints").done( function(data){
        let insert= `<form id = "add_hint` + subflag_id + `" onsubmit="attach_hint(event)">
                        <small class="form-text text-muted">
                            Choose a Hint:
                        </small>
                        <select id="subflag_hint_select_` + subflag_id + `" name="hint_id" form="add_hint`+ subflag_id + `" class="form-control" required>
                            <option value="" disabled selected>Select One Hint from the list</option>
                        </select>
                        
                        <small class="form-text text-muted">
                            Enter a Hint Order
                        </small>
                        <div class="row">
                            <div class="col-md-9" style="text-align:left;">
                                <input type="text" class="form-control chal" name="hint_order" step="1" placeholder="Enter Integer Number" required>
                            </div>
                            <div class="col-md-3" style="text-align:right;">
                                <button class="btn btn-theme btn-outlined" type="submit">
                                    Add
                                </button>
                            </div>
                        </div>
                        <input type="text" name="subflag_id" value="` + subflag_id + `" hidden>
                    </form>`;  
        $("#subflaghints" + subflag_id).append(insert);

        // populates the hint selector with hints that are not yet already used in other subflags 
        Object.keys(data.data).forEach(key => {
            if ( used_hints.includes(data.data[key].id) == false ){
                $("#subflag_hint_select_" + subflag_id).append($("<option />").val(data.data[key].id).text(data.data[key].content));
            }
        });
    });
}

// attaches a hint to a subflag
// inputs: html form event containing the hint id, subflag id and hint order
function attach_hint(event) {
    // prevents to submit button to jump to the specified page
    event.preventDefault();
    const params = $(event.target).serializeJSON(true); 
    // calls the api endpoint to attach a hint to a subflag
    $.get("/api/v1/attach_subflag_hint", {"hint_id": params["hint_id"], "subflag_id": params["subflag_id"], "hint_order": params["hint_order"]}).done(function(data){
        location.reload();
    });
}

// removes a hint from a subflag
// inputs: hint id
function remove_hint(hint_id) {
    // calls api endpoint that removes the hint from the subflag with the hint id
    $.get("/api/v1/remove_subflag_hint", {"hint_id": hint_id}).done(function(data){
        // reloads the page
        location.reload();
    });
}
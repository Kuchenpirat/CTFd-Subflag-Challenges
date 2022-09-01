CTFd._internal.challenge.data = undefined;

// TODO: Remove in CTFd v4.0
CTFd._internal.challenge.renderer = null;

CTFd._internal.challenge.preRender = function() {};

// TODO: Remove in CTFd v4.0
CTFd._internal.challenge.render = null;

CTFd._internal.challenge.postRender = function() {
    // assigns ids to the original html hint element 
    assign_hint_ids();
    // insert the subflags into the view
    insert_subflags();
}

// assigns ids to the original html hint element
function assign_hint_ids(){
    // identifies the hint div by class
    let hints = document.getElementsByClassName("col-md-12 hint-button-wrapper text-center mb-3");
    let len = hints.length
    for (let i = 0; i < len; i++) {
        // gets the hint id from the custom "data-hint-id" attribute
        let hint_id = "hint_" + hints[i].children[0].getAttribute("data-hint-id")
        // sets the attribute id to the hint id
        hints[i].setAttribute('id', hint_id);
    }
}

// inserts the subflags into the view
function insert_subflags(){
    // gets the challenge id from the CTFd lib
    let challenge_id = parseInt(CTFd.lib.$('#challenge-id').val())

    // gets the info needed for the subflag view from the api endpoint
    $.get(`/api/v1/subflags/challenges/${challenge_id}/view`).done( function(data) {

        // creates an array of subflag ids and sorts them according to their order
        let order_array = [];
        Object.keys(data).forEach(key => {
            order_array.push(key)
        });
        order_array.sort(function(a,b){
            return data[a]["order"] - data[b]["order"];
        });

        // insert subflags headline if at least one subflag exists
        if (order_array.length > 0) {
            $("#subflags").append("<h5>Main Flag:</h5>");
        }
        

        // goes through the list of subflag ids
        for (let i = 0; i < order_array.length; i++) {
            // temp subflag variables (id, desc, whether the subflag is solved by the current team)
            let id = order_array[i];
            let desc = data[id].desc;
            let subflag_solved_by_me = data[id].solved

            // if the subflag is already soved -> insert a disabled form field with lightgreen background and an delete button 
            if (subflag_solved_by_me) {
                var keys = `<form id="subflag_form` + id + `">
                        <small class="form-text text-muted">
                            Subflag Description:  ` + desc + `
                        </small> 
                        <div class="row" style="margin-bottom: 10px;">
                            <div class="col-md-9">
                                <input type="text" class="form-control chal-subflag_key" name="answer" placeholder="solved subflag" style="background-color:#f5fff1;" disabled>
                            </div>
                            <div class="col-md-2" style="text-align:right; margin-top: 6px;">
                                <button type="button" class="btn btn-outline-danger" "data-toggle="tooltip" title="delete Submission" id="challenges-delete-button" data-original-title="Delete Subflag" onclick="delete_subflag_submission(` + id + `)">
                                    <i class="btn-fa fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>
                    </form>
                    <div id="subflag_hints_` + id + `"> </div>`;
            // if the subflag is not yet solved -> insert a formfield with a submit button
            } else {
                var keys = `<form id="subflag_form` + id + `" onsubmit="submit_subflag(event, ${id})">
                    <small class="form-text text-muted">
                        Subflag Description:  ` + desc + `
                    </small>
                    <div class="row">
                        <div class="col-md-9 form-group">
                            <input type="text" class="form-control chal-subflag_key" name="answer" placeholder="Subflag" required>
                        </div>
                        <div class="col-md-3 form-group" id=submit style="margin-top: 6px;">
                            <input type="submit" value="Submit" class="btn btn-md btn-outline-secondary float-right">
                        </div>
                    </div>
                </form>
                <div id="subflag_hints_` + id + `"> </div>`;
          }      
          $("#subflags").append(keys);      
          
          // creates an array of hint ids and sorts them according to their order
          let hintdata = [];
          Object.keys(data[id].hints).forEach(key => {
              hintdata.push(key);
          });
          hintdata.sort(function(a,b){
              return data[id].hints[a].order - data[id].hints[b].order;
          });
          
          // calls a function to move the hints to the according position
          move_subflag_hints(id, hintdata);
        }
    });
}

// moves the original hint html element to the right position beneath the subflag
// input: subflag id, hintdata: array of hint ids
function move_subflag_hints(subflag_id, hintdata) {
    for (let i = 0; i < hintdata.length; i++) {
        // move the element
        document.getElementById("subflag_hints_" + subflag_id).appendChild( document.getElementById("hint_" + hintdata[i]) );
    }  
}

// function to submit a subflag solution (gets called when the player presses submit)
// input: form event containing: subflag id, answer
function submit_subflag(event, subflag_id) {
    event.preventDefault();
    const params = $(event.target).serializeJSON(true);

    // calls the api endpoint to attach a hint to a subflag
    CTFd.fetch(`/api/v1/subflags/solve/${subflag_id}`, {
      method: "POST",
      body: JSON.stringify(params)
  })
      .then((response) => response.json())
      .then((data) => {
          if (data.data.solved) {
              location.reload();
          }
          else {
              console.log(data);
              alert("wrong answer!");
          }
      });
}

// function to delete a correct subflag answer
// input: subflag id
function delete_subflag_submission(subflag_id){
    // calls the api endpoint to post a solve attempt to a subflag
    CTFd.fetch(`/api/v1/subflags/solve/${subflag_id}`, {
        method: "DELETE"
    })
        .then((response) => response.json())
        .then((data) => {
            if (data.success) {
                location.reload();
            }
            else {
                console.log(data);
                alert("wrong answer!");
            }
        });
}

CTFd._internal.challenge.submit = function (preview) {
    var challenge_id = parseInt(CTFd.lib.$('#challenge-id').val())
    var submission = CTFd.lib.$('#challenge-input').val()

    var body = {
        'challenge_id': challenge_id,
        'submission': submission,
    }
    var params = {}
    if (preview) {
        params['preview'] = true
    }

    return CTFd.api.post_challenge_attempt(params, body).then(function (response) {
        if (response.status === 429) {
            // User was ratelimited but process response
            return response
        }
        if (response.status === 403) {
            // User is not logged in or CTF is paused.
            return response
        }
        return response
    })
};

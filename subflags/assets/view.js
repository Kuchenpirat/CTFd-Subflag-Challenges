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
  $.get("/api/v1/get_subflag_view_info", {'id': challenge_id }).done( function(data) {
    // inserts a div to insert the subflags into
    $("#subflags_block").append(`<div id="subflags" name="subflags"></div>`)

    // creates an array of subflag ids and sorts them according to their order
    let order_array = [];
    Object.keys(data).forEach(key => {
      order_array.push(key)
    });
    order_array.sort(function(a,b){
      return data[a]["order"] - data[b]["order"];
    });

    // goes through the list of subflag ids
    for (let i = 0; i < order_array.length; i++) {
      // temp subflag variables (id, name, whether the subflag is solved by the current team)
      let id = order_array[i];
      let name = data[id].name;
      let subflag_solved_by_me = data[id].solved

      // if the subflag is already soved -> insert a disabled form field with lightgreen background and an delete button 
      if (subflag_solved_by_me) {
        var keys = `<form id="subflag_form` + id + `" onsubmit="submit_subflag_function(event)">
                      <small class="form-text text-muted">
                        Subflag Name:  ` + name + `
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
        var keys = `<form id="subflag_form` + id + `" onsubmit="submit_subflag_function(event)">
                      <small class="form-text text-muted">
                        Subflag Name:  ` + name + `
                      </small>
                      <div class="row">
                        <div class="col-md-9 form-group">
                          <input id="subflag-id" name="subflag_id" type="hidden" value=` + id + `>
                          <input type="text" class="form-control chal-subflag_key" name="answer" placeholder="Subflag" required>
                        </div>
                        <div class="col-md-3 form-group" id=submit_subflag style="margin-top: 6px;">
                          <input type="submit" value="Submit" class="btn btn-md btn-outline-secondary float-right" id="submit_subflag" >
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
function submit_subflag_function(event){
  // prevents default form behaviour 
  event.preventDefault();
  const params = $(event.target).serializeJSON(true);
  // temp save for variables used
  let subflag_id = params["subflag_id"];
  let answer = params["answer"];

  // calles the api endpoint to submit a solution with the subflag id and answer and reloads the page
  $.get("/api/v1/solve_subflag", {'subflag_id': subflag_id, 'answer': answer}).done( function(data) {              
      location.reload();
  });
}

// function to delete a correct subflag answer
// input: subflag id
function delete_subflag_submission(subflag_id){
  // calls api endpoint to delete a correct solution from the database and reloads the page
  $.get("/api/v1/delete_subflag_submission", {'subflag_id': subflag_id}).done( function(data) {
    location.reload();
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

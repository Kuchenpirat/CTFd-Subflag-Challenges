CTFd.plugin.run((_CTFd) => {
    const $ = _CTFd.lib.$
    const md = _CTFd.lib.markdown()
})

// Adds counter for the number of the subflags
var count = 0;

// Adds input fields for Description, flag, order when the button "Add Subflags" is clicked
// Uses count to differentiate betweet subflags
$("#add-new-subflag").click(function () {
    var key = `<div class="form-group">
                  <label>Subflag</label>
                  <input type="text" class="form-control" name="subflag_desc[` + count + `]" placeholder="Enter Subflag Description">
                  <input type="text" class="form-control" name="subflag_solution[` + count + `]" placeholder="Enter Subflag Solution">
                  <input type="number" class="form-control" name="subflag_order[` + count + `]" placeholder="Enter Subflag Order" step="1">
               </div>`
    $('#subflag_list').append(key);
    count += 1;
});

$(document).ready(function(){
    $('[data-toggle="tooltip"]').tooltip();
});
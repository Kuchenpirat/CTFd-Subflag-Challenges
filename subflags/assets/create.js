CTFd.plugin.run((_CTFd) => {
    const $ = _CTFd.lib.$
    const md = _CTFd.lib.markdown()
})

//adds a count for the number of subflags
var count = 0;

//adds three form input fields (name, flag, order) when the button "Add Subflags" is pressed
//uses count to differentiate betweet subflags
$("#add-new-subflag").click(function () {
    var key = `<div class="form-group">
                  <label>Subflag</label>
                  <input type="text" class="form-control" name="subflag_name[` + count + `]" placeholder="Enter Subflag Name">
                  <input type="text" class="form-control" name="subflag_solution[` + count + `]" placeholder="Enter Subflag Solution">
                  <input type="number" class="form-control" name="subflag_order[` + count + `]" placeholder="Enter Subflag Order" step="1">
               </div>`
    $('#subflag_list').append(key);
    count += 1;
});

$(document).ready(function(){
    $('[data-toggle="tooltip"]').tooltip();
});
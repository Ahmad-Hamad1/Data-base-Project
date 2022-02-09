$(document).ready(function(){
    $('#input_22').on('change', function() {
      if ( this.value == 'C1'||this.value=='C2')
      //.....................^.......
      {
        $("#test").show();
		$("#input_18").prop('required',true);
		$("#input_25").prop('required',true);
		$("#input_33").prop('required',true);
		$("#input_35").prop('required',true);
      }
      else
      {
        $("#test").hide();
		$("#input_18").prop('required',false);
		$("#input_25").prop('required',false);
		$("#input_33").prop('required',false);
		$("#input_35").prop('required',false);
      }
    });
});
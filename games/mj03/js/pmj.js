"use strict";
//const urlParams = new URLSearchParams(window.location.search);
import * as Ws from './ws.js';
import * as PSt from './pst.js';
import * as PUI from './pui.js';

function sample() {

}

// Function that executes jQuery code after page load is complete
$(document).ready(function(){
    //let a_start = document.getElementById("a_start");
    //a_start.addEventListener("click", pre_puzzle);

    //Ws.init(WsOptions);

    PUI.init(); // initializes unplayed tile grid

    // Stub tile set for testing
    PSt.setHand(0, {u:["CN", "FA", "BB"], s:[], r:false});
    PUI.refreshHand(0);
});

export {
    sample,
};

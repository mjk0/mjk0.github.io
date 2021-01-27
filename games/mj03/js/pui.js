"use strict";
//const urlParams = new URLSearchParams(window.location.search);
import * as PSt from './pst.js';
import * as PUnpl from './punpl.js';

function onResize() {
    PUnpl.updateGrid();
}

function refreshHand(seat) {
    if (seat == PSt.ourSeat) {
        PUnpl.refreshUnplayed();
    }
}

function init() {
    // Initialize modal dialogs
    //elems = document.querySelectorAll('.modal');
    //instances = M.Modal.init(elems, {}); // materialize init
    $('.modal').modal(); // jQuery init

    PUnpl.init();
    window.addEventListener("resize", onResize);
    PUnpl.updateGrid(); // calc grid sizes
}

export {
    init, refreshHand,
}

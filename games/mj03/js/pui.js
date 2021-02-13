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

// Set or clear "hide-me" class on element
function set_visibility(selector, bool) {
    if (bool) {
        $(selector).show();
    } else {
        $(selector).hide();
    }
}

// Update visual status for WebSocket connection state
function showWsOn(bool) {
    document.getElementById("ws-status").innerHTML
     = (bool ? 'verified_user' : 'sync_problem');
}

function init() {
    // Initialize modal dialogs
    //elems = document.querySelectorAll('.modal');
    //instances = M.Modal.init(elems, {}); // materialize init
    $('.modal').modal(); // jQuery init

    // Initialize drop-down menus
    let elems = document.querySelectorAll('#sidenav-r');
    M.Sidenav.init(elems, { edge: 'right' });
    $(".dropdown-trigger").dropdown({ coverTrigger: false }); // nav-bar drop-down

    PUnpl.init();
    window.addEventListener("resize", onResize);
    PUnpl.updateGrid(); // calc grid sizes
}

export {
    init, refreshHand, showWsOn,
}

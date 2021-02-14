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

// Set(1) or clear(0), or toggle(-1) "hide-me" class on element
function set_visibility(id, boolish) {
    if (boolish < 0) {
        document.getElementById(id).classList.toggle("hide-me");
    } else if (boolish) {
        document.getElementById(id).classList.remove("hide-me");
    } else {
        document.getElementById(id).classList.add("hide-me");
    }
}
function is_visible(id) {
    return !document.getElementById(id).classList.contains("hide-me");
}

// Update visual status for WebSocket connection state
function showWsOn(bool) {
    document.getElementById("ws-status").innerHTML
     = (bool ? 'verified_user' : 'sync_problem');
}

// Show the chat window, and clear any chat msg animation
function chatShow(boolish) {
    document.getElementById("chat-icon").classList.remove("chatMsg");
    set_visibility('chatWindow', boolish);
}
function chatIncoming(text) {
    if (!is_visible('chatWindow')) {
        document.getElementById("chat-icon").classList.add("chatMsg");
    }
    let seat =  (/^\d\//.test(text)? parseInt(text.charAt(0)) : 0);
    let t2 = "ESWN".charAt(seat) + text.substring(1);
    let p = document.createElement("p");
    p.classList.add('seat'+seat, 'chatBubble');
    if (seat == PSt.ourSeat) {
        p.classList.add('right');
    }
    p.innerHTML = t2;
    let cl = document.getElementById('chatLog');
    cl.appendChild(p);
    cl.scrollTop = cl.scrollHeight; // scroll to bottom if needed
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
    init, refreshHand, showWsOn, chatShow, chatIncoming,
}

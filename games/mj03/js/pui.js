"use strict";
//const urlParams = new URLSearchParams(window.location.search);
import * as PSt from './pst.js';
import * as PUnpl from './punpl.js';

function onResize() {
    PUnpl.refreshGrid();
}

// Refresh our unplayed tiles
function refreshUnplayed() { PUnpl.refreshUnplayed(); }

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
    let seat =  (/^\d\//.test(text)? parseInt(text.charAt(0)) : -1);
    let t2 = (seat >= 0 ? "ESWN".charAt(seat) + text.substring(1) : text);
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

// From a comma-sep string of tile names ("F1,F2"), create SVGs as innerHTML
function mkTileSvg(tiles, repeatCnt) {
    let r = '';
    let syms = tiles.split(',');
    for (let i=0; i < repeatCnt; ++i) {
        for (const sym of syms) {
            r += '<svg class="tile-m"><use href="media/stiles.svg#'+sym+'"/></svg>';
        }
    }
    return r;
}
// Show the played tiles for one or more players
function refreshPlayed(ibase, num) {
    for (let ib = ibase; ib < ibase+num; ib++) {
        let ig = ib & 0x3; // game positions (0=East), i.e. PSt.hands[ig]
        let iv = (ib+4 - PSt.ourSeat) & 0x3; // view positions (0=bottom)
        if (iv > 0) {
            // other players, not the local player at the bottom of the view
            let elem = document.getElementById('tilesp'+iv);
            let html = '';
            for (const set of PSt.hands[ig].sets) {
                // each set consists of: {"s":"F1,F2","secret":0}
                if (set.s.length > 0) {
                    if (set.secret) {
                        html += '<div class="tile-set tile-set-secret">';
                    } else {
                        html += '<div class="tile-set">';
                    }
                    html += mkTileSvg(set.s, 1) + '</div>';
                }
            }
            // show unplayed tiles, if any (none for winner)
            if (PSt.hands[ig].nu > 0) {
                html += mkTileSvg("UT", PSt.hands[ig].nu);
            }
            elem.innerHTML = html; // clear old contents
        }
    }
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
    //PUnpl.updateGrid(); // calc grid sizes
}

export {
    init, refreshPlayed, refreshUnplayed,
    showWsOn, chatShow, chatIncoming,
}

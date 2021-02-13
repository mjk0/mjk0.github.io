// Mj State objects and methods
"use strict";

const urlParams = new URLSearchParams(window.location.search);

var hands = []; // hand 0 is East, then S, W, N. {u:["CN", "FA", "BB"], s:[[]], r:false}
var ourGame = null;
var ourSeat = 0;
var username = null;
var uuid = null;
var email = null;

function getUrlParam(name, def) {
    let value = urlParams.get(name);
    return (value === null) ? def : value;
}

function setHand(i, h) {
    if (i >= 0 && i < 4) {
        hands[i] = h;
    } else {
        console.error("setHand(%d,%s) out of bounds", i, JSON.stringify(h));
    }
}

function isSameSuitConsecutive(arr, i) {
    return (tileSuit(arr[i]) == tileSuit(arr[i+1]))
}
function tileSuit(tile) {
    if (tile == "CN" || tile == "FA" || tile == "BB") {
        return 'N';
    } else {
        return tile.charAt(0); // 'O', 'B', 'M', 'W', 'N', 'F'
    }
}

// {"action":"sitat","game":"Marcel","seat":2} // server ack of seat request being granted
function rcvSitAt(data) {
    if ('game' in data && data.game) {
        ourGame = data.game;
    }
    if ('seat' in data && data.seat) {
        ourSeat = parseInt(data.seat);
    }
}

function getSessionInfo() {
    username = sessionStorage.getItem("mj_username") || null;
    uuid = sessionStorage.getItem("mj_uuid") || null;
    email = sessionStorage.getItem("mj_email") || null;
    ourGame = sessionStorage.getItem("mj_game") || null;
    ourSeat = sessionStorage.getItem("mj_seat") || 0;
}
function init() {
    getSessionInfo();
}

export {
    hands, ourGame, ourSeat, username, uuid, email,
    init, getUrlParam, setHand, isSameSuitConsecutive, tileSuit,
    rcvSitAt, getSessionInfo,
};

// Mj State objects and methods
"use strict";

const urlParams = new URLSearchParams(window.location.search);

var players = []; // player 0 is East
var hands = []; // hand 0 is East, then S W N. {nu:3, r:0, sets:[{"s":"","secret":0}]}
var unplayed = []; // unplayed tiles, e.g. ["CN", "FA", "BB"]
var curr = {}; // current position, wind, and dealer
var ourGame = null;
var ourSeat = 0;
var username = null;
var uuid = null;
var email = null;
var plays = {'allowDiscard': false, 'more': [], tile:"", src:-1, resp:[]};

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
function setUnplayed(arr) { unplayed = arr; }

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

// {"action":"players","seats":[null,null,"Marcel",null]}
function rcvPlayers(data) {
    if (data.hasOwnProperty("seats")) {
        players = data.seats;
    }
}

// {"action":"hands","ibase":0,"h":[
//   {"sets":[{"s":"","secret":0}],"nu":13,"r":0},
//   {"sets":[{"s":"","secret":0}],"nu":13,"r":0},
//   {"sets":[{"s":"","secret":0}],"nu":13,"r":0},
//   {"sets":[{"s":"","secret":0}],"nu":13,"r":0}]}
function rcvHands(data) {
    let ibase = data.ibase || 0;
    if (ibase == 0 && data.h.length == 4) {
        hands = data.h;
    } else {
        for (let i = 0; i < data.h.length; i++) {
            hands[(ibase+i)&0x3] = data.h[i];
        }
    }
}
// {"action":"unplayed","seat":2,"u":"O2,O3,O4,B5,B7,B8,B8,M2,M6,WW,WN,FA,BB"}
function rcvUnplayed(data) {
    if (data.seat == ourSeat) {
        setUnplayed(data.u.split(','));
    } else {
        console.error("Unplayed for wrong seat");
    }
}

// {"action":"current","pos":0,"wind":0,"dealer":0}
function rcvCurrent(data) {
    curr.pos = data.pos;
    curr.wind = data.wind;
    curr.dealer = data.dealer;
}

function isOurTurn() { return (curr.pos == ourSeat) }
function isDiscardCycle() { return (plays.resp[curr.pos] == "discard");}
function isOtherDiscard() { return !isOurTurn() && isDiscardCycle();}

// in-hand: {"action":"tileplay","tile":"","src":-1,"pc":["discard"]}
// i-h-tail: {"action":"tileplay","tile":"","src":-2,"pc":["tail"]}
// dis-play: {"action":"tileplay","tile":"FA","src":1,"pc":["chah","draw"]}
// dis-resp: {"action":"tileplay","tile":"","src":1,"pc":["chah"]}
function tpIsDiscardTile(data) {
    return (data.tile.length > 0 && data.src >= 0);
}
function tpIsDiscardResponse(data) {
    return (data.tile.length == 0 && data.src >= 0);
}
function rcvTilePlay(data) {
    let playchoices = data.pc;
    if (tpIsDiscardResponse(data)) {
        // This is just a discard play response from another player
        plays.resp[data.src] = playchoices[0];
    } else {
        const idiscard = playchoices.indexOf("discard");
        plays.allowDiscard = (idiscard >= 0);
        if (plays.allowDiscard) {
            // remove discard, since handled differently than other plays
            playchoices.splice(idiscard, 1);
        }
        plays.more = playchoices;
        plays.tile = data.tile;
        plays.src = data.src;
        plays.resp.length = 0; // clear out old responses
        if (tpIsDiscardTile(data)) {
            plays.resp[plays.src] = "discard";  // mark last play
        }
    }
}
// Play has advanced to a new current position
// {"action":"tplayres","tile":"M8","pos":2,"pc":"draw"}
function rcvTPlayRes(data) {
    curr.pos = data.pos;
    plays.tile = data.tile;
    plays.resp.length = 0; // clear out old responses
    plays.resp[curr.pos] = data.pc;
}

function getSessionInfo() {
    username = sessionStorage.getItem("mj_username") || null;
    uuid = sessionStorage.getItem("mj_uuid") || null;
    email = sessionStorage.getItem("mj_email") || null;
    ourGame = sessionStorage.getItem("mj_game") || null;
    ourSeat = parseInt(sessionStorage.getItem("mj_seat") || 0);
}
function init() {
    getSessionInfo();
}

export {
    players, ourGame, ourSeat, username, uuid, email,
    hands, unplayed, curr, plays,
    init, getUrlParam, getSessionInfo,
    setHand, setUnplayed, isSameSuitConsecutive, tileSuit,
    isOurTurn, isDiscardCycle, isOtherDiscard, tpIsDiscardTile,
    rcvSitAt, rcvPlayers, rcvHands, rcvUnplayed, rcvCurrent,
    rcvTilePlay, rcvTPlayRes,
};

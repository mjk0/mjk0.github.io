// Mj State objects and methods
"use strict";

const urlParams = new URLSearchParams(window.location.search);

var players = []; // player 0 is East
var hands = []; // hand 0 is East, then S W N. {nu:3, r:0, sets:[{"s":"","secret":0}]}
var unplayed = {full:[], add:[], sub:[]}; // unplayed tiles, e.g. ["CN", "FA", "BB"]
var curr = {}; // current position, wind, and dealer
var ourGame = null;
var ourSeat = 0;
var username = null;
var uuid = null;
var email = null;
var plays = {'allowDiscard': false, 'more': [], tile:"", src:-1, resp:[]};
var recentDiscards = Array(4).fill("backwhite"); // last 4 discards
var allDiscards = {latest:null, viewing:null}; // {v:"...", deck:"..."}
var allScores = null; // 
var scoring = null; // save scoring info for UI, in case of player name change at game end
var diffFlags = {addedFlower:false, addedSet:false};

// Tile sort order that is used by the server
const tile2u = {
    O1:0x11, O2:0x12, O3:0x13, O4:0x14, O5:0x15, O6:0x16, O7:0x17, O8:0x18, O9:0x19,
    B1:0x21, B2:0x22, B3:0x23, B4:0x24, B5:0x25, B6:0x26, B7:0x27, B8:0x28, B9:0x29,
    M1:0x31, M2:0x32, M3:0x33, M4:0x34, M5:0x35, M6:0x36, M7:0x37, M8:0x38, M9:0x39,
    WE:0x41, WS:0x42, WW:0x43, WN:0x44,
    CN:0x51, FA:0x52, BB:0x53,
    F1:0x61, F2:0x62, F3:0x63, F4:0x64, F5:0x65, F6:0x66, F7:0x67, F8:0x68,
};
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
// Receive a new unplayed hand array
function setUnplayed(arr) {
    let i = 0, j = 0; // current index for old array, new array
    // Diff from previous unplayed.  Both must be sorted
    unplayed.add = [];
    unplayed.sub = [];
    while (i < unplayed.full.length && j < arr.length) {
        if (unplayed.full[i] == arr[j]) {
            ++i; // equal, skip to next
            ++j;
        } else {
            // Get server sort order for tile comparison
            let uu = tile2u[unplayed.full[i]] || 0;
            let ua = tile2u[arr[j]] || 0;
            if (uu < ua) { // older set tile missing from new set
                unplayed.sub.push(unplayed.full[i]);
                ++i;
            } else { // new set tile to add
                unplayed.add.push(arr[j]);
                ++j;
            }
        }
    }
    // remainders:
    if (j < arr.length) {
        // push all remaining arr[j..] to add
        Array.prototype.push.apply(unplayed.add, arr.slice(j));
    } else if (i < unplayed.full.length) {
        // push all remaining unplayed.full[i..] to sub
        Array.prototype.push.apply(unplayed.sub, unplayed.full.slice(i));
    }
    unplayed.full = arr;
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

// {"action":"players","seats":[null,null,"Marcel",null]}
function rcvPlayers(data) {
    if (data.hasOwnProperty("seats")) {
        players = data.seats;
    }
}

// Save complete scoring message for UI
function rcvScoring(data) {
    scoring = data; // save data for UI
    allScores = null; // clear cached series score results
    allDiscards.latest = null; // Allow viewing deck after win
}

// {"action":"hands","ibase":0,"h":[
//   {"sets":[{"s":"","secret":0}],"nu":13,"r":0},
//   {"sets":[{"s":"","secret":0}],"nu":13,"r":0},
//   {"sets":[{"s":"","secret":0}],"nu":13,"r":0},
//   {"sets":[{"s":"","secret":0}],"nu":13,"r":0}]}
function rcvHands(data) {
    let ibase = data.ibase || 0;
    if (ibase == 0 && data.h.length == 4) {
        diffPlayed(data.h[ourSeat]); // diff new vs existing
        hands = data.h;
    } else {
        for (let i = 0; i < data.h.length; i++) {
            const ig = (ibase+i)&0x3;
            if (ig == ourSeat) {diffPlayed(data.h[i]);}
            hands[ig] = data.h[i];
        }
    }
}
// Diff our new played hand vs. previous
function diffPlayed(h) {
    if (hands[ourSeat] != null) {
        // Diff total number of sets, and length of flower set
        const sd = h.sets.length - hands[ourSeat].sets.length;
        const fd = Math.floor((1+ h.sets[0].s.length - hands[ourSeat].sets[0].s.length)/3);
        diffFlags.addedFlower |= (sd == 0 && fd == 1);
        diffFlags.addedSet |= (sd == 1 && fd == 0);
    }
}
function clearDiffPlayed() {
    diffFlags.addedFlower = false;
    diffFlags.addedSet = false;
}
function hasAddedSet() {return diffFlags.addedSet}
function hasAddedFlower() {return diffFlags.addedFlower}

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
    curr.gameEnded = false;
    clearDiscards(); // clear recent discards
    scoring = null; // clear scoring
    clearDiffPlayed(); // new hand, show no diffs
}

// {"action":"reshuffle","why":"woo/reshuffle/Deck is empty"}
function rcvReshuffle(data) {
    curr.gameEnded = true;
}

function hasGameEnded() { return curr["gameEnded"] || false }
function isOurTurn() { return (curr.pos == ourSeat) }
function isDiscardCycle() { return (plays.resp[curr.pos] == "discard");}
function isOtherDiscard() { return !isOurTurn() && isDiscardCycle();}

// in-hand: {"action":"tileplay","tile":"","src":-1,"pc":["discard"]}
// i-h opt: {"action":"tileplay","tile":"","src":-1,"pc":[{"gngsecret":"B1"},{"gngsecret":"M1"},"discard"]}
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
            addDiscard(plays.tile);
        }
    }
}
function addDiscard(tile) {
    allDiscards.latest = null; // flush cache of full-game discards
    recentDiscards.push(tile);
    while (recentDiscards.length > 4) recentDiscards.shift();
}
function clearDiscards() { recentDiscards = Array(4).fill("backwhite") }
// Up to 4 most recent discards
// {"action":"discardl4","v":"WW-0,WN-1,WSp2,B5-3"}
function rcvDiscardL4(data) {
    clearDiscards();
    data.v.split(',').forEach((v,i) => addDiscard(v.substr(0,2)));
}
function rcvDiscards(data) { allDiscards.latest = data; }
function rcvScoreHist(data) { allScores = data; }

// Play has advanced to a new current position
// {"action":"tplayres","tile":"M8","pos":2,"pc":"draw"}
function rcvTPlayRes(data) {
    curr.pos = data.pos;
    plays.tile = data.tile;
    plays.resp.length = 0; // clear out old responses
    plays.resp[curr.pos] = data.pc;
}
// In-hand Gng* plays appear as objects in plays.more.
// Returns array of Gng*
// i-h opt: {"action":"tileplay","tile":"","src":-1,
//           "pc":[{"gngsecret":"B1"},{"gngsecret":"M1"},"discard"]}
function getInHandGngPlays() {
    return plays.more.filter(v => {
        return typeof v === 'object' && v !== null
    });
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
    hands, unplayed, curr, plays, scoring,
    recentDiscards, allDiscards, allScores,
    init, getUrlParam, getSessionInfo,
    setHand, setUnplayed, isSameSuitConsecutive, tileSuit,
    isOurTurn, isDiscardCycle, isOtherDiscard, hasGameEnded,
    tpIsDiscardTile, tpIsDiscardResponse, addDiscard,
    getInHandGngPlays,
    clearDiffPlayed, hasAddedFlower, hasAddedSet,
    rcvSitAt, rcvPlayers, rcvHands, rcvUnplayed, rcvCurrent,
    rcvTilePlay, rcvTPlayRes, rcvScoring, rcvScoreHist,
    rcvDiscards, rcvDiscardL4, rcvReshuffle,
};

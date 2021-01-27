// Mj State objects and methods
"use strict";

var hands = []; // hand 0 is East, then S, W, N. {u:["CN", "FA", "BB"], s:[[]], r:false}
var ourSeat = 0;

// Location of unplayed tile in workspace grid, and grid dimensions
var unplayed = {nw:0, nh:2, coords:[] };

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

export {
    hands, ourSeat, unplayed,
    setHand, isSameSuitConsecutive, tileSuit,
};

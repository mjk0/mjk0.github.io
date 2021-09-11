"use strict";
import * as Ws from './ws.js';
import * as PSt from './pst.js';
import * as PUI from './pui.js';
const params = {
    'auto': PSt.getUrlParam('auto', true),
};

const WsOptions = {
    serverBase: "wss://pizzamonster.org:3031/games/mahjong/",
    serverUrl: "wss://pizzamonster.org:3031/games/mahjong/",
    autoReconnectInterval: 5000, // in milliseconds
    'onClose': wsOnClose,
    'online' : netOnOnline,
    'offline': netOnOffline,
    actionHandlers: {
        'sitat': rcvSitAt,
        'err':   rcvErr,
        'chat':  rcvChat,
        'redo':  rcvReDo,
        'players': rcvPlayers,
        'hands':   rcvHands,
        'unplayed': rcvUnplayed,
        'current' : rcvCurrent,
        'tileplay': rcvTilePlay,
        'tplayres': rcvTPlayRes,
        'scoring' : rcvScoring,
        'scorehist': PUI.rcvScoreHist,
        'reshuffle': rcvReshuffle,
        'discardl4': rcvDiscardL4, // up to 4 most recent discards
        'discards': PUI.rcvDiscards,
        'waiton'  : rcvWaitOn,
        'shutdown': rcvShutdown, // game forcibly ended
    },
};

const UiOptions = {
    'dragDiscard' : uicbDiscard,
};

function loginAndSit() {
    // login and SitAt are only valid on WebSocket connection
    // In case this is a re-connect, clear any queued messages
    Ws.wsClrSendQ();
    Ws.sendMsg({"action":"login", "username":PSt.username, "email":(PSt.email||"")});
    console.log('sitAt("%s", %s)', PSt.ourGame, PSt.ourSeat);
    Ws.sendMsg({"action":"sitat", "game":PSt.ourGame, "seat":parseInt(PSt.ourSeat)}); // response from server triggers UI refresh
}
function rcvSitAt(data) { // server confirmation of seat request
    PSt.rcvSitAt(data);
    PUI.refreshPlayerDirs(); // show which seat is E, S, W, N
    PUI.showWsOn(true);
}
function rcvErr(data) {
    if (data.err == "authenticate") {
        if (params.auto) {
            document.location.href = "./";
        } else {
            console.log('Must signin again');
            console.log('document.location.href = "./"');
            WsOptions.autoReconnectInterval = 0; // prevent auto-reconnect
        }
    }
}
function rcvChat(data) {
    PUI.chatIncoming(data.text); // notify user of incoming chat message
}
function chatsubmit(event) {
    let chat = document.getElementById('chattext');
    Ws.sendMsg({"action":"chat", "text": chat.value});
    chat.value = '';
    event.preventDefault();
}

// List of seated players for this game
function rcvPlayers(data) {
    PSt.rcvPlayers(data);
    PUI.refreshPlayerNames();
}
// Played sets for one or more players
function rcvHands(data) {
    PSt.rcvHands(data);
    PUI.refreshPlayed(data.ibase || 0, data.h.length);
}
// Unplayed tiles in our hand
function rcvUnplayed(data) {
    PSt.rcvUnplayed(data);
    if (PUnpl.isDiscardUnpSub()) {
        // our discard confirmation.  Gen fake TilePlay action:
        PSt.rcvTilePlay({"action":"tileplay","pc":[],
            "tile":PSt.unplayed.sub[0],"src":PSt.ourSeat
        });
        //PSt.addDiscard(tile); // addDiscard done by rcvTilePlay
        PUI.refreshDiscardHistBtn();
        PUI.refreshDiscardTile(); // update tile SVG
        PUI.refreshDiscard(); // show tile for local hand (view0)
        PUI.refreshThinking(); // show thinking for others
    }
    PUI.refreshUnplayed();
}
// Current position, wind, and dealer
function rcvCurrent(data) {
    PSt.rcvCurrent(data);
    PUI.refreshCurrWind();
    PUI.refreshCurrDealer();
    PUI.refreshDiscardHistBtn(); // discards were cleared
    PUI.clearGameEndScoring();
    PUnpl.rmPlayedAndUnplayedAnims();
}
function rcvDiscardL4(data) { // up to 4 most recent discards
    PSt.rcvDiscardL4(data);
    PUI.refreshDiscardHistBtn();
}
function rcvTilePlay(data) {
    PSt.rcvTilePlay(data);
    if (PSt.tpIsDiscardTile(data)) {
        PUI.refreshDiscardTile();
    }
    if (!PSt.tpIsDiscardResponse(data)) {
        PUI.setViewTilePlay();
    }
    PUI.refreshDiscard();
    PUI.refreshThinking();
}
function rcvTPlayRes(data) {
    PSt.rcvTPlayRes(data);
    PUI.refreshDiscard();
    PUI.refreshThinking();
    if (data.pc == "woo") {
        PUI.playResultWoo();
    }
}
function rcvScoring(data) {
    PSt.rcvScoring(data);
    PUI.refreshScoring();
}
function rcvReshuffle(data) {
    PSt.rcvReshuffle(data); // UI updates when WaitOn arrives
}
function rcvWaitOn(data) {
    PUI.rcvWaitOn(data); // Only relevant to UI
}
function rcvReDo(data) {
    PUI.rcvReDo(data); // UI only for now
}
// {"action":"shutdown"}
function rcvShutdown(data) {
    PUI.gameShutdown();
}

// Set the WebSocket URL to include our connection UUID
function wsUuidInit() {
    WsOptions.serverUrl = WsOptions.serverBase + PSt.uuid;
    Ws.init(WsOptions);
}
function wsOnClose() {
    PUI.showWsOn(false);
    if (WsOptions.autoReconnectInterval > 0) {
        console.log('%s: Auto reconnect in %d ms',
            (new Date()).toLocaleTimeString(), WsOptions.autoReconnectInterval);
        setTimeout(loginAndSit, WsOptions.autoReconnectInterval);
    }
}
function netOnOffline() {
    PUI.showWsOn(false); // offline, just show not connected
    console.log('%s: offline', (new Date()).toLocaleTimeString());
}
function netOnOnline() {
    PUI.showWsOn(false); // show WebSocket disconnected until reconnect attempt
    console.log('%s: online', (new Date()).toLocaleTimeString());
}

// Send TilePlay msg for current player
function wsSendTilePlay(play, tile) {
    Ws.sendMsg({
        "action":"tileplay", "tile":tile,
        "src":PSt.ourSeat,"pc":[play]
    });
}
function playNt(play) { // send given play with no tile
    wsSendTilePlay(play,"");
    PUnpl.rmPlayedAndUnplayedAnims();
}
function playWt(pnum) { // send given play with tile from child SVG
    const gngt = PSt.getInHandGngPlays();
    if (pnum < gngt.length) {
        let tiles = Object.values(gngt[pnum]);
        if (tiles.length != 1) {
            console.error('invalid Gng play,',gngt[pnum]);
        } else {
            wsSendTilePlay(gngt[pnum], tiles[0]);
        }
    } else {
        console.error('Invalid Gng play number,', pnum, gngt);
    }
    PUnpl.rmPlayedAndUnplayedAnims();
}
function playAgain() { // send reshuffle
    Ws.sendMsg({"action":"reshuffle", "why":"playagain"});
}
function askRobotPlay(pos) { // ask robot to take over for a missing human
    Ws.sendMsg({"action":"robotplay", "pos":pos});
}
function reqUndo(offset) {
    Ws.sendMsg({"action":"redo", offset, "v":[]});
}
function reqScoreHist() {
    if (PSt.allScores == null) {
        Ws.sendMsg({"action":"scorehist", "h":[]});
    } else {
        PUI.showScoreHist();
    }
}
function reqDiscardHist() {
    if (PSt.allDiscards.latest == null) {
        Ws.sendMsg({"action":"discards", "v":"", "deck":""});
    } else {
        PUI.showDiscards();
    }
}

/// UI callbacks
function uicbDiscard(tile) {
    console.log("Discard %s", tile);
    wsSendTilePlay("discard", tile);
    PSt.markDiscardInProgress();
    PUI.setViewTilePlay(); // remove discard and optional play choices
    PUnpl.rmPlayedAndUnplayedAnims();
}

// Function that executes jQuery code after page load is complete
$(document).ready(function(){
    //let a_start = document.getElementById("a_start");
    //a_start.addEventListener("click", pre_puzzle);

    PSt.init();
    wsUuidInit();

    PUI.init(UiOptions); // initializes unplayed tile grid

    // Stub tile set for testing
    PSt.setUnplayed(["CN", "FA", "BB"]);
    PSt.setHand(PSt.ourSeat, {nu:PSt.unplayed.full.length, sets:[{s:"",secret:0}], r:false});
    PUI.refreshUnplayed();

    // Initiate login and seating at running game
    loginAndSit();
});

export {
    loginAndSit, chatsubmit, playNt, playWt, playAgain,
    askRobotPlay, reqUndo, reqScoreHist, reqDiscardHist,
};

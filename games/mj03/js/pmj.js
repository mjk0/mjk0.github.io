"use strict";
import * as Ws from './ws.js';
import * as PSt from './pst.js';
import * as PUI from './pui.js';
const params = {
    'auto': PSt.getUrlParam('auto', true),
};

const WsOptions = {
    serverBase: "ws://localhost:3030/games/mahjong/",
    serverUrl: "ws://localhost:3030/games/mahjong/",
    autoReconnectInterval: 5000, // in milliseconds
    'onClose': wsOnClose,
    'online' : netOnOnline,
    'offline': netOnOffline,
    actionHandlers: {
        'sitat': rcvSitAt,
        'err':   rcvErr,
        'chat':  rcvChat,
        'players': rcvPlayers,
        'hands':   rcvHands,
        'unplayed': rcvUnplayed,
        'current' : rcvCurrent,
        'tileplay': rcvTilePlay,
        'tplayres': rcvTPlayRes,
        'waiton'  : rcvWaitOn,
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
    PUI.refreshUnplayed();
}
// Current position, wind, and dealer
function rcvCurrent(data) {
    PSt.rcvCurrent(data);
    PUI.refreshCurrWind();
    PUI.refreshCurrDealer();
}
function rcvTilePlay(data) {
    PSt.rcvTilePlay(data);
    if (PSt.tpIsDiscardTile(data)) {
        PUI.refreshDiscardTile();
    }
    PUI.showPlaySelection();
    PUI.showDiscard();
    PUI.showThinking();
}
function rcvTPlayRes(data) {
    PSt.rcvTPlayRes(data);
    // TODO: show new current player, and last play (draw, Po, ...)
    PUI.showDiscard();
    PUI.showThinking();
}
function rcvWaitOn(data) {
    PUI.rcvWaitOn(data); // Only relevant to UI
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
}
function playWt(play) { // send given play with tile from child SVG
    let tile = PUI.getSvgTileString(window.event.target);
    if (tile.length > 0) {
        wsSendTilePlay(play, tile);
    } else {
        console.error('No SVG tile?', window.event.target);
    }
}

/// UI callbacks
function uicbDiscard(tile) {
    console.log("Discard %s", tile);
    wsSendTilePlay("discard", tile);
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
    PSt.setHand(PSt.ourSeat, {nu:PSt.unplayed.length, s:[], r:false});
    PUI.refreshUnplayed();

    // Initiate login and seating at running game
    loginAndSit();
});

export {
    loginAndSit, chatsubmit, playNt, playWt,
};

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
    actionHandlers: {
        'sitat': rcvSitAt,
        'err':   rcvErr,
        'chat':  rcvChat,
        'hands': rcvHands,
        'unplayed':  rcvUnplayed,
    },
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
    console.log(data);
    PSt.rcvSitAt(data);
    PUI.showWsOn(true);
}
function rcvErr(data) {
    console.log(data);
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
    console.log(data);
    PUI.chatIncoming(data.text); // notify user of incoming chat message
}
function chatsubmit(event) {
    let chat = document.getElementById('chattext');
    Ws.sendMsg({"action":"chat", "text": chat.value});
    chat.value = '';
    event.preventDefault();
}

// Played sets for one or more players
function rcvHands(data) {
    console.log(data);
    PSt.rcvHands(data);
    PUI.refreshPlayed(data.ibase || 0, data.h.length);
}
// Unplayed tiles in our hand
function rcvUnplayed(data) {
    console.log(data);
    PSt.rcvUnplayed(data);
    PUI.refreshUnplayed();
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

// Function that executes jQuery code after page load is complete
$(document).ready(function(){
    //let a_start = document.getElementById("a_start");
    //a_start.addEventListener("click", pre_puzzle);

    PSt.init();
    wsUuidInit();

    PUI.init(); // initializes unplayed tile grid

    // Stub tile set for testing
    PSt.setUnplayed(["CN", "FA", "BB"]);
    PSt.setHand(PSt.ourSeat, {nu:PSt.unplayed.length, s:[], r:false});
    PUI.refreshUnplayed();

    // Initiate login and seating at running game
    loginAndSit();
});

export {
    loginAndSit, chatsubmit,
};

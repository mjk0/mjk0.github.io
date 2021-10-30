"use strict";
//const urlParams = new URLSearchParams(window.location.search);
import * as Ws from './ws.js';
import * as St from './st.js';
import * as LUI from './lui.js';

const WsOptions = {
    serverUrl: "wss://pizzamonster.org:3031/games/mahjong/login",
    autoReconnectInterval: 5000, // in milliseconds
    'onClose': wsOnClose,
    'online' : netOnOnline,
    'offline': netOnOffline,
    actionHandlers: {
        'suuid': rcvUuid,
        'games': rcvGames,
        'users': rcvUsers,
        'series': rcvSeries,
        'privinv': rcvPrivInv,
        'scorehist': rcvScoreHist,
        'sitat': rcvSitAt,
        'err':   rcvErr,
    },
};

var seriesHistorySeriesID = 0; // for use by reqScoreHist()

function rcvUuid(data) {
    // if UUID is valid, also set username & email with login value
    St.rcvUuid(
        data,
        LUI.uname_dom().value || COpts.get("mj_username"),
        LUI.email_dom().value || COpts.get("mj_email") || ""
    );
    LUI.welcome_username();
    LUI.set_sign_in_state(St.uuid); // truthy values enable post-sign-in UI
}
function rcvErr(data) {
    if (data.err == "username_taken") { // login attempt failed, but can try again
        LUI.sign_in_err_state_email();
        St.clrUuid(); // sets to null
    } else if (data.err == "authenticate") {
        LUI.set_sign_in_state(false);
        try_autologin();
    } else if (data.err == "duplicate_login") {
        let username = St.username;
        St.clrUuid(); // sets to null
        LUI.set_sign_in_state(false);
        LUI.playerEviction(username);
    }
}

function signOut() {
    St.clrUuid(); // sets to null
    Ws.close(); // since uuid now null, won't trigger auto-login
    LUI.set_sign_in_state(St.uuid); // falsy values enable sign-in UI
}

function rcvGames(data) {
    St.rcvGames(data);
    LUI.update_games_display();
    goPlayIfGameStarted();
}
function goPlayIfGameStarted() {
    // If our game has started, jump to game play URL
    if (St.hasOurGameStarted()) {
        document.location.href = "./play.html";
    }
}
function startGame() {
    if (St.ourGame && St.ourSeat >= 0) {
        Ws.sendMsg({"action":"start"});
    } else {
        alert("Select a seat before starting the game");
    }
}

function rcvSeries(data) {
    St.rcvSeries(data);
    LUI.update_games_display();
}
function seriesResume(sid) {
    Ws.sendMsg({"action":"serresume", "id":parseInt(sid)});
}
function seriesDelete(sid) {
    Ws.sendMsg({"action":"serdel", "id":parseInt(sid)});
}

function sitAt(game, seat) {
    console.log('sitAt('+game+', '+seat+')');
    Ws.sendMsg({"action":"sitat", game, seat}); // response from server triggers UI refresh
}
function rcvSitAt(data) { // server confirmation of seat request
    St.rcvSitAt(data);
    LUI.update_games_display(); // start button now enabled on our game
    goPlayIfGameStarted();
}
function rcvPrivInv(data) {
    St.rcvPrivInv(data); // {"action":"privinv","list":["Marcel"]}
}
function privCreate() {
    Ws.sendMsg({"action":"privcreate"}); // response from server triggers UI refresh
}
function gameKill(game) {
    Ws.sendMsg({"action":"gkill", game}); // response from server triggers UI refresh
}
// Open private invite dialog
function privInvite() {
    LUI.update_invites_display();
    M.Modal.getInstance(document.getElementById("diaInvite")).open();
}
// Forget a previously invited player
function privForget(u) {
    const inv = LUI.get_priv_invite_selection(); // remember selected checkboxes
    St.setPastInvited(inv);
    St.privForget(u); // also unchecks if it was selected
    LUI.update_invites_display(); // refresh dialog table
    Ws.sendMsg({'action':'privforget', u});
}
// On invite dialog close, send selections to server
function privInviteSelected() {
    const inv = LUI.get_priv_invite_selection(); // invited list
    St.setPastInvited(inv);
    Ws.sendMsg({'action':'privinv', 'list': inv});
}
function reqScoreHist(game, sid) {
    seriesHistorySeriesID = sid;
    Ws.sendMsg({'action':'serhist', game, 'id': sid});
}

// {"action":"scorehist","h":[...]}
function rcvScoreHist(data) {
    var players = [...CUI.rplayers];
    if (St.series.hasOwnProperty(seriesHistorySeriesID)) {
        St.series[seriesHistorySeriesID].order.forEach((p,i) => {
            if (i< 4 && p.length > 0) players[i] = p;
        });
    }
    CUI.rcvScoreHist(data, players); // Display score history dialog
}

function rcvUsers(data) {
    St.rcvUsers(data);
    LUI.update_users_display();
}

function wsOnClose() {
    // schedule try_autologin if previously authenticated
    if (St.uuid && WsOptions.autoReconnectInterval > 0) {
        console.log('%s: Auto reconnect in %d ms',
            (new Date()).toLocaleTimeString(), WsOptions.autoReconnectInterval);
        setTimeout(try_autologin, WsOptions.autoReconnectInterval);
    }
}
function netOnOffline() { // offline
    console.log('%s: offline', (new Date()).toLocaleTimeString());
}
function netOnOnline() { // back online
    console.log('%s: online', (new Date()).toLocaleTimeString());
}

// If already had been assigned a UUID, try auto-login
function try_autologin() {
    let mjuname = COpts.get("mj_username");
    let mjuuid = COpts.get("mj_uuid");
    let mjemail = COpts.get("mj_email") || "";
    if (mjuname && mjuuid) {
        // login is only valid on WebSocket connection
        // In case this is a re-connect, clear any queued messages
        Ws.wsClrSendQ();
        Ws.sendMsg({"action":"login", "username":mjuname, "email":mjemail});
    }
}

function submit(e) {
    e.preventDefault();
    LUI.sign_in_err_state_clear()
    let unameDom = LUI.uname_dom();
    let emailDom = LUI.email_dom();
    if (unameDom.value == null || unameDom.value == "") {
        // Missing username.  Highlight field
        LUI.sign_in_err_state_username();
    } else {
        // Try to get UUID from server
        let email = emailDom.value || "";
        Ws.sendMsg({"action":"login", "username":unameDom.value, "email":email});
    }
    return false;
}


// Function that executes after DOM construction is complete
document.addEventListener('DOMContentLoaded', function(){
  try {
    COpts.init(WsOptions); // modifies serverUrl if needed
    Ws.init(WsOptions);
    LUI.init();

    LUI.set_sign_in_state(false); // start with sign-in UI
    if (COpts.isTester) { // testing
        COpts.set("mj_uuid", "fake_uuid");
    }
    try_autologin();
  } catch (err) {
    const errs = document.getElementById("errs");
    errs.innerText = err.message;
  }
});

export {
    submit, signOut, sitAt, startGame, gameKill,
    seriesResume, seriesDelete, reqScoreHist,
    privCreate, privInvite, privInviteSelected, privForget,
};

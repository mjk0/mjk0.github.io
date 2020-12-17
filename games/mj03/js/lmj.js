"use strict";
//const urlParams = new URLSearchParams(window.location.search);
import * as Ws from './ws.js';
import * as St from './st.js';
import * as LUI from './lui.js';

const WsOptions = {
    serverUrl: "ws://localhost:3030/games/mahjong/login",
    actionHandlers: {
        'suuid': rcvUuid,
        'games': rcvGames,
        'users': rcvUsers,
        'privinv': rcvPrivInv,
        'sitat': rcvSitAt,
        'err':   rcvErr,
    },
};

function rcvUuid(data) {
    // if UUID is valid, also set username & email with login value
    St.rcvUuid(
        data,
        LUI.uname_dom().value || sessionStorage.getItem("mj_username"),
        LUI.email_dom().value || sessionStorage.getItem("mj_email") || ""
    );
    LUI.welcome_username();
    LUI.set_sign_in_state(St.uuid); // truthy values enable post-sign-in UI
}
function rcvErr(data) {
    if (data.err == "username_taken") { // login attempt failed, but can try again
        LUI.sign_in_err_state_email();
        St.clrUuid(); // sets to null
    }
}

function signOut() {
    Ws.close();
    St.clrUuid(); // sets to null
    LUI.set_sign_in_state(St.uuid); // falsy values enable sign-in UI
}

function rcvGames(data) {
    St.rcvGames(data);
    LUI.update_games_display();
}
function sitAt(game, seat, elem) {
    console.log('sitAt('+game+', '+seat+', '+ elem +')');
    Ws.sendMsg({"action":"sitat", game, seat}); // response from server triggers UI refresh
}
function rcvSitAt(data) { // server confirmation of seat request
    St.rcvSitAt(data);
    LUI.update_games_display(); // start button now enabled on our game
}
function rcvPrivInv(data) {
    St.rcvPrivInv(data); // {"action":"privinv","list":["Marcel"]}
}
function privCreate() {
    Ws.sendMsg({"action":"privcreate"}); // response from server triggers UI refresh
}
function privKill() {
    Ws.sendMsg({"action":"privkill"}); // response from server triggers UI refresh
}
// Open private invite dialog
function privInvite() {
    LUI.update_invites_display();
    $('#diaInvite').modal('open');
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

function rcvUsers(data) {
    St.rcvUsers(data);
    LUI.update_users_display();
}

// If already had been assigned a UUID, try auto-login
function try_autologin() {
    let mjuname = sessionStorage.getItem("mj_username");
    let mjuuid = sessionStorage.getItem("mj_uuid");
    let mjemail = sessionStorage.getItem("mj_email") || "";
    if (mjuname && mjuuid) {
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


// Function that executes jQuery code after page load is complete
$(document).ready(function(){
    //let a_start = document.getElementById("a_start");
    //a_start.addEventListener("click", pre_puzzle);
    Ws.init(WsOptions);
    LUI.init();

    LUI.set_sign_in_state(false); // start with sign-in UI
    try_autologin();
});

export {
    submit, signOut, sitAt,
    privCreate, privKill, privInvite, privInviteSelected, privForget,
};

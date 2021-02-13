// Mj State objects and methods
"use strict";

var games = {};
var users = {}; // {key is username, value is last_seen_time as RFC3339 string or literal "now"}
var username = null;  // sessionStorage or UI field must be confirmed by server
var uuid = null; // our connection key
var ourGame = null;
var ourSeat = -1;
var pastInvited = {}; // keys are usernames, values are bool to show recent inclusion

function rcvUuid(data, uname, email0) {
    if ('uuid' in data && data.uuid) {
        uuid = data.uuid;
        username = uname;
        sessionStorage.setItem("mj_username", username);
        sessionStorage.setItem("mj_uuid", uuid);
        sessionStorage.setItem("mj_email", email0);
    }
    console.info('UUID is ', uuid, 'username is ', username);
}

function clrUuid() {
    uuid = null;
    username = null;
    ourGame = null;
    ourSeat = -1;
    sessionStorage.removeItem("mj_username");
    sessionStorage.removeItem("mj_uuid");
    sessionStorage.removeItem("mj_game");
    sessionStorage.removeItem("mj_seat");
    console.info('UUID is ', uuid);
}

function rcvGames(data) {
    // {"action":"games","g":{
    //      "\t2":{"seats":[null,null,null,null],"status":0,"invited":[]},
    //      "\t1":{"seats":[null,null,null,null],"status":0,"invited":[]}},
    //  "t":"full"}
    if ('g' in data && data.g) {
        if ('t' in data && data.t == 'change') {
            games = Object.assign(games, data.g); // merge diff
        } else {
            games = data.g; // accept full list
        }
    }
    console.info('games: '+ JSON.stringify(games));
}
function isOpen(gname) { return games.hasOwnProperty(gname) && gname.charAt(0) == '\t' }
function isPrivate(gname) { return games.hasOwnProperty(gname) && gname.charAt(0) != '\t' }
function isInvited(gname) {
    let i = -1;
    if (games.hasOwnProperty(gname) &&  games[gname].hasOwnProperty('invited')) {
        let u = username ? username.toLowerCase() : null;
        i = games[gname].invited.findIndex(item => u == item.toLowerCase());
    }
    return i >= 0;
}
// {"action":"sitat","game":"Marcel","seat":2} // server ack of seat request being granted
function rcvSitAt(data) {
    if (data.hasOwnProperty('game')) {
        ourGame = data.game;
        sessionStorage.setItem("mj_game", ourGame);
    }
    if (data.hasOwnProperty('seat') && data.seat >= 0 && data.seat <= 3) {
        ourSeat = data.seat;
        sessionStorage.setItem("mj_seat", ourSeat);
    }
}
function hasOurGameStarted() {
    return (
        username && uuid && ourGame && ourSeat >= 0 // game & seat defined?
        && games[ourGame].seats[ourSeat] == username
        && games[ourGame].status > 0 // game started?
    );
}

function rcvUsers(data) {
    if ('u' in data && data.u) {
        // {"action":"users","u":{"Edge":"now"},"t":"add"}
        if ('t' in data && data.t == 'add') {
            users = Object.assign(users, data.u); // merge diff
        } else if ('t' in data && data.t == 'sub') {
            let nowstr = new Date().toISOString();
            for (const user in data.u) {
                // Mark now as last seen time for exiting users
                users[user] = nowstr;
            }
        } else {
            users = data.u; // accept full list
        }
    }
    console.info('users: '+ JSON.stringify(users));
}

// {"action":"privinv","list":["Marcel"]}
function rcvPrivInv(data) {
    // Check that past invitees are listed
    for (const u of data.list) {
        if (!St.pastInvited.hasOwnProperty(u)) {
            St.pastInvited[u] = false; // init to unchecked
        }
    }
}
function setPastInvited(inv) {
    // Clear previous 'checked' state values
    for (const u in pastInvited) {
        if (pastInvited.hasOwnProperty(u)) { pastInvited[u] = false; }
    }
    for (const u of inv) { pastInvited[u] = true; }
}
function privForget(u) {
    delete pastInvited[u];
}

export {
    games, users, username, uuid, ourGame, ourSeat, pastInvited,
    rcvUuid, clrUuid, rcvGames, isOpen, isPrivate, isInvited, setPastInvited,
    rcvSitAt, rcvUsers, rcvPrivInv, privForget, hasOurGameStarted,
};

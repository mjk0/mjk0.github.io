"use strict";
//const urlParams = new URLSearchParams(window.location.search);
import * as St from './st.js';

var gamepanel, signinpanel;
var notices, userspanel;
var email_placeholder;

function set_sign_in_state(f) { // f is truthy if already signed in
    jshow(gamepanel, f);
    jshow(userspanel, f);
    jshow(signinpanel, !f);
    jshow(notices, !f);
}

function update_users_display() {
    fill_users_table('#userstable', false);
}
function update_invites_display() {
    fill_users_table('#diaInviteUsers', true);
}
function fill_users_table(tbl, hasPriU) {
    const ut = $(tbl);
    ut.empty();  // Clear out previous users list
    const priu = hasPriU ? St.pastInvited : {};
    // Sort by time, with most recent at the beginning
    let ukeys = Object.keys(St.users);
    const now = Date.now();
    ukeys.sort((a, b) => {
        let pria = priu.hasOwnProperty(a) ? 1 : 0;
        let prib = priu.hasOwnProperty(b) ? 1 : 0;
        let ta = St.users[a] == "now" ? now : Date.parse(St.users[a]);
        let tb = St.users[b] == "now" ? now : Date.parse(St.users[b]);
        return (pria == prib) ? tb - ta : prib - pria;
    });
    // Display times for today, or month + day within past year
    let today = new Date();
    today.setHours(0,0,0,0); // beginning of today
    for (const u of ukeys) {
        let ds = St.users[u]; // if "now", use as-is
        if (ds != "now") {
            const ud = new Date(ds);
            if (ud >= today) {
                ds = ud.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
            } else {
                const diffDays = Math.ceil((today - ud) / (1000 * 60 * 60 * 24));
                console.log('diffDays = ', diffDays);
                if (diffDays < 365) {
                    ds = ud.toLocaleString(undefined, {month:'short', day:'numeric'})
                } else {
                    continue; // too old, don't display
                }
            }
        }
        let r = hasPriU ? priv_users_table_row(u, ds) : '<tr><td>'+u+'</td><td>'+ds+'</td></tr>';
        ut.append(r);
    }
    if (hasPriU && ukeys.length <= 1) {
        ut.append('<tr><td colspan="3"><i>no one to invite</i></td></tr>');
    }
}
function priv_users_table_row(u, ds) {
    let pinv = St.pastInvited.hasOwnProperty(u);
    let pchk = pinv && St.pastInvited[u];
    let r = '<tr'+(pinv ? ' class="invitee"' : '')
        +'><td><label class="black-text"><input type="checkbox"'
        +(pchk ? 'checked="checked"' : '')
        +' /><span>'+u+'</span></label></td><td>'
        +ds+'</td><td>'
        +(pinv?'<i class="material-icons iconBtn" onclick="LMj.privForget(\''+u+'\')">delete</i>':'')
        +'</td></tr>';
    return (u == St.username)? '' : r;
}
function get_priv_invite_selection() {
    const inv = []; // invited list
    const q = $('#diaInviteUsers input[type=checkbox]:checked');
    q.each(function(){inv.push($(this).next().text()) });
    return inv;
}

// Update open & private games lists
function update_games_display() {
    const priv = [];
    var gt = $('#opengtable');
    gt.empty();  // Clear out previous games list
    for (const gk in St.games) {
        if (St.games.hasOwnProperty(gk)) {
            if (St.isOpen(gk)) {
                gt.append(addRowGamesDisplay(gk));
            } else if (St.username == gk) {
                priv.unshift(gk); // private game owner, move to first spot
            } else if (St.isInvited(gk)) {
                priv.push(gk); // private game invitee
            }
        }
    }

    // Show private games
    var privt = $('#privgtable');
    privt.empty(); // clear out previous private games list
    priv.forEach( gk => {
        privt.append(addRowGamesDisplay(gk));
    });
    // If we don't have a private game yet.  Offer to create one
    let createBtnVisible = priv.length==0 || priv[0] != St.username;
    jshow('#privCreate', createBtnVisible);
    jshow('#privTableHeading', priv.length > 0); // hide heading if no private games
}

// Show or hide a jQuery object
function jshow(jq, f) {
    if (f) { $(jq).show(); }
    else { $(jq).hide(); }
}

// Create HTML for games table entry.  gk is game name, gd is game data
// gk:"\t2", gd:{"seats":[null,null,null,null],"status":0,"invited":[]}
function addRowGamesDisplay(gk) {
    var r = '<tr><td>'+gk+'</td>';
    var sn = 0;
    for (var s of St.games[gk].seats) {
        r += '<td>'+(s?s:
            '<button class="btn-small" onClick="LMj.sitAt(\''+gk+'\','+sn+',this)">'
            +(St.games[gk].status ? 'join' : 'sit')
            +'</button>' )+'</td>';
        ++sn;
    }
    r += '<td>'+lobbyGameStatus(St.games[gk].status > 0, gk)+'</td>';

    // If this is a private game, show second row for invited list, and possible invite button
    if (St.isPrivate(gk)) {
        // close first row entry with options column
        let own = (gk == St.username);
        r += '<td>'+(own?'<i class="material-icons iconBtn" onclick="LMj.privKill()">delete</i>':'');
        r += '</td></tr>';
        // 2nd row of private game entry
        r += '<tr><td colspan="7" class="bordbot">'
        if (own) {
            r += '<button class="btn-small inviteBtn" type="button"'
                + ' onclick="LMj.privInvite()">Invite</button>';
        } else {
            r += '<b>Invited:</b> ';
        }
        r += St.games[gk].invited.join(', ')+' </td>';
    }
    r += '</tr>'
    return r;
}
function lobbyGameStatus(started, gk) {
    var status;
    if (started) {
        status = 'in progress';
    } else {
        if (gk == St.ourGame) {
            status = '<button class="btn-small btn-floating" type="button"'+
            ' onclick="LMj.startGame()">'+
            '<i class="material-icons play-lg">play_circle_outline</i>' +
            '</button> start';
        } else {
            status = 'not started';
        }
    }
    return status;
}

// Set or clear visible error indicators for this input field
function sign_in_err_state_email() {
    $('#email').addClass('flag-err');
    $('#email')[0].setAttribute('placeholder', 'email address did not match');
}
function sign_in_err_state_username() {
    $('#username').addClass('in-uname');
}
function sign_in_err_state_clear(){
    $('#email').removeClass('flag-err');
    $('#email')[0].setAttribute('placeholder', email_placeholder);
    $('#username').removeClass('in-uname');
}
function uname_dom() { return document.getElementById('username') }
function email_dom() { return document.getElementById('email') }

function init() {
    gamepanel = $('.gamepanel');
    signinpanel = $('.signin');
    notices = $('#changelog');
    userspanel = $('.userspanel');
    email_placeholder = $('#email')[0].getAttribute('placeholder');

    // Initialize modal dialogs
    //elems = document.querySelectorAll('.modal');
    //instances = M.Modal.init(elems, {}); // materialize init
    $('.modal').modal(); // jQuery init
}

export {
    init, set_sign_in_state, uname_dom, email_dom,
    sign_in_err_state_clear, sign_in_err_state_username, sign_in_err_state_email,
    update_games_display, update_users_display,
    update_invites_display, get_priv_invite_selection,
}

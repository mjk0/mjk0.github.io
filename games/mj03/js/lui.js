"use strict";
import * as COpts from './copts.js';
import * as St from './st.js';
import * as CUI from './cui.js';

var email_placeholder;

function set_sign_in_state(f) { // f is truthy if already signed in
    CUI.show_qs('.gamepanel', f);
    CUI.show_qs('.userspanel', f);
    CUI.show_id('signin-right', f);
    CUI.show_qs('.signin', !f);
    CUI.show_id('changelog', !f);
}
function welcome_username() {
    const devs = (COpts.isDev?
        ' <i class="material-icons">beach_access</i>' : ""
    );
    document.getElementById('span_username').innerHTML = St.username+devs;
}
function update_users_display() {
    fill_users_table('userstable', false);
}
function update_invites_display() {
    fill_users_table('diaInviteUsers', true);
}
function fill_users_table(tbl, hasPriU) {
    let ut = '';
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
                //console.log('diffDays = ', diffDays);
                if (diffDays < 365) {
                    ds = ud.toLocaleString(undefined, {month:'short', day:'numeric'})
                } else {
                    continue; // too old, don't display
                }
            }
        }
        let r = hasPriU ? priv_users_table_row(u, ds) : '<tr><td>'+u+'</td><td>'+ds+'</td></tr>';
        ut += r;
    }
    if (hasPriU && ukeys.length <= 1) {
        ut += '<tr><td colspan="3"><i>no one to invite</i></td></tr>';
    }
    document.getElementById(tbl).innerHTML = ut;
}
function priv_users_table_row(u, ds) {
    let pinv = St.pastInvited.hasOwnProperty(u);
    let pchk = pinv && St.pastInvited[u];
    let r = '<tr'+(pinv ? ' class="invitee"' : '')
        +'><td><label class="black-text"><input type="checkbox"'
        +(pchk ? 'checked="checked"' : '')
        +' /><span>'+u+'</span></label></td><td>'
        +ds+'</td><td>'
        +(pinv?'<i class="material-icons iconBtnRed" onclick="LMj.privForget(\''+u+'\')">delete</i>':'')
        +'</td></tr>';
    return (u == St.username)? '' : r;
}
function get_priv_invite_selection() {
    const inv = []; // invited list
    const q = document.querySelectorAll('#diaInviteUsers input[type=checkbox]:checked + span');
    q.forEach(v => inv.push(v.innerHTML));
    return inv;
}

// Update open & private games lists
function update_games_display() {
    const priv = [];
    let gt = '';  // Clear out previous games list
    const openSorted = Object.keys(St.games).sort((a,b)=>{return a-b});
    for (const gk of openSorted) {
        if (St.isOpen(gk)) {
            gt += addRowGamesDisplay(gk);
        } else if (St.username == gk) {
            priv.unshift(gk); // private game owner, move to first spot
        } else if (St.isInvited(gk)) {
            priv.push(gk); // private game invitee
        }
    }
    document.getElementById('opengtable').innerHTML = gt;

    // Show private games
    let privt = ''; // clear out previous private games list
    priv.forEach( gk => {
        privt += addRowGamesDisplay(gk);
    });
    // If we don't have a private game yet.  Offer to create one
    let createBtnVisible = priv.length==0 || priv[0] != St.username;
    CUI.show_id('privCreate', createBtnVisible);
    CUI.show_id('privTableHeading', priv.length > 0); // hide heading if no private games
    document.getElementById('privgtable').innerHTML = privt;

    // Show past series that can be resumed
    let hasVisibleSeries = false;
    let sert = ''; // clear out previous game series list
    Object.keys(St.series).forEach( sid => {
        if (!St.hasSeriesGame(sid)) {
            sert += addRowSeriesDisplay(sid);
            hasVisibleSeries = true;
        }
    });
    document.getElementById('seriesgtable').innerHTML = sert;
    CUI.show_qs('.seriesTable', hasVisibleSeries);
}

// Create HTML for series table entry.
// St.series:{"1":{"order":["Marcel","","",""],"date":"2021-07-30T07:39:49Z"}}
function addRowSeriesDisplay(sid) {
    var r = `<tr><td><button class="btn-ser ser-pulse"
        onClick="LMj.seriesResume(${sid})"><i
        class="material-icons">restore</i>
        </button></td>
    `.trim();
    var extras = []; // if any players after first 4, add here
    St.series[sid].order.forEach((pl, i) => {
        if (i<4) r += '<td>'+ (pl.length > 0? pl : "--") + '</td>';
        else { extras.push(pl) }
    });
    // Show any extras as single entry in 5th spot
    r += '<td class="seriesExtras">'+ extras.join() +'</td>';
    // get date of last game completion
    const date = new Date(St.series[sid].date);
    const ds = date.toLocaleDateString('en-CA'); // 2020-08-19 (year-month-day)
    r += `<td><button class="btn-sscore"
        onClick="LMj.reqScoreHist('',${sid})"><i
        class="material-icons">timeline</i>${ds}
        </button></td>
        <td><i class="material-icons iconBtnRed"
        onclick="LMj.seriesDelete(${sid})">delete</i></td></tr>
    `.trim();
    return r;
}
function seriesDisplayName(sid) {
    var r = [];
    if (St.series.hasOwnProperty(sid)) St.series[sid].order.forEach(v => {
        if (v.length > 0) r.push(v.charAt(0));
    });
    return r.join('+');
}

const dice = '<img class="svg-icon" src="media/Dice-2r1-Icon.svg"/>';
// Create HTML for games table entry.  gk is game name, gd is game data
// gk:"\t2", gd:{"seats":[null,null,null,null],"status":0,"invited":[]}
function addRowGamesDisplay(gk) {
    // Check for possible matching series ID
    let sid = St.seriesIdForGame(gk);
    // Get game display name
    var r = '<tr><td>'+(sid? seriesDisplayName(sid) : gk) +'</td>';
    let seriesGseat = sid? ' class="sgseat"' : '';
    // Fill in seat info
    St.games[gk].seats.forEach((s,i) => {
        // Seat occupied or available to sit/join?
        const nd = (St.games[gk].status==0 // 'nd' only valid b4 game starts
            && (!sid && i==0 || sid && i==St.series[sid].nd)? dice: ""
        );
        let sit = (s?s+nd:
            '<button class="btn-small" onClick="LMj.sitAt(\''+gk+'\','+i+')">'
            +(St.games[gk].status ? 'join' : 'sit'+nd)
            +'</button>'
        );
        // if series, hint of who last sat at this position
        let serh = sid? ('<br/><span class="serhint">'
            +(St.series[sid].order[i] || "--") +'</span>'): '';
        // Add to result HTML
        r += `<td${seriesGseat}>${sit}${serh}</td>`;
    });
    r += '<td>'+lobbyGameStatus(St.games[gk].status > 0, gk)+'</td>';

    // If this is a private game, show second row for invited list, and possible invite button
    if (St.isPrivate(gk)) {
        // close first row entry with options column
        let own = (gk == St.username);
        r += '<td>'
            +((own||sid)?`<i class="material-icons iconBtnTe"
            onclick="LMj.reqScoreHist('${gk}',${sid})">timeline</i>`.trim():'')
            +((own||sid)?`<i class="material-icons iconBtnOr"
            onclick="LMj.gameKill('${gk}')">cancel</i>`.trim():'');
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
    const email = email_dom();
    email.classList.add('flag-err');
    email.placeholder = 'email address did not match';
}
function sign_in_err_state_username() {
    uname_dom().classList.add('in-uname');
}
function sign_in_err_state_clear(){
    const email = email_dom();
    email.classList.remove('flag-err');
    email.placeholder = email_placeholder;
    uname_dom().classList.remove('in-uname');
}
function uname_dom() { return document.getElementById('username') }
function email_dom() { return document.getElementById('email') }

function init() {
    email_placeholder = email_dom().getAttribute('placeholder');

    // Initialize modal dialogs
    M.Modal.init(document.querySelectorAll('.modal')); // materialize init
}

export {
    init, set_sign_in_state, uname_dom, email_dom, welcome_username,
    sign_in_err_state_clear, sign_in_err_state_username, sign_in_err_state_email,
    update_games_display, update_users_display,
    update_invites_display, get_priv_invite_selection,
}

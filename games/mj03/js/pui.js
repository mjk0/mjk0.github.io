"use strict";
//const urlParams = new URLSearchParams(window.location.search);
import * as PSt from './pst.js';
import * as PUnpl from './punpl.js';

let UiOptions = null; // UI action callbacks
let UI = {
    view: 'init',
    waitOn: {'why':'why', 'who':[]},
};

function onResize() {
    // Refresh unplayed grid if it's visible
    if (is_visible("unplayed")) PUnpl.refreshGrid();
}
function doesViewChangeNeedRefreshOfUnplGrid(oldv, newv) {
    return oldv == "gameend" && newv != "gameend";
}

// Refresh our unplayed tiles
function refreshUnplayed() { PUnpl.refreshUnplayed(); }

// Set(1) or clear(0), or toggle(-1) "hide-me" class on element
function set_elem_visibility(elem, boolish) {
    if (boolish < 0) {
        elem.classList.toggle("hide-me");
    } else if (boolish) {
        elem.classList.remove("hide-me");
    } else {
        elem.classList.add("hide-me");
    }
}
function set_id_visibility(id, boolish) {
    set_elem_visibility(document.getElementById(id), boolish);
}
function is_visible(id) {
    return !document.getElementById(id).classList.contains("hide-me");
}

// Update visual status for WebSocket connection state
function showWsOn(bool) {
    document.getElementById("ws-status").innerHTML
     = (bool ? 'verified_user' : 'sync_problem');
}

// Show the chat window, and clear any chat msg animation
function chatShow(boolish) {
    document.getElementById("chat-icon").classList.remove("chatMsg");
    set_id_visibility('chatWindow', boolish);
}
function chatIncoming(text) {
    if (!is_visible('chatWindow')) {
        document.getElementById("chat-icon").classList.add("chatMsg");
    }
    let seat =  (/^\d\//.test(text)? parseInt(text.charAt(0)) : -1);
    let t2 = (seat >= 0 ? text.substring(2) : text);
    let p = document.createElement("p");
    p.classList.add('seat'+seat, 'chatBubble');
    if (seat == PSt.ourSeat) {
        p.classList.add('right');
    }
    p.innerHTML = t2;
    let cl = document.getElementById('chatLog');
    cl.appendChild(p);
    cl.scrollTop = cl.scrollHeight; // scroll to bottom if needed
}

// Upon being granted a seat (rcvSitAt), update all seat directions
function refreshPlayerDirs() {
    for (let seat=0; seat < 4; ++seat) { // game positions (0=East)
        //let dir = posGame2Dir(seat);
        let iv = posGame2View(seat); // view positions (0=bottom)
        let domSeatDir = document.getElementById('seatdir'+iv);
        //domSeatDir.innerHTML = dir;
        domSeatDir.className = 'seatdir seat'+seat;
    }
}

// After a seat change, we received an updated player seat list from the server
function refreshPlayerNames() {
    for (let seat=0; seat < 4; ++seat) { // game positions (0=East)
        let iv = posGame2View(seat); // view positions (0=bottom)
        let name = seatPlayerName(seat);
        document.getElementById('seatname'+iv).innerHTML = name;
        document.getElementById("p-n"+seat).innerHTML = name;
    }
    if (UI.view == "gameend") {
        refreshScoring();
    }
    refreshWaitOn();
}
function seatPlayerName(seat) { return PSt.players[seat] || "AI("+posGame2Dir(seat)+")"}

// From a comma-sep string of tile names ("F1,F2"), create SVGs as innerHTML
function mkTileSvg(tiles, repeatCnt, tileclass) {
    let r = '';
    let syms = tiles.split(',');
    for (let i=0; i < repeatCnt; ++i) {
        for (const sym of syms) {
            r += '<svg class="'+tileclass+'"><use href="media/stiles.svg#'
                 +sym+'"/></svg>';
        }
    }
    return r;
}

// Get tile string from first child SVG
function getSvgTileString(elem) {
    let svgs = elem.getElementsByTagName('svg');
    return (svgs.length > 0) ? PUnpl.svgToTileString(svgs[0]) : "";
}

function refreshCurrWind() {
    let elem = document.getElementById('tilewind');
    elem.innerHTML = mkTileSvg('W'+posGame2Dir(PSt.curr.wind), 1, 'tile-s');
}
function refreshCurrDealer() {
    for (let seat=0; seat < 4; ++seat) { // game positions (0=East)
        let iv = posGame2View(seat); // view positions (0=bottom)
        let elem = document.querySelector('#seatname'+iv+' + img');
        set_elem_visibility(elem, seat == PSt.curr.dealer);
    }
}

// Translate from game positions (0=East) to view positions (0=bottom)
function posGame2View(seat) { return (seat+4 - PSt.ourSeat) & 0x3; }
// Translate from game positions (0=East) to view directions: "E", "S", "W", "N"
function posGame2Dir(seat) { return "ESWN".charAt(seat); }

// When view changes, may need to refresh all ready flags.
// "init" and "gameend" views force ready floags off.
const viewRdyAllowed = {"tileplay":1, "waiton":1};
function refreshRdyFlags() {
    // Does current view allow ready flags?
    let vrdyok = viewRdyAllowed[UI.view] || 0;
    for (let ig=0; ig < 4; ++ig) {
        let iv = posGame2View(ig); // view positions (0=bottom)
        // update ready flag
        set_id_visibility("rdy"+iv, vrdyok && PSt.hands[ig].r);
    }
}
function doesViewChangeNeedRefreshOfRdyFlags(oldv, newv) {
    let oldok = viewRdyAllowed[oldv] || 0;
    let newok = viewRdyAllowed[newv] || 0;
    return oldok != newok; // if different, need refresh
}

// Show the played tiles for one or more players
function refreshPlayed(ibase, num) {
    // Does current view allow ready flags?
    let vrdyok = (UI.view != "init" && UI.view != "gameend")? 1:0;
    // Look at each hand in the update
    for (let ib = ibase; ib < ibase+num; ib++) {
        let ig = ib & 0x3; // game positions (0=East), i.e. PSt.hands[ig]
        let iv = posGame2View(ig); // view positions (0=bottom)
        let tileclass = (iv > 0? "tile-m" : "tile-lg");
        let elem = document.getElementById('tilesp'+iv);
        let html = '';
        for (const set of PSt.hands[ig].sets) {
            // each set consists of: {"s":"F1,F2","secret":0}
            if (set.s.length > 0) {
                if (set.secret > 1) {
                    html += '<div class="tile-set-ureveal">';
                } else if (set.secret) {
                    html += '<div class="tile-set-secret">';
                } else {
                    html += '<div class="tile-set">';
                }
                html += mkTileSvg(set.s, 1, tileclass) + '</div>';
            }
        }
        // other players, not the local player at the bottom of the view
        if (iv > 0) {
            // show unplayed tiles, if any (none for winner)
            if (PSt.hands[ig].nu > 0) {
                html += mkTileSvg("UT", PSt.hands[ig].nu, tileclass);
            }
        }
        if (html.length == 0) {
            html = 'played tiles';
        }
        elem.innerHTML = html; // clear old contents
        // update ready flag
        set_id_visibility("rdy"+iv, vrdyok && PSt.hands[ig].r);
    }
}

// Show most recent play or discard responses in others and ourselves
function refreshThinking() {
    let vcurr = posGame2View(PSt.curr.pos);
    if (PSt.isDiscardCycle()) {
        for (let off=1; off < 4; ++off) {
            let gpos = (PSt.curr.pos + off) & 0x3;
            let rp = PSt.plays.resp[gpos]
            let vpos = posGame2View(gpos);
            setThinking(vpos, rp? rp : 'q', true);
        }
        // Hide discarder's thinking bubbles
        setThinking(vcurr, "", false);
    } else {
        // Show curr player's bubbles for last play
        setThinking(vcurr, PSt.plays.resp[PSt.curr.pos], false);
        // Hide other thinking bubbles
        for (let off=1; off < 4; ++off) {
            let vpos = (vcurr + off) & 0x3;
            setThinking(vpos, '', false);
        }
    }
}
const tk2text = {
    'q':"?", 'draw':"Draw", 'pass':"✓",
    'chal':"Cha!", 'cham':"Cha!", 'chah':"Cha!",
    'po':"PO!", 'gng':"Gng!", 'woo':"WOO!", 
}; // remap play token to text and CSS style
const tk2css = {'pass':"q", 'chal':"cha", 'cham':"cha", 'chah':"cha"};
function setThinking(vpos, val, doFlash) {
  if (vpos > 0) { // For now, no bubbles for our hand
    let tt = document.getElementsByClassName('thinking'+vpos);
    if (tt.length > 0) {
        if (val.length > 0 && val != "pass") {
            set_elem_visibility(tt[0], 1);
            let txt = tk2text[val] || val;
            let fc = (doFlash && txt.slice(-1) == "!" ? " think-f" : "");
            let spans = tt[0].getElementsByTagName('span');
            spans[0].className = "think-"+(tk2css[val] || val) + fc;
            spans[0].textContent = txt;
        } else {
            set_elem_visibility(tt[0], 0); // hide "pass" response
        }
    } else {
        console.error("Couldn't find thinking"+vpos);
    }
  }
}

// Show or hide discarded tile
function refreshDiscard() {
    let odiscard = document.getElementById('other-discard');
    // Do we need a discard animation?
    if (PSt.isOtherDiscard()) {
        let currv = posGame2View(PSt.curr.pos); // view pos of curr player
        odiscard.className = 'anim-discard-view'+currv;
        set_elem_visibility(odiscard, 1);
    } else {
        set_elem_visibility(odiscard, 0);
    }
}
// Refresh the SVG use link to show the discarded tile
function refreshDiscardTile() { refreshTileOnId('other-discard', PSt.plays.tile) }
// Refresh the SVG use link to show the given tile
function refreshTileOnId(id,tile) {
    let oid = document.getElementById(id);
    PUnpl.svgSetTileString(oid, tile);
}
// Refresh the SVG use link on an optional play button
const id2incr = {"fs-chal":[0,1,2],"fs-cham":[-1,0,1],"fs-chah":[-2,-1,0]};
function setSVGOnBtn(pcid,tile) {
    const el = document.getElementById(pcid);
    const ia = id2incr[pcid] || [0];
    const t = tile || PSt.plays.tile;
    ia.forEach((v,i) => {
        PUnpl.svgSetTileString(el,tileStrIncr(t,v), i);
    });
}
function tileStrIncr(t,incr) {
    return incr==0 ? t : t.charAt(0)+(parseInt(t.charAt(1))+incr)
}

// It's our turn to select a play.  Minimum is either pass or discard
const pcButtons = [
    "draw", "tail", /* "pass-only", "pass-multi", */
    "woo", "po", "gng", /* "gng0", "gng1", */
    "chal", "cham", "chah"
];
function setViewTilePlay() {
    set_id_visibility("discard-line", PSt.plays.allowDiscard);
    for (const pcid of pcButtons) {
        const id = "fs-"+pcid;
        if (PSt.plays.more.includes(pcid)) {
            if (pcid.startsWith("cha")) {
                setSVGOnBtn(id); // show tiles in CHA button
            }
            set_id_visibility(id, 1);
        } else {
            set_id_visibility(id, 0);
        }
    }

    // Pass buttons in two flavors: "don't want", and "pass"
    const passNeeded = PSt.plays.more.includes("pass");
    const passOnly = passNeeded && PSt.plays.more.length == 1;
    const passMulti = passNeeded && PSt.plays.more.length > 1;
    set_id_visibility("fs-pass-only", passOnly);
    set_id_visibility("fs-pass-multi", passMulti);

    // GngAdd and GngSecret need to show the tile, in case of multiple
    const gngt = PSt.getInHandGngPlays();
    gngt.forEach((v,i) => {
        for (const [play,tile] of Object.entries(v)) {
            if (i < 3) {
                setSVGOnBtn("fs-gng"+i, tile);
            } else {
                console.error("%s:%s is gng#%d",play,tile,i);
            }
        }
    });
    set_id_visibility("fs-gng0", gngt.length > 0);
    set_id_visibility("fs-gng1", gngt.length > 1);
    set_id_visibility("fs-gng2", gngt.length > 2);

    setPlayView("tileplay"); // show the buttons
}

// Msg from server telling us who we're waiting on, and why
// {"action":"waiton","who":[0],"why":"discard"}
function rcvWaitOn(data) {
    UI.waitOn.why = data.why || "??";
    UI.waitOn.who = data.who || [];
    if (UI.waitOn.why=='woo'||UI.waitOn.why=='reshuffle') {
        gameEndWaitOn();
    } else {
        showWaitOn();
    }
}
function showWaitOn() {
    let html = `<div>Waiting for ${UI.waitOn.why}...</div>`;
    for (const ig of UI.waitOn.who || []) {
        let pname = seatPlayerName(ig);
        if (pname.startsWith("R-")) {
            // If waiting on a robot, offer robot take-over
            pname += `<button class="btn-small robitBtn" onclick="PMj.askRobotPlay(${ig})" type="button">Robot play</button>`;
        }
        html += `<div class="seat${ig} w4Bubble">${pname}</div>`;
    }
    let w4elem = document.getElementById("wait4fs");
    w4elem.innerHTML = html;
    setPlayView('waiton');
}
function gameEndWaitOn() {
    // Show which positions have responded
    let html = "";
    for (const ig of UI.waitOn.who || []) {
        let pname = seatPlayerName(ig);
        html += `<div>${pname}</div>`;
    }
    document.getElementById("ge-wo").innerHTML = html; // gameend waiting on who
    setPlayView('gameend');
}
// If in the "waiton" view, refresh display after player name list update
function refreshWaitOn() {
    if (UI.view == 'waiton') {
        showWaitOn(); // Update list of who we're waiting on
    }
}

// Msg from server giving undo/redo options
// {"action":"redo","offset":0,"v":[[1,"draw"],[0,"discard"]]}
function rcvReDo(data) {
    let elem = document.getElementById("diaUndoContents");
    let v = data.v || [];
    let html = "";
    if (v.length == 0) {
        html = "<span> No Plays! </span>";
    } else {
        // Create an undo button for each option
        v.forEach((a,i) => {
            // a[0] is the player pos, a[1] is the play
            let pname = seatPlayerName(a[0]);
            let play = undoPlayStr(a[1]);
            let div = i==0 ? "fieldset" : "div";
            let lg = i==0 ? "<legend>Last Play:</legend>" : "";
            if (i==1) {
                html += '<fieldset><legend>Previous Play(s):</legend>';
            }
            html += `<${div}>${lg}<button class="btn-r btn-undo modal-close"`;
            html += ` onclick="PMj.reqUndo(${i})" type="button">`;
            html += `Undo ${pname} ${play}</button></${div}>`;
        });
        if (v.length > 1) {
            html += '</fieldset>';
        }
    }
    elem.innerHTML = html;
    $('#diaUndo').modal('open');
}
const undoPlay2Str = {'gngadd': 'gng', 'gngsecret': 'gng-secret'};
function undoPlayStr(play) {
    if (typeof play === 'object' && play !== null) {
        let pstr = Object.keys(play)[0];
        return undoPlay2Str[pstr] || "in-hand play";
    }
    return play;
}

// Scoring result for the game.  Only handled in the UI
// {"action":"scoring","addv":[1,20],"adds":["Flowers","7 pairs"],
//   "multv":[2],"mults":["zzmo"],"diffs":[168,-84,-42,-42],
//   "score":{"R-Doc":-84,"R-Happy":-42,"Marcel":168,"R-Bashful":-42}}
function refreshScoring() {
    let d = "";
    let score = 0;
    // Additive points
    PSt.scoring.addv.forEach((v,i) => { score += v;
        d += tableRow(["+"+v +": "+ PSt.scoring.adds[i]])
    });
    // Multiplicative points
    PSt.scoring.multv.forEach((v,i) => { score *= v;
        d += tableRow([PSt.scoring.mults[i] + "(*"+v+")"])
    });
    // Hand score total
    document.getElementById("score-hpts").innerHTML = score.toString();
    document.getElementById("pts-detail").innerHTML = d;
    // Hand score differential
    let tr_diffs = document.getElementById("pts-diff");
    PSt.scoring.diffs.forEach((v,i) => { tr_diffs.childNodes[i+1].innerHTML = v.toString()});
    // Game running total points
    let tr_pts = document.getElementById("pts-tot");
    for (let i = 0; i < 4; ++i) {
        tr_pts.childNodes[i+1].innerHTML = PSt.scoring.score[seatPlayerName(i)] || "--";
    }
}
function tableRow(arr, thd) {
    let td = thd || "td";
    let r = "<tr>";
    arr.forEach((v) => { r += "<"+td+">"+v+"</"+td+">" });
    return r + '</tr>';
}

// Display shared dialog for score history
function rcvScoreHist(data) {
    CUI.rcvScoreHist(data, PSt.players);
}

function gameShutdown() {
    $('#shutdown').modal('open');
    //window.location.replace("./"); // back to lobby
}

function playResultWoo() {
    // Refresh the SVG use link to show the last tile before Woo
    refreshTileOnId('last-tile', PSt.plays.tile);
    setPlayView("gameend");
}

const playViewIds = [
    'playfs', 'discard-line', 'wait4fs', "unplayed",
    'viewwoo', 'viewinit'
];
function enaPlayViewPieces(opts) {
    for (const pvid of playViewIds) {
        set_id_visibility(pvid, opts[pvid] || 0);
    }
}
function setPlayView(vname) {
    const nu_RdyFlag = doesViewChangeNeedRefreshOfRdyFlags(UI.view, vname);
    const nu_UnplGrid = doesViewChangeNeedRefreshOfUnplGrid(UI.view, vname);
    UI.view = vname;
    switch (vname) {
    case "init":
        enaPlayViewPieces({"viewinit":1, "unplayed":1});
        set_id_visibility("other-discard", 0);
        break;
    case "tileplay": // both in-hand and on-discard
        enaPlayViewPieces({"playfs":1, "unplayed":1,
            "discard-line":PSt.plays.allowDiscard
        });
        break;
    case "waiton":
        enaPlayViewPieces({"wait4fs":1, "unplayed":1});
        break;
    case "gameend":
        enaPlayViewPieces({"viewwoo":1});
        break;
    }
    // Other refresh
    if (nu_RdyFlag) refreshRdyFlags();
    if (nu_UnplGrid) PUnpl.refreshGrid();
}

function init(opts) {
    UiOptions = opts || {};
    // Initialize modal dialogs
    //elems = document.querySelectorAll('.modal');
    //instances = M.Modal.init(elems, {}); // materialize init
    $('.modal').modal(); // jQuery init
    $('#shutdown').modal({'dismissible': false});

    // Initialize drop-down menus
    let elems = document.querySelectorAll('#sidenav-r');
    M.Sidenav.init(elems, { edge: 'right' });
    $(".dropdown-trigger").dropdown({ coverTrigger: false }); // nav-bar drop-down

    PUnpl.init(opts);
    setPlayView(UI.view);
    window.addEventListener("resize", onResize);
    //PUnpl.updateGrid(); // calc grid sizes
}

export {
    init, refreshCurrWind, refreshCurrDealer,
    refreshPlayerDirs, refreshPlayerNames, refreshPlayed, refreshUnplayed,
    showWsOn, chatShow, chatIncoming, getSvgTileString,
    setPlayView, setViewTilePlay, rcvWaitOn, rcvReDo, rcvScoreHist,
    refreshDiscard, refreshThinking, refreshDiscardTile,
    refreshWaitOn, playResultWoo, refreshScoring, gameShutdown,
}

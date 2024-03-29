"use strict";
import * as COpts from './copts.js';
import * as CUI from './cui.js';
import * as PSt from './pst.js';
import * as PUnpl from './punpl.js';

let UiOptions = null; // UI action callbacks
let UI = {
    view: 'init',
    waitOn: {'why':'why', 'who':[]},
};
let unpBB = null; // DIV#unplayed getBoundingClientRect()
var unpResizeObserver; // init after DOM ready

// Refresh our unplayed tiles
function refreshUnplayed() {
    if (!CUI.is_visible("unplayed")) {
        CUI.show_id("unplayed", 1);
    }
    PUnpl.refreshUnplayed();
}
function onResizeUnplayed() { // called once unplayed DOM ready
    if (CUI.is_visible("unplayed")) {
        let bb = document.getElementById("unplayed").getBoundingClientRect();
        //console.log('unplayed rect: ', bb, unpBB);
        if (bb.width != unpBB.width || bb.height != unpBB.height) {
            //console.log("unplayed size change, re-grid", bb, unpBB);
            unpBB = bb;
            PUnpl.refreshGrid();
        }
    }
}

// Update visual status for WebSocket connection state
function showWsOn(bool) {
    const good = (COpts.isDev? "beach_access" : "verified_user");
    document.getElementById("ws-status").innerHTML
     = (bool ? good : 'sync_problem');
}

// Show the chat window for large screens, and clear any chat msg animation
function chatShow(boolish) {
    chatShush();
    CUI.show_id('chatWindow', boolish); // large screen panel
    if (CUI.is_visible('chatWindow')) {
        document.getElementById("cptext").focus();
    }
}
function chatShush() { allOfClass("chat-icon", e => e.classList.remove("chatMsg"));}
function chatSliderDiv() { return document.getElementById('sidenav-c');}
function isChatVisible() {
    return M.Sidenav.getInstance(chatSliderDiv()).isOpen || CUI.is_visible('chatWindow');
}
function chatSliderOnOpen() {
    chatShush();
    //document.getElementById("cstext").focus();
}
function allOfClass(cl, f) {
    let list = document.getElementsByClassName(cl);
    for (let e of list) { f(e); }
}

function chatIncoming(text) {
    if (!isChatVisible()) {
        allOfClass("chat-icon", e => e.classList.add("chatMsg"));
    }
    let seat =  (/^\d\//.test(text)? parseInt(text.charAt(0)) : -1);
    let t2 = (seat >= 0 ? text.substring(2) : text);
    allOfClass("chatLog", e => {
        let p = document.createElement("p");
        p.classList.add('seat'+seat, 'chatBubble');
        if (seat == PSt.ourSeat) { p.classList.add('right'); }
        p.innerHTML = t2;
        e.appendChild(p);
        e.scrollTop = e.scrollHeight; // scroll to bottom if needed
    });
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
        for (let e of document.getElementsByClassName("p-n"+seat)) {
            e.innerHTML = name;
        }
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
    let cl = (tileclass.length >0 ? ` class="${tileclass}"`: '');
    let syms = tiles.split(',');
    for (let i=0; i < repeatCnt; ++i) {
        for (const sym of syms) {
            r += `<svg${cl}><use href="media/stiles.svg#${sym}"/></svg>`;
        }
    }
    return r;
}

// Get tile string from first child SVG
function getSvgTileString(elem) {
    let svgs = elem.getElementsByTagName('svg');
    return (svgs.length > 0) ? PUnpl.svgToTileString(svgs[0]) : "";
}

// {"action":"discards","v":"M7-3,FA-0,B1-1,B8c3","deck":"WE,M9,...,M1"}
// discard encoding is "tt", then play as a single char, then src
function discardsSummary() {
    const sep = discardsAsSeparate(); // false for combined, true for separate
    let r = ['','','',''];
    for (let ri = (sep? 0:4); ri < 4; ++ri) {
        const pn = seatPlayerName(ri);
        let cl = posGame2DirL(ri);
        r[ri] = `<legend class="dh-legend ${cl}">${pn}</legend>`
    }
    PSt.allDiscards.viewing.v.split(',').forEach((v,i) => {
        const who = v.substr(3);
        const ri = (sep? who : 0); // put all in r[0] if not separated
        const action = action2Long[v.substr(2,1)]; // "-" means no action
        let cl = posGame2DirL(who);
        if (action) {
            r[ri] += '<div>';
            cl += ' dh-at';
        }
        r[ri] += '<svg class="'+cl+'"><use href="media/stiles.svg#'
            +v.substr(0,2)+'"/></svg>';

        // If there was a play action, include action overlay tile
        if (action) {
            r[ri] += '<svg class="dh-ov"><use href="media/stiles.svg#ov'
            +action+'"/></svg></div>';
        }
    });
    for (let ri = 0; ri < 4; ++ri) {
        const fid = 'discards'+ri;
        document.getElementById(fid).innerHTML = r[ri];
        CUI.show_id(fid, ri==0 || sep);
    }
    // Deck remaining, if given (at end of game only)
    r = '';
    const isDeckVisible = PSt.allDiscards.viewing.deck.length > 0;
    if (isDeckVisible) {
        // Is the deck field a comma-separated tile list, or just a count?
        // deck:"WE,M9,...,M1" or deck:"32"
        const c0 = PSt.allDiscards.viewing.deck.charAt(0);
        const cs = (c0 >= '0' && c0 <= '9'? " "+PSt.allDiscards.viewing.deck : "");
        r = `<legend class="dh-legend">Deck remaining tiles:${cs}</legend>`;
        if (!cs) r += mkTileSvg(PSt.allDiscards.viewing.deck, 1, 'tile-m');
    }
    document.getElementById('deck').innerHTML = r;
    CUI.show_id('deck', isDeckVisible);
}
function discardsAsSeparate() {
    const v = document.querySelector('input[name="disradio"]:checked').value;
    if (v) {COpts.lset("mj-discards-separated", v);}
    return (v ||0)>0;
}
const action2Long = {"-":null, w:"woo", g:"gng", p:"po", c:"cha"};

function refreshCurrWind() {
    let elem = document.getElementById('tilewind');
    elem.innerHTML = mkTileSvg('W'+posGame2Dir(PSt.curr.wind), 1, 'tile-s');
}
function refreshCurrDealer() {
    for (let seat=0; seat < 4; ++seat) { // game positions (0=East)
        let iv = posGame2View(seat); // view positions (0=bottom)
        CUI.show_qs('#seatname'+iv+' + img', seat == PSt.curr.dealer);
    }
}

// Translate from game positions (0=East) to view positions (0=bottom)
function posGame2View(seat) { return (seat+4 - PSt.ourSeat) & 0x3; }
// Translate from game positions (0=East) to view directions: "E", "S", "W", "N"
function posGame2Dir(seat) { return "ESWN".charAt(seat); }
const g2DirL = ["East", "South", "West", "North"];
function posGame2DirL(seat) { return g2DirL[seat]; }

// When view changes, may need to refresh all ready flags.
// "init" and "gameend" views force ready floags off.
const viewRdyAllowed = {"tileplay":1, "waiton":1};
function refreshRdyFlags() {
    // Does current view allow ready flags?
    let vrdyok = viewRdyAllowed[UI.view] || 0;
    for (let ig=0; ig < 4; ++ig) {
        let iv = posGame2View(ig); // view positions (0=bottom)
        // update ready flag
        CUI.show_id("rdy"+iv, vrdyok && PSt.hands[ig].r);
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
        PSt.hands[ig].sets.forEach((set, si) => {
            // each set consists of: {"s":"F1,F2","secret":0}
            if (set.s.length > 0) {
                const lastSet = (si==PSt.hands[ig].sets.length-1);
                if (set.secret > 1) {
                    unplayedAsSuitSets(set.s).forEach(s => {
                        html += '<div class="tile-set-ureveal">';
                        html += mkTileSvg(s, 1, tileclass) + '</div>';
                    });
                } else {
                    if (set.secret) {
                        html += '<div class="tile-set-secret">';
                    } else {
                        html += '<div class="tile-set">';
                    }
                    const cl = tileclass +(iv==0 && lastSet && PSt.hasAddedSet()? " add-pulse":"");
                    html += mkTileSvg(set.s, 1, cl) + '</div>';
                    // Check for added flower highlight
                    if (iv==0 && si==0 && PSt.hasAddedFlower()) {
                        // Add class on last flower SVG
                        let n = html.lastIndexOf('class="');
                        if (n >= 0) {
                            n += 'class="'.length;
                            html = html.slice(0,n) + "add-pulse " + html.slice(n);
                        }
                    }
                }
            }
        });
        // other players, not the local player at the bottom of the view
        if (iv > 0) {
            // show unplayed tiles, if any (none after win)
            if (PSt.hands[ig].nu > 0) {
                html += mkTileSvg("UT", PSt.hands[ig].nu, tileclass);
                let tcnt = (PSt.hands[ig].sets.length-1)*3 + PSt.hands[ig].nu;
                if (tcnt < 14) {
                    html += mkTileSvg("ZT", 1, tileclass);
                }
            }
        }
        if (html.length == 0) {
            //html = 'flowers and sets';
        }
        elem.innerHTML = '<span>'+html+'</span>'; // clear old contents
        // update ready flag
        CUI.show_id("rdy"+iv, vrdyok && PSt.hands[ig].r);
    }
}
// Break a comma-separated list of unplayed tiles into groupings by suit
// e.g. "O1,O2,M5,M7,WS,WW,BB"
function unplayedAsSuitSets(tiles) {
    // possible suits: 'O', 'B', 'M', 'W', 'N', 'F'
    let suits = {'O':[], 'B':[], 'M':[], 'W':[]};
    suits['N'] = suits.W; // group W & N together
    suits['F'] = suits.W;
    tiles.split(',').forEach(t => suits[PSt.tileSuit(t)].push(t));
    // Collect suit groupings as strings
    let r = [];
    for (const st of ['O', 'B', 'M', 'W']) {
        if (suits[st].length > 0) r.push(suits[st].join());
    }
    return r;
}

// While doing a tplayres refresh, mark curr player with highlights
function refreshCurrPlayerIndicator() {
    let play = PSt.plays.resp[PSt.curr.pos];
    let curr_iv = posGame2View(PSt.curr.pos);
    // If play result is woo, get winner's view pos (0 == bottom)
    let woo_iv = (play == "woo") ? curr_iv : -1;
    for (let iv=0; iv < 4; ++iv) {
        let elem = document.getElementById('tilesp'+iv)
        // winning hand indicator
        setPlayerWon(elem, iv == woo_iv);
        // current hand indicator
        if (iv == curr_iv) elem.classList.add('curr-hand');
        else elem.classList.remove('curr-hand');
    }
}
function setPlayerWon(elem, b) {
    if (b) {
        elem.classList.add('woo-hand');
        elem.parentNode.classList.add('rainbow');
    }
    else {
        elem.classList.remove('woo-hand');
        elem.parentNode.classList.remove('rainbow');
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
            setThinking(vpos, rp? rp : (vpos>0? 'q':''), true);
        }
        // Hide discarder's thinking bubbles
        setThinking(vcurr, "", false);
    } else {
        // Show curr player's bubbles for last play
        let play = PSt.plays.resp[PSt.curr.pos];
        const hideCpBubble = (play == "woo" || PSt.isOurTurn());
        if (!hideCpBubble) setThinking(vcurr, play, false);
        // Hide other thinking bubbles
        let off = hideCpBubble? 0 : 1;
        for (; off < 4; ++off) {
            let vpos = (vcurr + off) & 0x3;
            setThinking(vpos, '', false);
        }
    }
    refreshCurrPlayerIndicator();
}
const tk2text = {
    'q':"?", 'draw':"Draw", 'pass':"✓",
    'chal':"Cha!", 'cham':"Cha!", 'chah':"Cha!",
    'po':"PO!", 'gng':"Gng!", 'woo':"WOO!", 
}; // remap play token to text and CSS style
const tk2hide = {'pass':1, '':1};
const tk2css = {'pass':"q", 'chal':"cha", 'cham':"cha", 'chah':"cha"};
function setThinking(vpos, val, doFlash) {
    let tt = document.getElementsByClassName('thinking'+vpos);
    if (tt.length > 0) {
        if (!tk2hide.hasOwnProperty(val)) {
            CUI.show_elem(tt[0], 1);
            let txt = tk2text[val] || val;
            let fc = (doFlash && txt.slice(-1) == "!" ? " think-f" : "");
            let spans = tt[0].getElementsByTagName('span');
            spans[0].className = "think-"+(tk2css[val] || val) + fc;
            spans[0].textContent = txt;
        } else {
            CUI.show_elem(tt[0], 0); // hide responses in tk2hide
        }
    } else {
        console.error("Couldn't find thinking"+vpos);
    }
}

// Show or hide discarded tile
function refreshDiscard() {
    let odiscard = document.getElementById('other-discard');
    // Do we need a discard animation?
    const isDiscardCycle = PSt.isDiscardCycle();
    const isOurTurn = PSt.isOurTurn();
    if (isDiscardCycle && isOurTurn) {
        odiscard.className = 'anim-discard-view0 odiscard-tile';
    } else if (isDiscardCycle && !isOurTurn) {
        let currv = posGame2View(PSt.curr.pos); // view pos of curr player
        odiscard.className = 'anim-discard-view'+currv;
    } else {
        odiscard.className = 'hide-me';
    }
}
// Refresh the SVG use link to show the discarded tile
function refreshDiscardTile() {
    refreshTileOnId('other-discard', PSt.plays.tile); // for animation
    refreshDiscardHistBtn();
}
// When discard animation ends, can add decorations
function onDiscardAnimEnd() {
    this.classList.add('odiscard-tile');
}
// Show recent discards in button SVGs
function refreshDiscardHistBtn() {
    // Refresh recent discards on discard history button
    let oid = document.getElementById('discardRecent');
    PSt.recentDiscards.forEach((t,i) => {
        if (i<4) PUnpl.svgSetTileString(oid, t, i+1); // skip first of 5
    });
}
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
let pcBtnCnt = 0; // allow counting of visible buttons
function cnt_btn_visibility(id, flag) {
    if (flag) ++pcBtnCnt;
    CUI.show_id(id, flag);
}
function setViewTilePlay() {
    pcBtnCnt = 0;
    CUI.show_id("discard-line", PSt.plays.allowDiscard);
    cnt_btn_visibility("fs-discard", PSt.plays.allowDiscard);
    for (const pcid of pcButtons) {
        const id = "fs-"+pcid;
        if (PSt.plays.more.includes(pcid)) {
            if (pcid.startsWith("cha")) {
                setSVGOnBtn(id); // show tiles in CHA button
            }
            cnt_btn_visibility(id, 1);
        } else {
            cnt_btn_visibility(id, 0);
        }
    }

    // Pass buttons in two flavors: "don't want", and "pass"
    const passNeeded = PSt.plays.more.includes("pass");
    const passOnly = passNeeded && PSt.plays.more.length == 1;
    const passMulti = passNeeded && PSt.plays.more.length > 1;
    cnt_btn_visibility("fs-pass-only", passOnly);
    cnt_btn_visibility("fs-pass-multi", passMulti);

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
    cnt_btn_visibility("fs-gng0", gngt.length > 0);
    cnt_btn_visibility("fs-gng1", gngt.length > 1);
    cnt_btn_visibility("fs-gng2", gngt.length > 2);

    // If more than one button/not-a-btn is visible, put gap to prevent click
    // If more than 2 buttons, enable line break
    CUI.show_id("fs-gap", pcBtnCnt > 1);
    CUI.show_id("fs-br", pcBtnCnt > 2);

    PUnpl.rmClass(document.getElementById("playfs"), "PlayGone");
    setPlayView("tileplay"); // show the buttons
}
const pcBtnRank = {"fs-po":1, "fs-gng":1, "fs-chal":0, "fs-cham":0, "fs-chah":0}; // woo:2
function checkPlayRestrictions() {
    if (UI.view == "tileplay" && PSt.isOtherDiscard()) {
        const mrank = PSt.maxDiscardPlayRank();
        if (mrank > 0) {
            if (CUI.is_visible("fs-draw")) {
                console.log('Replacing Draw btn with Pass', mrank);
                // Swap Draw and Pass-only visibility
                CUI.show_id("fs-draw", false);
                CUI.show_id("fs-pass-only", true);
            }
            for (const [p,r] of Object.entries(pcBtnRank)) {
                if (r < mrank && CUI.is_visible(p)) {
                    document.getElementById(p).classList.add('PlayGone');
                }
            }
        }
    }
}

// Msg from server telling us who we're waiting on, and why
const why2m = { // complete the sentence: "Waiting for ..."
    see:"all to see", discardack:"all to see",
    discard:"player to discard",
    taildraw:"player to draw from the flower pile",
    // Reshuffle variants are handled with gameend view
    woo:"next game", reshuffle:"next game", exceptionreshuffle:"next game",
    // Also possible, "restore error: ...".  Not mapped
};
// {"action":"waiton","who":[0],"why":"discard"}
function rcvWaitOn(data) {
    UI.waitOn.why = why2m[data.why] || data.why || "??";
    UI.waitOn.who = data.who || [];
    if (PSt.hasGameEnded()) {
        gameEndWaitOn();
    } else {
        showWaitOn();
    }
}
function showWaitOn() {
    let html = `<div>Waiting for ${UI.waitOn.why}...</div>`;
    for (const ig of UI.waitOn.who || []) {
        let pname = seatPlayerName(ig);
        if (pname.startsWith("r-")) {
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
    let weResponded = true; // will switch to false if present in list
    for (const ig of UI.waitOn.who || []) {
        let pname = seatPlayerName(ig);
        html += `<div>${pname}</div>`;
        if (ig == PSt.ourSeat) {weResponded = false;}
    }
    document.getElementById("ge-wo").innerHTML = html; // gameend waiting on who
    // If we have responded, hide our buttons
    CUI.show_id("b0-pa", !weResponded);
    CUI.show_id("b1-pa", weResponded);
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
            let play = playerNameAndPlay(a);
            let div = i==0 ? "fieldset" : "div";
            let lg = i==0 ? "<legend>Last Play:</legend>" : "";
            if (i==1) {
                html += '<fieldset><legend>Previous Play(s):</legend>';
            }
            html += `<${div}>${lg}<button class="btn-r btn-undo modal-close"`;
            html += ` onclick="PMj.reqUndo(${i})" type="button">`;
            html += `Undo ${play}</button></${div}>`;
        });
        if (v.length > 1) {
            html += '</fieldset>';
        }
    }
    elem.innerHTML = html;
    M.Modal.getInstance(document.getElementById("diaUndo")).open();
}
const undoPlay2Str = {'gngadd': 'gng', 'gngsecret': 'gng-secret'};
function undoPlayStr(play) {
    if (typeof play === 'object' && play !== null) {
        let pstr = Object.keys(play)[0];
        return undoPlay2Str[pstr] || "in-hand play";
    }
    if (play in tk2css) return tk2css[play];
    return play;
}
function playerNameAndPlay(arr) {
    return seatPlayerName(arr[0]) + " " + undoPlayStr(arr[1]);
}

// {"action":"redovote","seat":1,"v":0,"play":[1,"discard"],"resp":[0,1,1,1]}
// meaning of [-1,0,1] => [no,pending,yes]
const vote2resp = ['<span class="bRR">✘</span>',
    '<b>?</b>','<span class="bGG">✔</span>'
];
const vote2st = ['denied','pending unanimous approval','unanimously approved'];
function rcvRedoVote(data) {
    document.getElementById("diaUndoSrc").textContent = seatPlayerName(data.seat);
    document.getElementById("diaUndoTgt").textContent = playerNameAndPlay(data.play);
    let resp = data.resp || [];
    let v = parseInt(data.v || 0); // overall status
    let have_voted = resp[PSt.ourSeat] || 0;
    let show_ask_agree = (v == 0) && (have_voted == 0);
    CUI.show_id("diaUndoVoteQ", show_ask_agree);
    CUI.show_id("diaUndoVoteSt", !show_ask_agree);
    document.getElementById("diaUndoVoteSt1").textContent = vote2st[v+1];

    let html = "";
    resp.forEach((v,i) => {
        let rs = vote2resp[v+1] || vote2resp[1];
        let pn = seatPlayerName(i);
        html += `<tr><td>${pn}</td><td>${rs}</td></tr>`;
    });
    document.getElementById("diaUndoTBody").innerHTML = html;

    // Possible buttons are Yes, No, and Dismiss
    CUI.show_id("duvYes", show_ask_agree);
    CUI.show_id("duvNo", show_ask_agree);
    CUI.show_id("duvDis", !show_ask_agree);
    if (data.seat >= 4) {
        M.Modal.getInstance(document.getElementById("diaUndoVote")).close();
    } else {
        M.Modal.getInstance(document.getElementById("diaUndoVote")).open();
    }
}

// Find word sets of the given minimum length, return as SVGs
// Tool for scoring points summary
function wordSetsOfMinLen(len) {
    let r = '';
    // Each hand entry is:
    // {"sets":[{"s":"F8,...","secret":0},{"s":"FA,FA,FA,FA","secret":0},{"s":"B3,B3,B3","secret":0},{"s":"B1,B1,B1","secret":0},{"s":"B1,B2,B3","secret":0},{"s":"B4,B4","secret":0}],"nu":0,"r":1}
    for (let i = 1; i < PSt.hands[PSt.curr.pos].sets.length; ++i) {
        const t = PSt.hands[PSt.curr.pos].sets[i].s.split(',');
        if (PSt.tileSuit(t[0]) == 'N' && t.length >= len) {
            if (r.length > 0) r += ',';
            r += mkTileSvg(t[0], (t.length>3? 3: t.length), '');
        }
    }
    return r
}

const m2tiles = {
    "3x current wind": function() {
        return mkTileSvg('W'+posGame2Dir(PSt.curr.wind), 3, '')
    },
    "3x word set": function() { return wordSetsOfMinLen(3) },
    "3x all word sets": function() { return wordSetsOfMinLen(3) },
    "3+3+2 all words": function() { return wordSetsOfMinLen(2) },
};
const z2txt = {"zzmo": "zzmo/ 自摸", "ztail": "ztail/ 槓上開花"};
const dice = '<img class="svg-icon" src="media/Dice-2r1-Icon.svg"/>';
let woo_src = -1; // winning tile source: dealer=0, non-dealer=1, Zzmo/Ztail=2

// Scoring result for the game.  Only handled in the UI
// {"action":"scoring","addv":[1,20],"adds":["Flowers","7 pairs"],
//   "multv":[2],"mults":["zzmo"],"diffs":[168,-84,-42,-42],
//   "score":{"r-Doc":-84,"r-Happy":-42,"Marcel":168,"r-Bashful":-42}}
function refreshScoring() {
    let d = "";
    let score = 0;
    // Additive points
    PSt.scoring.addv.forEach((v,i) => { score += v;
        const ta = PSt.scoring.adds[i];
        const txt = m2tiles.hasOwnProperty(ta) ? m2tiles[ta]() : ta;
        d += tableRow(["+"+v +": "+ txt])
    });
    // Multiplicative points
    woo_src = -1; // winning tile source: dealer=0, non-dealer=1, Zzmo/Ztail=2
    const has_ztail = PSt.scoring.mults.includes("ztail");
    PSt.scoring.multv.forEach((v,i) => { score *= v;
        const vs = PSt.scoring.mults[i];
        if (has_ztail && vs == "zzmo") return; // continue loop
        const txt = z2txt[vs] || vs;
        if (z2txt.hasOwnProperty(vs)) { // if zzmo/ztail, show tile src
            refreshWooTileSrc(2, txt.replace("/ ","<br>"));
            if (has_ztail) v = 4; // show ztail as *4 since remove zzmo
        }
        d += tableRow([txt + " (&times;"+v+")"])
    });
    // Hand score total
    document.getElementById("score-hpts").innerHTML = score.toString();
    document.getElementById("pts-detail").innerHTML = d;
    // Hand score differential
    let tr_diffs = document.getElementById("pts-diff");
    let tr_names = document.querySelectorAll('#pts-names div');
    PSt.scoring.diffs.forEach((v,i) => {
        const lMult = (score > 0? -v/score : 0);
        if (lMult >= 2) {
            const msrc = (PSt.curr.dealer == i? 0: 1);
            refreshWooTileSrc(msrc, "from<br>"+seatPlayerName(i));
        }
        const dd = (PSt.curr.dealer == i? dice : ""); // dealer dice?
        let vs = (lMult<2 ? (lMult>=0 ? v.toString()+dd
        : '<div class="ptsWin">'+v.toString()+dd+'</div>')
        : `${v} ${dd}<span class="score-lmult">&times;${lMult}</span>`);
        tr_diffs.childNodes[i+1].innerHTML = vs;
        if (lMult < 0) { // winner?
            tr_names[i].classList.add('ptsWin');
        }
    });
    // Game running total points
    let tr_pts = document.getElementById("pts-tot");
    for (let i = 0; i < 4; ++i) {
        tr_pts.childNodes[i+1].innerHTML = seatToTotPts(i);
    }
}
function tableRow(arr, thd) {
    let td = thd || "td";
    let r = "<tr>";
    arr.forEach((v) => { r += "<"+td+">"+v+"</"+td+">" });
    return r + '</tr>';
}
// When a new game starts, clear previoud end-of-game scoring,
// in case current game ends in stalemate
function clearGameEndScoring() {
    refreshTileOnId('last-tile', "ZT"); // empty tile until real woo
    document.getElementById("last-tile-from").innerHTML = '';
    // Remove win animation
    PUnpl.rmClass(document.getElementById("score-pts"), "ptsWin");
}
function seatToTotPts(i) {
    const name = seatPlayerName(i);
    const scname = PSt.scoring_umap[COpts.ukey(name)] || name;
    return (scname in PSt.scoring.score? PSt.scoring.score[scname].toString() : "--");
}
function refreshWooTileSrc(src, html) {
    if (src > woo_src) {
        woo_src = src;
        document.getElementById("last-tile-from").innerHTML = html;
    }
}

// Display shared dialog for score history
function rcvScoreHist(data) {
    PSt.rcvScoreHist(data);
    showScoreHist();
}
function showScoreHist() {
    CUI.rcvScoreHist(PSt.allScores, PSt.players);
}

// Display discard history
// {"action":"discards","v":"M7-3,FA-0,B1-1,B8c3","deck":"WE,M9,...,M1"}
// discard encoding is "tt", then play as a single char, then src
function rcvDiscards(data) {
    PSt.rcvDiscards(data);
    showDiscards();
}
function showDiscards() {
    PSt.allDiscards.viewing = PSt.allDiscards.latest;
    if (PSt.allDiscards.viewing != null) {
        discardsSummary();
        M.Modal.getInstance(document.getElementById("discardHistory")).open();
    }
}

function gameShutdown() {
    M.Modal.getInstance(document.getElementById("shutdown")).open();
    //window.location.replace("./"); // back to lobby
}

function playerEviction(username) {
    document.getElementById("dl_username").text = username;
    M.Modal.getInstance(document.getElementById("duplicate_login")).open();
    //window.location.replace("./"); // back to lobby
}

function playResultWoo() {
    // Refresh the SVG use link to show the last tile before Woo
    refreshTileOnId('last-tile', PSt.plays.tile);
    setPlayView("gameend");
}

const playViewIds = [
    'playfs', 'discard-line', 'wait4fs', "unplayed",
    'viewwoo', 'viewinit', 'undo'
];
function enaPlayViewPieces(opts) {
    for (const pvid of playViewIds) {
        CUI.show_id(pvid, opts[pvid] || 0);
    }
}
function setPlayView(vname) {
    const nu_RdyFlag = doesViewChangeNeedRefreshOfRdyFlags(UI.view, vname);
    UI.view = vname;
    switch (vname) {
    case "init":
        enaPlayViewPieces({"viewinit":1, "unplayed":1});
        CUI.show_id("other-discard", 0);
        break;
    case "tileplay": // both in-hand and on-discard
        enaPlayViewPieces({"playfs":1, "unplayed":1, "undo":1,
            "discard-line":PSt.plays.allowDiscard
        });
        break;
    case "waiton":
        enaPlayViewPieces({"wait4fs":1, "unplayed":1, "undo":1});
        break;
    case "gameend":
        enaPlayViewPieces({"viewwoo":1});
        // When new unplayed hand arrives, auto-sort
        PUnpl.domUnpAutoSort().checked = true;
        break;
    }
    // Other refresh
    if (nu_RdyFlag) refreshRdyFlags();
}

function init(opts) {
    UiOptions = opts || {};
    // Initialize modal dialogs
    M.Modal.init(document.querySelectorAll('.modal')); // materialize init
    M.Modal.init(document.querySelectorAll('.no-dis'), {'dismissible': false});

    // Initialize drop-down menus
    let snavs = document.querySelectorAll('.sidenav');
    M.Sidenav.init(snavs, { edge: 'right' });
    M.Sidenav.init(chatSliderDiv(), { edge: 'right', onOpenEnd: chatSliderOnOpen });
    let dts = document.querySelectorAll('.dropdown-trigger'); // nav-bar drop-down
    M.Dropdown.init(dts, { coverTrigger: false });

    PUnpl.init(opts);
    setPlayView(UI.view);
    // Allow grid refresh on unplayed resize
    let unp = document.getElementById("unplayed");
    unpBB = unp.getBoundingClientRect(); // on change, refreshGrid
    if (window.ResizeObserver) {
        unpResizeObserver = new ResizeObserver(onResizeUnplayed).observe(unp);
    } else {
        unpResizeObserver = new ResizeObserverPolyfill.ResizeObserver(onResizeUnplayed).observe(unp);
        //chatIncoming('Using ResizeObserverPolyfill');
    }

    let odiscard = document.getElementById('other-discard');
    odiscard.addEventListener("animationend", onDiscardAnimEnd);

    // Discards summary dialog: remember last setting
    const v = COpts.lget("mj-discards-separated");
    if (v) {
        document.getElementById("dall").checked = (v == "0");
        document.getElementById("dsep").checked = (v != "0");
    }
}

export {
    init, refreshCurrWind, refreshCurrDealer,
    refreshPlayerDirs, refreshPlayerNames,
    refreshPlayed, refreshUnplayed, refreshDiscardHistBtn,
    showWsOn, chatShow, chatIncoming, getSvgTileString,
    setPlayView, setViewTilePlay, checkPlayRestrictions,
    rcvWaitOn, rcvReDo, rcvRedoVote, rcvScoreHist, rcvDiscards,
    showDiscards, discardsSummary,
    refreshDiscard, refreshThinking, refreshDiscardTile,
    refreshWaitOn, gameShutdown, clearGameEndScoring,
    playResultWoo, refreshScoring, showScoreHist,
    playerEviction,
}

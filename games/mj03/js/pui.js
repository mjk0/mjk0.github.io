"use strict";
//const urlParams = new URLSearchParams(window.location.search);
import * as PSt from './pst.js';
import * as PUnpl from './punpl.js';

let UiOptions = null; // UI action callbacks
let UI = {
    view: 'init',
    waitOn: {'why':'why', 'who':[]},
};
let unpBB = null; // DIV#unplayed getBoundingClientRect()

function onResize() {
    // Refresh unplayed grid if it's visible
    if (is_visible("unplayed")) PUnpl.refreshGrid();
}

// Refresh our unplayed tiles
function refreshUnplayed() {
    if (!is_visible("unplayed")) {
        set_id_visibility("unplayed", 1);
    }
    PUnpl.refreshUnplayed();
}
function onReadyUnplayed() { // called once unplayed DOM ready
    //this.classList.remove("on-ready");
    let bb = document.getElementById("unplayed").getBoundingClientRect();
    //console.log('completed on-ready anim, unplayed rect: ', bb);
    if (bb.width != unpBB.width || bb.height != unpBB.height) {
        console.log("unplayed size change, re-grid");
        PUnpl.refreshGrid();
    }
}

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
function discardsAsSingleSet() {
    const selWho = discardsFromWho(); // 0-3, 4 for all
    let r = '';
    PSt.allDiscards.viewing.v.split(',').forEach((v,i) => {
        const who = v.substr(3);
        const action = action2Long[v.substr(2,1)]; // "-" means no action
        if (selWho > 3 || selWho == who) {
            let cl = posGame2DirL(who);
            if (action) {
                r += '<div>';
                cl += ' dh-at';
            }
            r += '<svg class="'+cl+'"><use href="media/stiles.svg#'
                +v.substr(0,2)+'"/></svg>';

            // If there was a play action, include action overlay tile
            if (action) {
                r += '<svg class="dh-ov"><use href="media/stiles.svg#ov'
                +action+'"/></svg></div>';
            }
        }
    });
    document.getElementById('discardSingle').innerHTML = r;
    // Deck remaining, if given (at end of game only)
    r = '';
    if (PSt.allDiscards.viewing.deck.length > 0) {
        r = '<legend>Deck remaining tiles</legend>';
        r += mkTileSvg(PSt.allDiscards.viewing.deck, 1, 'tile-m');
    }
    document.getElementById('deck').innerHTML = r;
}
function discardsFromWho() {
    return document.querySelector('input[name="disradio"]:checked').value ||0;
}
const action2Long = {"-":null, w:"woo", g:"gng", p:"po", c:"cha"};

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
        elem.innerHTML = html; // clear old contents
        // update ready flag
        set_id_visibility("rdy"+iv, vrdyok && PSt.hands[ig].r);
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
        if (iv == woo_iv) elem.classList.add('woo-hand');
        else elem.classList.remove('woo-hand');
        // current hand indicator
        if (iv == curr_iv) elem.classList.add('curr-hand');
        else elem.classList.remove('curr-hand');
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
            set_elem_visibility(tt[0], 1);
            let txt = tk2text[val] || val;
            let fc = (doFlash && txt.slice(-1) == "!" ? " think-f" : "");
            let spans = tt[0].getElementsByTagName('span');
            spans[0].className = "think-"+(tk2css[val] || val) + fc;
            spans[0].textContent = txt;
        } else {
            set_elem_visibility(tt[0], 0); // hide responses in tk2hide
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
        if (i<4) PUnpl.svgSetTileString(oid, t, i);
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
    set_id_visibility("b0-pa", !weResponded);
    set_id_visibility("b1-pa", weResponded);
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
    PSt.scoring.multv.forEach((v,i) => { score *= v;
        d += tableRow([PSt.scoring.mults[i] + "(*"+v+")"])
    });
    // Hand score total
    document.getElementById("score-hpts").innerHTML = score.toString();
    document.getElementById("pts-detail").innerHTML = d;
    // Hand score differential
    let tr_diffs = document.getElementById("pts-diff");
    PSt.scoring.diffs.forEach((v,i) => {
        const lMult = -v/score;
        let vs = (lMult<2 ? v.toString()
        : `${v} <span class="score-lmult">&times;${lMult}</span>`);
        tr_diffs.childNodes[i+1].innerHTML = vs;
    });
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
// When a new game starts, clear previoud end-of-game scoring,
// in case current game ends in stalemate
function clearGameEndScoring() {
    refreshTileOnId('last-tile', "ZT"); // empty tile until real woo
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
        discardsAsSingleSet();
        $('#discardHistory').modal('open');
    }
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
    // Allow grid refresh on window resize and unplayed render done
    window.addEventListener("resize", onResize);
    let unp = document.getElementById("unplayed");
    unpBB = unp.getBoundingClientRect(); // on change, refreshGrid
    unp.addEventListener("animationend", onReadyUnplayed);
    //PUnpl.updateGrid(); // calc grid sizes
    let odiscard = document.getElementById('other-discard');
    odiscard.addEventListener("animationend", onDiscardAnimEnd);
}

export {
    init, refreshCurrWind, refreshCurrDealer,
    refreshPlayerDirs, refreshPlayerNames,
    refreshPlayed, refreshUnplayed, refreshDiscardHistBtn,
    showWsOn, chatShow, chatIncoming, getSvgTileString,
    setPlayView, setViewTilePlay,
    rcvWaitOn, rcvReDo, rcvScoreHist, rcvDiscards,
    showDiscards, discardsAsSingleSet,
    refreshDiscard, refreshThinking, refreshDiscardTile,
    refreshWaitOn, gameShutdown, clearGameEndScoring,
    playResultWoo, refreshScoring, showScoreHist,
}

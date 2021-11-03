// Shared code for Mahjong lobby and play pages
//----------------------------------------------------------------
// Translate from game positions (0=East) to view directions: "E", "S", "W", "N"
function posGame2Dir(seat) { return "ESWN".charAt(seat); }

// Score history.  Only handled in the UI
// {"action":"scorehist","date":"2021-10-24T00:51:40Z",
//  "players":["Marcel","r-Sudly","r-Westen","r-Norwin","r-Easton"],
//  "res":[[1053,-702,303,-641,-13,0,0,0,1],[-12,30,-12,-6,0,1,0,1,1], ...
function rcvScoreHist(data, players) {
    // Create table header with complete set of names
    const name_order = data.players.length > 0 ? data.players : players;
    let hdr = "<th>💨</th>";
    for (const n of name_order) { hdr += "<th>"+n+"</th>" }
    document.getElementById("scoreHhead").innerHTML = hdr;

    // Create results table
    let date = new Date(data.date); // date of first entry
    let last_ds = "";
    let html = "";
    const cols = name_order.length + 1;
    const i_dif_date = name_order.length; // date diff in minutes
    const i_dealer_pos = name_order.length + 1;
    const i_win_pos = name_order.length + 2;
    const i_wind = name_order.length + 3;
    let scores = new Array(name_order.length).fill(0); // running scores
    for (const gr of data.res) {
        // get date of the game result
        date.setMinutes(date.getMinutes() + gr[i_dif_date]);
        const ds = date.toLocaleDateString('en-CA'); // 2020-08-19 (year-month-day)
        if (ds != last_ds) {
            // Add line for game result date
            html += `<tr><th colspan="${cols}" class="shDate">${ds}</th></tr>`;
            last_ds = ds;
        }
        // Result row starts with wind
        const windchar = posGame2Dir(gr[i_wind]);
        html += `<tr><td>${windchar}</td>`;
        for (let i=0; i < name_order.length; ++i) {
            scores[i] += gr[i]; // add pts to total score so far
            let pts = gr[i] == 0 ? "--" : scores[i];
            if (i == gr[i_dealer_pos]) pts = `* ${pts} *`;
            const style = (i == gr[i_win_pos])? ' class="shWin"' : '';
            html += `<td${style}>${pts}</td>`;
        }
        html += "</tr>";
    }
    if (data.res.length == 0) {
        html += `<tr><td colspan="${cols}"><i>no score history yet</i></td></tr>`;
    }
    document.getElementById("scoreHbody").innerHTML = html;
    document.getElementById("game_cnt").textContent = data.res.length;
    const eSh = document.getElementById("scoreHistory");
    // open modal dialog
    M.Modal.getInstance(eSh).open();
    // scroll to bottom of the score history:
    eSh.scrollTop = eSh.scrollHeight;
}
const rplayers = ["r-Easton","r-Sudly","r-Westen","r-Norwin"];

// Set(1) or clear(0), or toggle(-1) "hide-me" class on element
// .hide-me { display: none !important; }
function show_elem(elem, boolish) {
    if (boolish < 0) {
        elem.classList.toggle("hide-me");
    } else if (boolish) {
        elem.classList.remove("hide-me");
    } else {
        elem.classList.add("hide-me");
    }
}
function show_id(id, boolish) {show_elem(document.getElementById(id), boolish);}
function show_qs(qs, boolish) {show_elem(document.querySelector(qs), boolish);}

function is_visible(id) {
    return !document.getElementById(id).classList.contains("hide-me");
}

export {
    rplayers,
    posGame2Dir, rcvScoreHist,
    show_elem, show_id, show_qs, is_visible,
};

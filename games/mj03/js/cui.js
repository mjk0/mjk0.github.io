// Shared code for Mahjong lobby and play pages
//----------------------------------------------------------------
// Translate from game positions (0=East) to view directions: "E", "S", "W", "N"
function posGame2Dir(seat) { return "ESWN".charAt(seat); }

// Score history.  Only handled in the UI
// {"action":"scorehist","h":[
//    {"wind":1,"dealer_pos":2,"win_pos":2,"date":"2021-07-15T02:01:08Z",
//      "scores":{"R-Happy":-26,"Marcel":164,"R-Sneezy":-50,"R-Bashful":-88}},
//    {"wind":1,"dealer_pos":1,"win_pos":0,"date":"2021-07-15T01:58:34Z",
//      "scores":{"R-Happy":-42,"Marcel":168,"R-Sneezy":-42,"R-Bashful":-84}}]}
function rcvScoreHist(data, players) {
    // Iterate through all entries to find complete set of named players
    let nmap = {}; // collect all found names
    for (const gr of data.h) { Object.assign(nmap, gr.scores) }

    // Create table header with complete set of names
    const names = Object.keys(nmap);
    for (const n of names) { nmap[n] = 0; }
    let name_order = [...players]; // copy players array
    for (const n of players) { nmap[n] = 1; } // mark those already listed
    for (const n of names) { if (nmap[n] == 0) name_order.push(n); }
    let hdr = "<th>💨</th>";
    for (const n of name_order) { hdr += "<th>"+n+"</th>" }
    document.getElementById("scoreHhead").innerHTML = hdr;

    // Create results table
    let last_ds = "";
    let html = "";
    const cols = name_order.length + 1;
    for (const gr of data.h) {
        // get date of the game result
        const date = new Date(gr.date);
        const ds = date.toLocaleDateString('en-CA'); // 2020-08-19 (year-month-day)
        if (ds != last_ds) {
            // Add line for game result date
            html += `<tr><th colspan="${cols}" class="shDate">${ds}</th></tr>`;
            last_ds = ds;
        }
        // Result row starts with wind
        const windchar = posGame2Dir(gr.wind);
        html += `<tr><td>${windchar}</td>`;
        name_order.forEach((n,i) => {
            let pts = gr.scores.hasOwnProperty(n) ? gr.scores[n] : "--";
            if (i == gr.dealer_pos) pts = `* ${pts} *`;
            const style = (i == gr.win_pos)? ' class="shWin"' : '';
            html += `<td${style}>${pts}</td>`;
        });
        html += "</tr>";
    }
    if (data.h.length == 0) {
        html += `<tr><td colspan="${cols}"><i>no score history yet</i></td></tr>`;
    }
    document.getElementById("scoreHbody").innerHTML = html;
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

/* global */
"use strict";
const urlParams = new URLSearchParams(window.location.search);
const dFormat = {
    year:'numeric', month:'numeric', day:'numeric',
    hour:'2-digit',minute:'2-digit',
    timeZoneName:'short'
};

var Game = {
    server: [
        "wss://pizzamonster.org:8082",
        "wss://pizzamonster.org:8081",
        "wss://pizzamonster.org/games/A45s/wss/"
    ],
    ws: null,

    // Allow Cross-domain AJAX for debugging
    init: function() {
        const test = (urlParams.get('test') || 0);
        if (test > this.server.length)
            test = 0;
        try {
            this.ws = new WebSocket(this.server[test]);
            this.ws.onopen = this.wsOnOpen;
            this.ws.onclose = this.wsOnClose;
            this.ws.onerror = this.wsOnError;
            this.ws.onmessage = this.wsOnMsg;
        } catch (e) {
            console.error(e);
        }
    },

    wsOnOpen: function(ev) {
        console.info("Ws open: "+ev.target.url); // {"isTrusted":true}
    },

    wsOnClose: function(ev) {
        console.info("Ws close: "+ev.target.url);
    },

    wsOnError: function(ev) {
        console.error("Ws error: "+ev);
    },

    wsOnMsg: function(ev) {
        console.info("Ws msg: "+ev.data);
        var j;
        try {
            j = JSON.parse(ev.data);
            if ('action' in j && j.action in WsActionHandlers) {
                WsActionHandlers[j.action](this, j);
            }
        } catch(e) {
            console.error('Error: '+e);
        }
    },

    wsSendMsg: function(data) {
        this.ws.send(JSON.stringify(data));
    },
};

var UI = {
    // Sort by last seen time was clicked
    doSortByDate: false,
    sortByDateClicked: function(e) {
        this.doSortByDate = e.currentTarget.checked;
        this.showUserStats(null); // re-use last data
    },

    // Update display of user stats
    ud: {}, // last received user data
    showUserStats: function(udata) {
        // Fill in stats table
        this.ud = udata || this.ud;
        const ut = $('#utable');
        ut.empty();  // Clear out previous stats

        const uOrder = (this.doSortByDate ? 
            Object.keys(this.ud)
                .sort(function(b, a) {
                    var aa = (UI.ud[a].lastSeenTime || "Z"), bb = (UI.ud[b].lastSeenTime || "Z");
                    return (aa < bb) ? -1 : ((aa > bb) ? 1 : 0)})
            : Object.keys(this.ud));

        uOrder.forEach(u => this.showUserStatsOneLine(u, ut));
    },
    showUserStatsOneLine: function(u, ut) {
        const pastInv = Object.keys(this.ud[u].invited || {});
        var lastSeen;
        if (this.ud[u].lastSeenTime == null) {
            lastSeen = 'connected';
        } else {
            const ti = new Date(this.ud[u].lastSeenTime);
            lastSeen = ti.toLocaleDateString(undefined, dFormat);
        }
        var r = '<tr><td>'+u+'</td><td>'+lastSeen+'</td>';
        r += '<td>'+this.ud[u].completedGameCnt+'</td>';
        r += '<td>'+pastInv.join(',')+'</td></tr>';
        ut.append(r);
    }
};
// {"action":"authenticate"}
function hdlAuthenticate(ws, data) {
    // Request user stats.  No authentication needed
    Game.wsSendMsg({'action': 'userStats'});
}

// {"action":"userStats","data":{"Marcel":{"lastSeenTime":null,"completedGameCnt":0}},"time":"2019-10-18T20:04:38.523Z"}
function hdlUserStats(ws, data) {
    UI.showUserStats(data.data);
    $('#updateTime').text(data.time);
    ws.close();
}

const WsActionHandlers = {
    'authenticate': hdlAuthenticate,
    'userStats' : hdlUserStats
};

// Function that is executed by jQuery code after page load is complete
$(document).ready(function(){
    Game.init();
});

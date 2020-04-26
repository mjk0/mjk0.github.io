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

// {"action":"authenticate"}
function hdlAuthenticate(ws, data) {
    // Request user stats.  No authentication needed
    Game.wsSendMsg({'action': 'userStats'});
}

// {"action":"userStats","data":{"Marcel":{"lastSeenTime":null,"completedGameCnt":0}},"time":"2019-10-18T20:04:38.523Z"}
function hdlUserStats(ws, data) {
    // Fill in stats table
    const ut = $('#utable');
    ut.empty();  // Clear out previous stats
    const ud = data.data || {};
    for (var u in ud) {
        if (ud.hasOwnProperty(u)) {
            const pastInv = Object.keys(ud[u].invited || {});
            var lastSeen;
            if (ud[u].lastSeenTime == null) {
                lastSeen = 'connected';
            } else {
                const ti = new Date(ud[u].lastSeenTime);
                lastSeen = ti.toLocaleDateString(undefined, dFormat);
            }
            var r = '<tr><td>'+u+'</td><td>'+lastSeen+'</td>';
            r += '<td>'+ud[u].completedGameCnt+'</td>';
            r += '<td>'+pastInv.join(',')+'</td></tr>';
            ut.append(r);
        }
    }
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

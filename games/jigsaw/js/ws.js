// WebSocket handling for Jigsaw Puzzle game
"use strict";
const urlParams = new URLSearchParams(window.location.search);

const serverUrls = [
    "wss://pizzamonster.org:8082/games/jigsaw/",
    "wss://pizzamonster.org:8081/games/jigsaw/",
    //"wss://pizzamonster.org/games/jigsaw/wss/"
];
const WsActionHandlers = {
    'list': rcvUrlList,
};

let ws = null;
let rcvCallback = null;
let sendQueue = [];

function wsInit() {
    const test = (urlParams.get('test') || 0);
    if (test > serverUrls.length)
        test = 0;
    try {
        ws = new WebSocket(serverUrls[test]);
        ws.onopen = wsOnOpen;
        ws.onclose = wsOnClose;
        ws.onerror = wsOnError;
        ws.onmessage = wsOnMsg;
    } catch (e) {
        console.error(e);
    }
}

function wsOnOpen(ev) {
    console.info("Ws open: "+ev.target.url); // {"isTrusted":true}
    if (sendQueue.length > 0) {
        sendQueue.forEach((e) => {ws.send(e);});
        sendQueue.length = 0;
    }
}

function wsOnClose(ev) {
    console.info("Ws close: "+ev.target.url);
    ws = null;
}

function wsOnError(ev) {
    console.error("Ws error: "+ev);
}

function wsOnMsg(ev) {
    console.info("Ws msg: "+ev.data);
    var j;
    try {
        j = JSON.parse(ev.data);
        if ('action' in j && j.action in WsActionHandlers) {
            WsActionHandlers[j.action](j);
        }
    } catch(e) {
        console.error('Error: '+e);
    }
}

function wsSendMsg(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    } else {
        // Add to send queue
        sendQueue.push(JSON.stringify(data));
        if (!ws || ws.readyState !== WebSocket.CONNECTING) {
            wsInit(); // to open or reopen, must create new object, attach handlers
        }
    }
}

function close() {
    ws.close();
    ws = null;
}

// {"action":"pzDone"}
function sendPuzzleDone(url, pieces) {
    // Send public image URLs to recent record completions
    if (url.startsWith("data:")) {
        wsSendMsg({'action': 'pzDone', url:'data:(local file)', pieces});
    } else {
        wsSendMsg({'action': 'pzDone', url, pieces});
    }
    sendCloseMe();
}

// Ask server to close connection.  Ensures previous messages sent
function sendCloseMe() {
    wsSendMsg({'action': 'closeMe'});
}

// responds with: {"action":"list", "name":"favorites", "list":[] }
function rcvUrlList(data) {
    rcvCallback(data);
}
function getList(name) {
    // Request named list
    wsSendMsg({'action': 'list', name});
}

function init(cb) {
    rcvCallback = cb;
}

export {
    init, close, sendPuzzleDone, sendCloseMe, getList
};

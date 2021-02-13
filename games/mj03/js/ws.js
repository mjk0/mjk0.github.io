// WebSocket handling core
"use strict";

let WsOptions = null; // URL, action handlers
let ws = null;
let sendQueue = [];

function wsInit() {
    try {
        ws = new WebSocket(WsOptions.serverUrl);
        ws.onopen = wsOnOpen;
        ws.onclose = wsOnClose;
        ws.onerror = wsOnError;
        ws.onmessage = wsOnMsg;
    } catch (e) {
        console.error(e);
        wsClosed();
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
    wsClosed();
}
function wsClosed() {
    ws = null;
    if (WsOptions.hasOwnProperty('onClose')) {
        WsOptions.onClose();
    }
}

function wsOnError(ev) {
    console.error("Ws error: "+ev);
}

function wsOnMsg(ev) {
    console.info("Ws msg: "+ev.data);
    var j;
    try {
        j = JSON.parse(ev.data);
        if ('action' in j && j.action in WsOptions.actionHandlers) {
            WsOptions.actionHandlers[j.action](j);
        }
    } catch(e) {
        console.error('Error: '+e);
    }
}

function sendMsg(data) {
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
// Allow login function to clear queued msgs on re-connect
function wsClrSendQ() {
    sendQueue.length = 0;
}

function close() {
    ws.close(); // Triggers onClose event if was previously open
    ws = null;
}

// Ask server to close connection.  Ensures previous messages sent
function sendCloseMe() {
    wsSendMsg({'action': 'closeMe'});
}

function init(opts) {
    WsOptions = opts;
}

export {
    init, close, sendMsg, sendCloseMe, wsClrSendQ,
};

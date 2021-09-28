// Mahjong Beta shared options and parameters
const urlParams = new URLSearchParams(window.location.search);
const urlPkeys = ['mj-ar', 'mj-dev'];

const sess_k = { // value is default
    // Session persistence (each browser tab is different)
    mj_username: null, mj_email: null,
    mj_game: null, mj_seat: 0, mj_uuid: null,

    // URL params
    'mj-ar': "1", // autoReconnect
    'mj-dev': "0", // "1" / "0" -> port 3031 / 3030
};
var isDev = false;

// if the given URL parameter is defined, save it to session storage
function initFromUrlParam(k) {
    let value = urlParams.get(k);
    if (value !== null) set(k,value);
}
function clrPastUrlParams() { urlPkeys.forEach(k => rm(k)); }

function get(k,def) { return sessionStorage.getItem(k) || def || sess_k[k] }
function set(k,v) { return sessionStorage.setItem(k,v) }
function rm(k) { return sessionStorage.removeItem(k) }

function lget(k,def) { return localStorage.getItem(k) || def }
function lset(k,v) { return localStorage.setItem(k,v) }
function lrm(k) { return localStorage.removeItem(k) }

function init(WsOptions) {
    // Initialize from optional URL parameters
    urlPkeys.forEach(k => initFromUrlParam(k));
    isDev = get('mj-dev') >= 1;
    if (!isDev) { //true/false -> port 3031/3030
        if (WsOptions.hasOwnProperty('serverUrl')) {
            WsOptions.serverUrl = WsOptions.serverUrl.replace(':3031',':3030');
        }
        if (WsOptions.hasOwnProperty('serverBase')) {
            WsOptions.serverBase = WsOptions.serverBase.replace(':3031',':3030');
        }
    }
}

export {
    isDev,
    init, get, set, clrPastUrlParams, rm, lget, lset, lrm,
};

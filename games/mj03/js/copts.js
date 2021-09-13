// Mahjong Beta shared options and parameters
const urlParams = new URLSearchParams(window.location.search);

const sess_k = { // value is default
    // Session persistence (each browser tab is different)
    mj_username: null, mj_email: null,
    mj_game: null, mj_seat: 0, mj_uuid: null,

    // URL params
    'mj-ar': "1", // autoReconnect
    'mj-dev': "1", // true / false -> port 3031 / 3030
};

// if the given URL parameter is defined, save it to session storage
function initFromUrlParam(k) {
    let value = urlParams.get(k);
    if (value !== null) set(k,value);
}

function get(k,def) { return sessionStorage.getItem(k) || def || sess_k[k] }
function set(k,v) { return sessionStorage.setItem(k,v) }
function rm(k) { return sessionStorage.removeItem(k) }

function init(WsOptions) {
    // Initialize from optional URL parameters
    initFromUrlParam('mj-ar');
    initFromUrlParam('mj-dev');
    const isDev = get('mj-dev') == "1";
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
    init, get, set, initFromUrlParam, rm,
};

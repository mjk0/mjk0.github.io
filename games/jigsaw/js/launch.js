"use strict";
import * as Ws from './ws.js';
import * as Lists from './l_lists.js';
const urlParams = new URLSearchParams(window.location.search);

function get_radio_group_value(group) {
    return $('input[name="'+group+'"]:checked').val();
}

function pre_puzzle() {
    // Get number of pieces selection for puzzle
    let numPieces = get_radio_group_value('pieces') || 25;
    localStorage.Jigsaw_numPieces = numPieces;
    let areaRatio = get_radio_group_value('areaRatio') || 2.5;
    localStorage.Jigsaw_areaRatio = areaRatio;
    localStorage.Jigsaw_img_url = img_url.value;
    //alert('in pre_puzzle()');
    return true;
}

const custom_no_img = "media/no-image.png";
var img_url, img_test, img_test_result;
var img_custom;
var file_open_dialog, paste_url, input_paste;

function test_image() {
    img_test.src = img_url.value;
}
function img_test_passed(event) {
    img_test_result.innerHTML = "[Result: &#9989; Good]";
}
function img_test_failed(event) {
    img_test_result.innerHTML = "[Result: &#10060; Bad]";
}

// Resume tab selected
var resumeState = null;
function tab_resume() {
    // If anything to resume, will be in resumeState
    if (resumeState !== null) {
        let rs = JSON.parse(resumeState);
        select_custom(rs.url);
        let last_numPieces = rs.numPieces;
        set_radio_group_value('pieces', last_numPieces);
        let last_areaRatio = rs.areaRatio;
        set_radio_group_value('areaRatio', last_areaRatio);

        // Show resume puzzle options
        /*p_resume.innerHTML = 'Puzzle options: '+last_numPieces+' pieces, '
            +Math.round(100/last_areaRatio)+'% zoom'; */
    }
}
// Called just before launching href="puzzle.html"
function start_resume() {
    tab_resume();
    pre_puzzle();
}

function set_radio_group_value(group, val) {
    $('input[name="'+group+'"][value="'+val+'"]').prop('checked', true);
}

var mi_preview, mi_preview_span;
function mi_preview_accepted() {
    select_custom(mi_preview.src);
}
function mi_preview_failed() {
    mi_preview.src="media/exclamation-pink-300x300.png";
    mi_preview_span.innerHTML = "Preview";
}
var mi_list_in_catalog = ""; // no list fills div_mi_catalog
function show_dialog_named_list(name) {
    $('#moreImages').modal('open');
    if (mi_list_in_catalog != name) {
        if (Lists.exists(name)) {
            fill_dialog_from_server_list(name);
        } else {
            Ws.getList(name);
        }
    }
}
function fill_dialog_from_server_list( name ) {
    const arr = Lists.getList(name);
    const micat_elem = document.getElementById('div_mi_catalog');
    micat_elem.innerHTML = '';
    let cnt = 0;

    // Create <img> tags for each server URL list entry
    arr.forEach(e => {
        ++cnt;
        var img = document.createElement("img");
        img.className = "more-images";
        img.src = e.url || e;
        img.alt = e.title || ("image "+cnt);
        img.addEventListener('click', function(event) {
            mi_preview.src = event.target.src;
            mi_preview_span.innerHTML = '"'+event.target.alt+'"';
        });
        micat_elem.appendChild(img);
    });
    mi_list_in_catalog = name;
}

// Allow user to Paste an image URL
function show_dialog_from_url() {
    $(paste_url).modal('open');
    input_paste.value = '';
    input_paste.focus();
}
function input_paste_keypress(event) {
    //console.log(event);
    if (event.key == "Enter") {
        input_paste_accept();
        $(paste_url).modal('close');
    }
}
function input_paste_accept() {
    //console.log(event);
    select_custom(input_paste.value);
}

// Pre-set url text field and preview
function select_custom(theurl) {
    img_url.value = theurl;
    img_custom.src = theurl;
}
// After img_custom load success, calls this event handler
function img_aspect_onload(ev) {
    // image and container aspect ratios
    let ic_ratio = ev.target.naturalWidth / ev.target.naturalHeight; // natural aspect ratio
    let ct_ratio = ev.target.parentElement.clientWidth / ev.target.parentElement.clientHeight;
    if (ic_ratio > ct_ratio && ev.target.classList.contains('img-tall')) {
        ev.target.classList.remove('img-tall');
        ev.target.classList.add('img-wide');
    } else if (ic_ratio < ct_ratio && ev.target.classList.contains('img-wide')) {
        ev.target.classList.remove('img-wide');
        ev.target.classList.add('img-tall');
    }
}
function img_custom_onerror(ev) {
    img_custom.src = "media/exclamation-pink-300x300.png";
}

// File chosen from computer local files
function file_open_dialog_onchange(e) {
    let file = e.target.files[0];
    const reader = new FileReader();

    reader.addEventListener("load", function () {
        // convert image file to base64 string
        select_custom(reader.result);
    }, false);

    if (file) {
        reader.readAsDataURL(file);
    }
}

// Receive a URL list from the server
function wsRcvList(data) {
    // server responds with: {"action":"list", "name":"favorites", "list":[] }
    Lists.setList(data.name, data.list);
    fill_dialog_from_server_list(data.name);
}

function set_visibility(selector, bool) {
    if (bool) {
        $(selector).show();
    } else {
        $(selector).hide();
    }
}

// Function that executes jQuery code after page load is complete
$(document).ready(function(){
    //let a_start = document.getElementById("a_start");
    //a_start.addEventListener("click", pre_puzzle);
    mi_preview = document.getElementById('moreImagesPreview');
    mi_preview_span = document.getElementById('mi_preview_span');
    mi_preview.addEventListener("error", mi_preview_failed);
    mi_preview.addEventListener("load", img_aspect_onload);

    // Save img_url input field element ref
    img_url = document.getElementById("img_url");
    // Save img tag for test
    img_test = document.getElementById("img_test");
    img_test.addEventListener("load", img_test_passed);
    img_test.addEventListener("error", img_test_failed);
    img_test_result = document.getElementById("img_test_result");
    // Custom img preview
    img_custom = document.getElementById("img-custom");
    img_custom.onload = img_aspect_onload;
    img_custom.onerror = img_custom_onerror;

    // From URL handling
    paste_url = document.getElementById("pasteURL");
    input_paste = document.getElementById("input_paste");
    paste_url.onkeypress = input_paste_keypress;

    // File input dialog trigger
    file_open_dialog = document.getElementById("file-input");
    file_open_dialog.onchange = file_open_dialog_onchange;

    // Image URL passed as URL parameter?
    const img_url_param = urlParams.get('url');
    // If anything to resume, will be at hash with this key
    resumeState = localStorage.getItem("Jigsaw_scramble");
    set_visibility('#resume_btn', resumeState !== null);

    // Restore previous values if present in localStorage
    if (img_url_param) {
        select_custom(img_url_param);
    } else if (resumeState !== null) {
        // Start with state of last incomplete puzzle
        tab_resume();
    } else if (localStorage.Jigsaw_img_url) {
        // Last started or completed image
        select_custom(localStorage.Jigsaw_img_url);
    }

    // Restore option selections
    if (localStorage.Jigsaw_numPieces) {
        set_radio_group_value('pieces', localStorage.Jigsaw_numPieces);
    }
    if (localStorage.Jigsaw_areaRatio) {
        set_radio_group_value('areaRatio', localStorage.Jigsaw_areaRatio);
    }

    // Initialize Ws module (does not establish WebSocket until sending first message)
    Ws.init(wsRcvList);

    // Initialize modal dialogs
    $('.modal').modal();
});

export {
    pre_puzzle, test_image,
    tab_resume, start_resume,
    show_dialog_from_url, input_paste_keypress, input_paste_accept,
    show_dialog_named_list, mi_preview_accepted
};

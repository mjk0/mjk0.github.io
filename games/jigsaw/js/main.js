import * as Jig from './jigsaw.js';
import * as Drag from './drag.js';
"use strict";

const jopts = {
    'pieces':   50, // target # of pieces
    'areaRatio': 2.5, // target area ratio (completed puzzle / viewbox)
};
const UIopts = {
    'scrAvoidCenter': 0,
    'scrAvoidPreview': 1,
    'previewSize': 0.5, // scale each dimention by this amount for preview tile
};
var svg;

function scramble_puzzle() {
    Drag.snap_grp_clear_all();
    Jig.scramble_tiles(UIopts);
}
function show_preview_image() {
    Jig.create_preview_tile(UIopts.previewSize); // max 50% scale
}
function set_scramble_no_center_area(val) {
    UIopts.scrAvoidCenter = val ? 1 : 0;
    localStorage.Jisaw_scrAvoidCenter = val ? 1 : 0;
}
function set_scramble_no_preview_area(val) {
    UIopts.scrAvoidPreview = val ? 1 : 0;
    localStorage.Jisaw_scrAvoidPreview = val ? 1 : 0;
}
function set_preview_size(val) {
    UIopts.previewSize = val;
    localStorage.Jigsaw_previewSize = val;
    Jig.resize_preview_tile(val);
}

function svg_init() {
    $('path').remove(); // remove all existing SVG path elements

    // Get/Set user options
    UIopts.scrAvoidCenter = +(localStorage.Jigsaw_scrAvoidCenter || UIopts.scrAvoidCenter);
    UIopts.scrAvoidPreview = +(localStorage.Jigsaw_scrAvoidPreview || UIopts.scrAvoidPreview);
    UIopts.previewSize = +(localStorage.Jigsaw_previewSize || UIopts.previewSize);
    $('#scramble_no_center_area')[0].checked = UIopts.scrAvoidCenter;
    $('#scramble_no_preview_area')[0].checked = UIopts.scrAvoidPreview;
    $('input[name="preview_zoom"][value="'+UIopts.previewSize+'"]').prop('checked', true);

    // Set puzzle image URL
    if (localStorage.Jigsaw_img_url) {
        var svg_image = document.getElementsByTagName('image')[0];
        svg_image.setAttribute('xlink:href', localStorage.Jigsaw_img_url);
    }

    // Get/Set number of pieces, and zoom level (area ratio)
    jopts.pieces = +(localStorage.Jigsaw_numPieces || jopts.pieces);
    jopts.areaRatio = +(localStorage.Jigsaw_areaRatio || jopts.areaRatio);

    // Create puzzle
    Jig.update(jopts, { class: 'draggable' }, (viewBox) => {
        // Enable drag & drop
        Drag.drag_init(svg, viewBox);

        // If SVG resizes, allow jigsaw viewBox to resize
        window.addEventListener('resize', (event) => {
            Jig.svg_resize_handler(event, (viewBox) => {
                Drag.sound_snap_play();
                Drag.change_boundaries(viewBox);
            });
        });
    });
}
// Function that executed jQuery code after page load is complete
$(document).ready(function(){
    console.log('main.js, document ready');
    svg = document.getElementsByTagName("svg")[0];
    svg_init();
});

export {
    jopts, Drag, Jig,
    scramble_puzzle, show_preview_image,
    set_scramble_no_center_area, set_scramble_no_preview_area, set_preview_size
};


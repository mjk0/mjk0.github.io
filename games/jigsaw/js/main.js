import * as Jig from './jigsaw.js';
import * as Drag from './drag.js';
import * as Ws from './ws.js';
"use strict";

const jopts = {
    'pieces':   50, // target # of pieces
    'areaRatio': 2.5, // target area ratio (completed puzzle / viewbox)
};
const UIopts = {
    'scrAvoidCenter': 1,
    'scrAvoidPreview': 1,
    'previewSize': 0.33, // scale each dimention by this amount for preview tile
};
var svg, ebtns;

function scramble_puzzle() {
    Drag.menu_collapse();
    Drag.snap_grp_clear_all();
    Jig.scramble_tiles(UIopts);
    Jig.create_preview_tile(UIopts.previewSize);
    Drag.btn_mvObTiles_disable(false); // Enable "Raise hidden tiles" button
}
function show_preview_image() {
    Drag.menu_collapse();
    Jig.create_preview_tile(UIopts.previewSize); // max 50% scale
}
function move_obscured_tiles() {
    Drag.menu_collapse();
    Drag.tiles_show_hidden(UIopts);
}
function remove_flashing_animation() {
    Drag.animate_stroke_tiles_cleanup();
}
function tiles_show_edges() {
    Drag.menu_collapse();
    // Buttons act as toggles for edge effect.  Check if currently on
    if (ebtns[0].classList.contains('edge-effect')) {
        // Currently on, remove animation effects
        Drag.animate_stroke_tiles_cleanup();
        ebtns.forEach((e) => {e.classList.remove('edge-effect')});
    } else {
        Drag.tiles_show_edges();
        ebtns.forEach((e) => {e.classList.add('edge-effect')});
    }
}
function fullscreen_toggle() {
    if (screenfull.isEnabled) {
        Drag.menu_collapse();
		screenfull.toggle();
	}
}
function settings_collapse() { Drag.settings_collapse(); }
function more_collapse() { Drag.more_collapse(); }
function set_scramble_no_center_area(val) {
    UIopts.scrAvoidCenter = val ? 1 : 0;
    localStorage.Jigsaw_scrAvoidCenter = val ? 1 : 0;
}
function set_scramble_no_preview_area(val) {
    UIopts.scrAvoidPreview = val ? 1 : 0;
    localStorage.Jigsaw_scrAvoidPreview = val ? 1 : 0;
}
function set_preview_size(val) {
    UIopts.previewSize = val;
    localStorage.Jigsaw_previewSize = val;
    Jig.resize_preview_tile(val);
}
function set_bg_color(val) {
    document.body.style.background = val;
    localStorage.Jigsaw_bgColor = val;
}

function svg_init() {
    $('path').remove(); // remove all existing SVG path elements
    if (localStorage.Jigsaw_bgColor) {
        set_bg_color(localStorage.Jigsaw_bgColor);
        $('input[name="bgcolor"]')[0].value = localStorage.Jigsaw_bgColor;
    }

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
        Drag.btn_mvObTiles_disable(Jig.pss === null); // Enable/Disable "Raise hidden tiles" button

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
    ebtns = document.querySelectorAll('.edge-btn');

    /*if (!screenfull.isEnabled) {
        document.getElementById('fs_toggle').disabled = true;
    }*/
});

export {
    jopts, Drag, Jig, Ws,
    scramble_puzzle, show_preview_image, fullscreen_toggle,
    move_obscured_tiles, remove_flashing_animation, tiles_show_edges,
    set_scramble_no_center_area, set_scramble_no_preview_area,
    set_preview_size, set_bg_color,
    more_collapse, settings_collapse,
};


import * as Jig from './jigsaw.js';
import * as Drag from './drag.js';

const jopts = {
    'pieces':   400, // target # of pieces
};
var svg;

function scramble_puzzle() {
    Drag.snap_grp_clear_all();
    Jig.scramble_tiles();
}
function show_preview_image() {
    Jig.create_preview_tile(0.5); // 50% scale
}

function svg_init() {
    $('path').remove(); // remove all existing SVG path elements

    // Set puzzle image URL
    if (localStorage.Jigsaw_img_url) {
        var svg_image = document.getElementsByTagName('image')[0];
        svg_image.setAttribute('xlink:href', localStorage.Jigsaw_img_url);
    }

    // Get/Set number of pieces
    jopts.pieces = +(localStorage.Jigsaw_numPieces || jopts.pieces);

    // Create puzzle
    Jig.update(jopts, { class: 'draggable' }, (viewBox) => {
        // Enable drag & drop
        Drag.drag_init(svg, viewBox);

        // If SVG resizes, allow jigsaw viewBox to resize
        window.addEventListener('resize', (event) => {
            Jig.svg_resize_handler(event, (viewBox) => {
                Drag.play_snap_sound();
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

export { jopts, Drag, Jig, scramble_puzzle, show_preview_image };

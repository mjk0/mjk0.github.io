/////////////////
// SVG Drag and Drop support,
// from: http://www.petercollingridge.co.uk/tutorials/svg/interactive/dragging/
//
import * as Jig from './jigsaw.js';

var svg;
var selectedElement, offset, transform,
    minX, maxX, minY, maxY;
var snap_sound;
var drg = {
    r:          0,  // row of dragging tile
    c:          0,  // col of dragging tile
    bb:         null,   // bounding box
    snap_tol:   0.06,   // 6% of tile width
};

var boundaryX1;
var boundaryX2;
var boundaryY1;
var boundaryY2;

function drag_init(thesvg, viewBox) {
    svg = thesvg;
    svg.addEventListener('mousedown', startDrag);
    svg.addEventListener('mousemove', drag);
    svg.addEventListener('mouseup', endDrag);
    svg.addEventListener('mouseleave', endDrag);
    svg.addEventListener('touchstart', startDrag);
    svg.addEventListener('touchmove', drag);
    svg.addEventListener('touchend', endDrag);
    svg.addEventListener('touchleave', endDrag);
    svg.addEventListener('touchcancel', endDrag);

    snap_sound = document.getElementById('snap-sound');
    set_boundaries(viewBox);
}
function set_boundaries(viewBox) {
    boundaryX1 = viewBox.minX;
    boundaryX2 = viewBox.minX + viewBox.w;
    boundaryY1 = viewBox.minY;
    boundaryY2 = viewBox.minY + viewBox.h;
}

function play_snap_sound() {
    snap_sound.play();
}

function getMousePosition(evt) {
    var CTM = svg.getScreenCTM();
    if (evt.touches) { evt = evt.touches[0]; }
    return {
        x: (evt.clientX - CTM.e) / CTM.a,
        y: (evt.clientY - CTM.f) / CTM.d
    };
}

function startDrag(evt) {
    if (evt.target.classList.contains('draggable')) {
        selectedElement = evt.target;
        offset = getMousePosition(evt);

        // Make sure the first transform on the element is a translate transform
        var transforms = selectedElement.transform.baseVal;
        /*
        if (transforms.length === 0 || transforms.getItem(0).type !== SVGTransform.SVG_TRANSFORM_TRANSLATE) {
            // Create an transform that translates by (0, 0)
            var translate = svg.createSVGTransform();
            translate.setTranslate(0, 0);
            selectedElement.transform.baseVal.insertItemBefore(translate, 0);
        } */

        // Get initial translation
        transform = transforms.getItem(0);
        offset.x -= transform.matrix.e;
        offset.y -= transform.matrix.f;

        // No moving pieces outside the viewBox
        drg.bb = selectedElement.getBBox();
        minX = boundaryX1 - drg.bb.x;
        maxX = boundaryX2 - drg.bb.x - drg.bb.width;
        minY = boundaryY1 - drg.bb.y;
        maxY = boundaryY2 - drg.bb.y - drg.bb.height;

        // Check snap tolerance
        drg.snap_tol = $('input[name=snap]:checked').val();

        // get row & col of dragging tile
        let rc = selectedElement.id.split(',');
        if (rc.length == 2) {
            drg.r = +rc[0];
            drg.c = +rc[1];
        } else {
            console.error('startDrag: bad id r/c');
        }
    }
}

var lastDragTime = 0.1;
function drag(evt) {
    if (selectedElement) {
        evt.preventDefault();
        let t = performance.now();

        if (t - lastDragTime > 50) {
            lastDragTime = t;
            var coord = getMousePosition(evt);
            var dx = coord.x - offset.x;
            var dy = coord.y - offset.y;
    
            if (dx < minX) { dx = minX; }
            else if (dx > maxX) { dx = maxX; }
            if (dy < minY) { dy = minY; }
            else if (dy > maxY) { dy = maxY; }
    
            // Check for drag snap to neighbor tile
            if (drg.snap_tol > 0) {
                let ndelta = Jig.snap_to_neighbor(drg, dx, dy);
                if (ndelta) {
                    dx = ndelta.dx;
                    dy = ndelta.dy;
                    // end drag since snapping
                    selectedElement = false;
                    play_snap_sound();
                }
            }
            transform.setTranslate(dx, dy);
        }
    }
}

function endDrag(evt) {
    selectedElement = false;
}

// When a resize happens, tiles may fall outside the new viewBox
function change_boundaries(viewBox) {
    // Accept new viewBox
    set_boundaries(viewBox);

    // Check that every path is within the viewbox
    let paths = svg.getElementsByTagName('path');
    for (let el of paths) {
        let transform = el.transform.baseVal.getItem(0);
        let offsetX = transform.matrix.e;
        let offsetY = transform.matrix.f;
        let bbminx = +el.getAttribute('bbminx'); // '+' converts to numeric
        let bbmaxx = +el.getAttribute('bbmaxx');
        let bbminy = +el.getAttribute('bbminy');
        let bbmaxy = +el.getAttribute('bbmaxy');

        // Check all 4 edges
        if (bbminx + offsetX < boundaryX1) {
            offsetX = boundaryX1 - bbminx;
            transform.setTranslate(offsetX, offsetY);
        }
        if (bbmaxx + offsetX > boundaryX2) {
            offsetX = boundaryX2 - bbmaxx;
            transform.setTranslate(offsetX, offsetY);
        }
        if (bbminy + offsetY < boundaryY1) {
            offsetY = boundaryY1 - bbminy;
            transform.setTranslate(offsetX, offsetY);
        }
        if (bbmaxy + offsetY > boundaryY2) {
            offsetY = boundaryY2 - bbmaxy;
            transform.setTranslate(offsetX, offsetY);
        }
    }
}

export {
    drag_init, change_boundaries, play_snap_sound
};

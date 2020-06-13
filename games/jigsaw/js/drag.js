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
var selectedElement_isg; // snap group of selectedElement
var idSgrp = []; // map from id to snap group.  -1 means no snap group
var sgrps = [];  // snap groups.  Each entry is { ids:[], bb:{minx, maxx, miny, maxy}}

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
    snap_grp_clear_all();
    set_boundaries(viewBox);
}
function snap_grp_clear_all() {
    sgrps.length = 0;   // empty the array
    idSgrp.length = Jig.P.yn * Jig.P.xn;
    idSgrp.fill(-1);
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
        selectedElement_isg = idSgrp[+selectedElement.id];
        if (selectedElement_isg >= 0) {
            // Selected element is part of a snap group.  Use group bb
            minX = boundaryX1 - sgrps[selectedElement_isg].bb.minx;
            maxX = boundaryX2 - sgrps[selectedElement_isg].bb.maxx;
            minY = boundaryY1 - sgrps[selectedElement_isg].bb.miny;
            maxY = boundaryY2 - sgrps[selectedElement_isg].bb.maxy;
        } else {
            drg.bb = selectedElement.getBBox();
            minX = boundaryX1 - drg.bb.x;
            maxX = boundaryX2 - drg.bb.x - drg.bb.width;
            minY = boundaryY1 - drg.bb.y;
            maxY = boundaryY2 - drg.bb.y - drg.bb.height;
        }

        // Check snap tolerance
        drg.snap_tol = $('input[name=snap]:checked').val();

        // get row & col of dragging tile
        Jig.id_to_rc(selectedElement.id, drg);
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
            let id_snap_to = -1;
            if (drg.snap_tol > 0) {
                let ndelta = selectedElement_isg >= 0 ?
                    Jig.snap_grp_to_neighbor(drg, dx, dy, sgrps[selectedElement_isg].neighbors)
                    : Jig.snap_to_neighbor(drg, dx, dy);
                if (ndelta) {
                    dx = ndelta.dx;
                    dy = ndelta.dy;
                    id_snap_to = ndelta.rc;
                    // end drag since snapping
                    play_snap_sound();
                }
            }
            transform.setTranslate(dx, dy);
            // if selected is part of a snap group, move entire group
            if (selectedElement_isg >= 0) {
                snap_grp_drag(selectedElement_isg, selectedElement.id, dx, dy);
            }
            if (id_snap_to >= 0) {
                // if snapping, handle group merge or creation
                let isg_new = snap_grp_merge(selectedElement.id, id_snap_to);
                // Refresh snap group's neighbors list
                snap_grp_find_neighbors(isg_new);
                console.log('sn['+isg_new+'] has ids:'
                    +sgrps[isg_new].ids.length+' neighbors:'
                    +sgrps[isg_new].neighbors.length);
                selectedElement = false;
            }
        }
    }
}

// Move snap group other than given ID to new coordinates
function snap_grp_drag(isg, id0, dx, dy) {
    for (let id of sgrps[isg].ids) {
        if (id != id0) {
            let transform = svg.getElementById(id).transform.baseVal.getItem(0);
            transform.setTranslate(dx, dy);
        }
    }
}

// Look up snap group index for given id.  -1 if none
function id_to_isg(id) {
    return idSgrp[+id];
}

// Merge snap groups.  REturned isg of merged group
function snap_grp_merge(id_dragging, id_snap_to) {
    let isg = id_to_isg(id_dragging); // -1 means no group (since index into sgrps array)
    let isg_to = id_to_isg(id_snap_to);

    if (isg < 0 && isg_to < 0) {
        // both previously unattached.  Create new group
        isg = snap_grp_from_id(id_dragging);
        return snap_grp_add(isg, id_snap_to);
    } else if (isg < 0 && isg_to >= 0) {
        // Add selected to existing group
        return snap_grp_add(isg_to, id_dragging);
    } else if (isg >= 0 && isg_to < 0) {
        // Add target to existing group
        return snap_grp_add(isg, id_snap_to);
    } else {
        // merge 2 existing groups.  Use smaller index
        let isg_fr = (isg < isg_to ? isg_to : isg);
        let isg_merged = (isg < isg_to ? isg : isg_to);
        for (let id of sgrps[isg_fr].ids) {
            snap_grp_add(isg_merged, id);
        }
        snap_grp_remove(isg_fr); // remove entire group
        return isg_merged;
    }
}

// Create new snap group from one id
function snap_grp_from_id(id) {
    let isg = sgrps.length;
    let bb = svg.getElementById(id).getBBox();
    let sg = {ids:[+id], bb:{minx:bb.x, maxx:(bb.x+bb.width), miny:bb.y, maxy:(bb.y+bb.height)}};
    sgrps.push(sg);
    idSgrp[+id] = isg; // allow lookup of sgrp from id
    return isg;
}

// Add a tile to an existing snap group
function snap_grp_add(isg, id) {
    let bb = svg.getElementById(id).getBBox();
    let sg = sgrps[isg];
    sg.ids.push(+id);
    idSgrp[+id] = isg; // allow lookup of sgrp from id
    // Check for expanded bounding box
    if (bb.x < sg.bb.minx) { sg.bb.minx = bb.x; }
    if (bb.x+bb.width > sg.bb.maxx) { sg.bb.maxx = bb.x+bb.width; }
    if (bb.y < sg.bb.miny) { sg.bb.miny = bb.y; }
    if (bb.y+bb.height > sg.bb.maxy) { sg.bb.maxy = bb.y+bb.height; }
    return isg;
}

// Remove a snap group completely
function snap_grp_remove(isg) {
    sgrps[isg] = null;
    // Prune end of array
}

function endDrag(evt) {
    selectedElement = false;
}

// Get the list of all snap group neighbors to check
function snap_grp_find_neighbors(isg) {
    sgrps[isg].neighbors = []; // list of neighbors to check
    let added = []; added.length = Jig.P.yn * Jig.P.xn; added.fill(false);
    let drg = {};
    for (let id of sgrps[isg].ids) {
        Jig.id_to_rc(id, drg);
        // Check all 4 neighbors.
        // Stop if snap outside of the group is possible
        for (let dd of [[-1,0], [0,-1], [0,1], [1,0]]) {
            let r = drg.r + dd[0];
            let c = drg.c + dd[1];
            if (r >= 0 && r < Jig.P.yn && c >= 0 && c < Jig.P.xn) {
                let rc = r*Jig.P.xn+c;
                if (idSgrp[rc] != isg && !added[rc]) {
                    sgrps[isg].neighbors.push(rc);
                    added[rc] = true;
                }
            }
        }
    }
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
    drag_init, change_boundaries, play_snap_sound, snap_grp_clear_all
};

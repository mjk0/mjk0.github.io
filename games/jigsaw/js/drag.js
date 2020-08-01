/////////////////
// SVG Drag and Drop support,
// from: http://www.petercollingridge.co.uk/tutorials/svg/interactive/dragging/
//
import * as Jig from './jigsaw.js';
import { Ws } from './main.js';

var svg;
var selectedElement, offset, transform,
    minX, maxX, minY, maxY;
var snap_sound, tada_sound;
var settings_panel, more_btn;
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
    tada_sound = document.getElementById('tada-sound');
    settings_panel = document.getElementById('settings');
    more_btn = document.getElementById('more_btn');

    // Initialize drag group data
    drg.bb = {width:(Jig.P.naturalWidth/Jig.P.xn), height:(Jig.P.naturalHeight/Jig.P.yn)};
    snap_grp_clear_all({ 'create_for_original_image':true });
    set_boundaries(viewBox);
}
function snap_grp_clear_all(opts) {
    sgrps.length = 0;   // empty the array
    idSgrp.length = Jig.P.yn * Jig.P.xn;
    if (opts && opts.create_for_original_image) {
        if (Jig.pss === null) {
            // Create single snap group from initial completed image
            let sg = {
                ids:[...Array(Jig.P.yn * Jig.P.xn).keys()],
                bb:{minx:0, maxx:Jig.P.naturalWidth, miny:0, maxy:Jig.P.naturalHeight},
                neighbors: [] // no neighbors to check
            };
            sgrps.push(sg);
            idSgrp.fill(0); // allow lookup of sgrp[0] from any id
        } else {
            // find snap groups from restored tile layout
            idSgrp.fill(-1);
            snap_grp_restore();
        }
    } else {
        idSgrp.fill(-1);
    }
}
// Create all new snap groups for restored layout
function snap_grp_restore() {
    // Discover snap groups
    for (let idn=0; idn < idSgrp.length; ++idn) {
        // uses recursion to trace connected neighbors
        snap_grp_restore_neighbors(idn);
    }
    // Find neighbors for each found group
    for (let isg=0; isg < sgrps.length; ++isg) {
        snap_grp_find_neighbors(isg);
    }
}

// Is there a puzzle in progress?  Ignore if just scrambled, but no snap groups
function isPuzzleInProgress() {
    return (Jig.pss !== null && sgrps.length > 0);
}

// Return an array of sorted sgrps indices, with the largest group first
function snap_grp_sorted_indices() {
    let arr = [];
    // removed snap groups are set to null
    for (let sgi=0; sgi < sgrps.length; ++sgi) {
        if (sgrps[sgi] !== null) {
            arr.push(sgi);
        }
    }
    // Sort by group size
    arr.sort((a,b) => {
        return sgrps[a].ids.length - sgrps[b].ids.length;
    });
    return arr;
}

// Show edge tiles by fading non-edge tiles
function tiles_show_edges() {
    let idrc = {r:-1, c:-1};
    for(let el=svg.firstChild; el!==null; el=el.nextSibling) {
        if (el.id >= "0" && el.id < "A") {
            Jig.id_to_rc(el.id, idrc);
            // Is it a non-edge piece?
            if (idrc.r > 0 && idrc.r < Jig.P.yn-1 && idrc.c > 0 && idrc.c < Jig.P.xn-1) {
                let anim = anim_create({
                    attributeName:'opacity', values:'1;0.1', repeatCount:'1', fill:'freeze'
                });
                el.appendChild(anim);
                anim.beginElement();
            }
        }
    }

}
// Create SVG animate element, with preset duration and repeatCount
function anim_create(attr) {
    let anim = document.createElementNS("http://www.w3.org/2000/svg", "animate");
    Jig.svg_add_attributes(anim, { dur:'1s', repeatCount:'indefinite' });
    Jig.svg_add_attributes(anim, attr);
    return anim;
}

// Find any tiles that are obstructed, and make them visible
function tiles_show_hidden(opts) {
    animate_stroke_tiles_cleanup();
    let gsp = Jig.init_spacing_grid(opts);
    let sgi = snap_grp_sorted_indices();
    let pos = {x:0, y:0};
    //const sws = 'stroke-width';
    const sw = Jig.P.strokeW1k * Jig.P.naturalWidth / 1000.0;
    var anim = null;

    // Check a tile for obstruction.  If yes, raise and animate
    function anim_raise_tile(el, arr_anim_parents) {
        Jig.get_pos_for_tile(pos, el);
        let cnt = gsp.count(pos);
        if (cnt > 1) {
            el.setAttribute('stroke', 'lawngreen');
            //el.setAttribute(sws, sw);
            // bubble to top for smaller snap groups
            svg.removeChild(el);
            svg.appendChild(el);
            anim = anim_create({attributeName:'stroke-width', values:''+sw+';'+(sw*10)+';'+sw});
            el.appendChild(anim);
            anim.beginElement();
            arr_anim_parents.push(el);
        }
    }

    // Add each group to spacing grid
    let arr_anim_el = []; // For each snap group, collect obscured member tiles
    for (let i of sgi) {
        for (let sid of sgrps[i].ids) {
            let el = svg.getElementById(sid);
            anim_raise_tile(el, arr_anim_el);
        }
        // If some snap group memners are not obstructed, remove animation
        if (arr_anim_el.length != sgrps[i].ids.length) {
            arr_anim_el.forEach(animate_cleanup);
        }
        arr_anim_el.length = 0;
    }
    // Add each loose tile to spacing grid
    let loose_tiles = [];
    for(let el=svg.firstChild; el!==null; el=el.nextSibling) {
        if (el.id >= "0" && el.id < "A" && id_to_isg(el.id) < 0) {
            loose_tiles.push(el); // collect list first, since must reorder to raise
        }
    }
    for (let el of loose_tiles) {
        anim_raise_tile(el, arr_anim_el);
    }
}
function btn_mvObTiles_disable(bool) {
    document.getElementById('mvObTiles').disabled = bool;
}
function animate_cleanup(el) {
    if (el.lastChild && el.lastChild.tagName == "animate") {
        el.removeChild(el.lastChild);
        el.setAttribute('stroke', 'black');
    }
}
function animate_stroke_tiles_cleanup() {
    for(let el=svg.firstChild; el!==null; el=el.nextSibling) {
        animate_cleanup(el);
    }
}

function set_boundaries(viewBox) {
    boundaryX1 = viewBox.minX;
    boundaryX2 = viewBox.minX + viewBox.w;
    boundaryY1 = viewBox.minY;
    boundaryY2 = viewBox.minY + viewBox.h;
}

function sound_snap_play() {
    snap_sound.play();
}
function sound_snap_stop() {
    snap_sound.pause();
    snap_sound.currentTime = 0; // rewinds to beginning
}

function sound_tada_play() {
    tada_sound.play();
}

function getMousePosition(evt) {
    var CTM = svg.getScreenCTM();
    if (evt.touches) { evt = evt.touches[0]; }
    return {
        x: (evt.clientX - CTM.e) / CTM.a,
        y: (evt.clientY - CTM.f) / CTM.d
    };
}

// If more button dropdown is visible, hide it
function menu_collapse() {
    settings_collapse();
    more_collapse();
}
function settings_collapse() {
    if (settings_panel.classList.contains('settings')) {
        settings_panel.classList.remove('settings');
    }
}
function more_collapse() {
    if (more_btn.classList.contains('dropdown-trigger')) {
        more_btn.classList.remove('dropdown-trigger');
    }
}
function startDrag(evt) {
    menu_collapse();
    if (evt.target.classList.contains('draggable')) {
        if (evt.target.classList.contains('dragparent')) {
            selectedElement = evt.target.parentNode;
        } else {
            selectedElement = evt.target;
        }
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
        let idn = +selectedElement.id;
        selectedElement_isg = idn < 0? -1 : idSgrp[idn];
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
        drg.snap_tol = idn < 0? -1 : $('input[name=snap]:checked').val();

        // get row & col of dragging tile
        Jig.id_to_rc(idn, drg);

        // move to end of SVG element list
        svg.removeChild(selectedElement);
        svg.appendChild(selectedElement);
    }
}

var lastDragTime = 0.1;
function drag(evt) {
    if (selectedElement) {
        evt.preventDefault();
        let t = performance.now();

        if (t - lastDragTime > 50) {
            //console.log('drag '+Math.round(t - lastDragTime));
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
                    // ends drag since snapping
                }
            }
            transform.setTranslate(dx, dy);
            let idn = +selectedElement.id;
            if (Jig.pss !== null && idn >= 0) {
                Jig.pss.trX[idn] = dx;
                Jig.pss.trY[idn] = dy;
            }

            // if selected is part of a snap group, move entire group
            if (selectedElement_isg >= 0) {
                snap_grp_drag(selectedElement_isg, idn, dx, dy);
            }
            if (id_snap_to >= 0) {
                // if snapping, handle group merge or creation
                let isg_new = snap_grp_merge(idn, id_snap_to);
                // Refresh snap group's neighbors list
                snap_grp_find_neighbors(isg_new);
                /* console.log('sn['+isg_new+'] has ids:'
                    +sgrps[isg_new].ids.length+' neighbors:'
                    +sgrps[isg_new].neighbors.length); */
                animate_cleanup(selectedElement);
                selectedElement = false;

                // all done with puzzle?
                if (sgrps[isg_new].neighbors.length == 0) {
                    Ws.sendPuzzleDone(localStorage.Jigsaw_img_url, Jig.P.pieces);
                    sound_tada_play();
                    Jig.pss_remove();
                    Jig.rm_preview_tile();
                    btn_mvObTiles_disable(true); // Disable "Raise hidden tiles" button
                } else {
                    sound_snap_play();
                }
            }
        }
    }
}

function endDrag(evt) {
    if (selectedElement) {
        animate_cleanup(selectedElement);
    }
    selectedElement = false;
    if (Jig.pss !== null) {
        Jig.pss_checkpoint(); // checkpoint current Puzzle scramble state to localStorage
    }
}

// Move snap group other than given ID to new coordinates
function snap_grp_drag(isg, id0, dx, dy) {
    for (let id of sgrps[isg].ids) {
        if (id != id0) {
            let transform = svg.getElementById(id).transform.baseVal.getItem(0);
            transform.setTranslate(dx, dy);
            if (Jig.pss !== null) {
                Jig.pss.trX[id] = dx;
                Jig.pss.trY[id] = dy;
            }
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
// Discover snap groups in restored state
function snap_grp_restore_neighbors(idn) {
    let isg = id_to_isg(idn); // -1 means no group (since index into sgrps array)
    let drg = {};
    Jig.id_to_rc(idn, drg);
    // Check all 4 neighbors.
    // Stop if snap outside of the group is possible
    for (let dd of [[-1,0], [0,-1], [0,1], [1,0]]) {
        let r = drg.r + dd[0];
        let c = drg.c + dd[1];
        if (r >= 0 && r < Jig.P.yn && c >= 0 && c < Jig.P.xn) {
            let rc = r*Jig.P.xn+c;
            if (isg < 0 || isg != id_to_isg(rc)) {
                let rx = Jig.pss.trX[idn] / Jig.pss.trX[rc];
                let ry = Jig.pss.trY[idn] / Jig.pss.trY[rc];
                if (rx > 0.99 && rx < 1.01 && ry > 0.99 && ry < 1.01) {
                    isg = snap_grp_merge(idn, rc);
                    snap_grp_restore_neighbors(rc); // recursive call to neighbors
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
        if (el.id == "xpath") {
            // for preview tile, move the parent g
            el = el.parentNode;
        }
        let transform = el.transform.baseVal.getItem(0);
        let offsetX = transform.matrix.e;
        let offsetY = transform.matrix.f;
        let bbox = el.getBBox();
        let bbminx = bbox.x;
        let bbmaxx = bbox.x + bbox.width;
        let bbminy = bbox.y;
        let bbmaxy = bbox.y + bbox.height;

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
    drag_init, change_boundaries, isPuzzleInProgress,
    menu_collapse, more_collapse, settings_collapse,
    sound_snap_play, snap_grp_clear_all, tiles_show_edges,
    tiles_show_hidden, animate_stroke_tiles_cleanup, btn_mvObTiles_disable
};

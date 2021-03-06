"use strict";
//const urlParams = new URLSearchParams(window.location.search);
import * as PSt from './pst.js';

let UiOptions = null; // UI action callbacks
let mdown = {
    elem:null, cx:0, cy:0, left:0, top:0, scoord:{x:0,y:0},
    tgt:null, gcoord:{x:0,y:0}, gleft:0, shifts:null
};
let grid = {nw:8, nh:2, wpx: 1, hpx: 1, left: 1, top: 1, toplgo: -1, leftlgp: -1};

function domUnplayed() { return document.getElementById('unplayed')}
function updateGrid() {
    let grid = {};
    // working area for the grid is #unplayed
    let unp = domUnplayed();
    let unprect = unp.getBoundingClientRect();
    let reflg = document.getElementById('RefLg'); // off-display tile-lg
    let lgrect = reflg.getBoundingClientRect();
    let reflgo = document.getElementById('ArrowR'); // off-display tile-lgo (vert oversize)
    let lgorect = reflgo.getBoundingClientRect();
    let reflgp = document.getElementById('DiscardTgt'); // off-display tile-lgp (h & v oversize)
    let lgprect = reflgp.getBoundingClientRect();

    let nw = Math.floor(unprect.width / lgrect.width);
    let nh = Math.max(2, Math.floor(unprect.height / lgrect.height));
    grid.wpx = unprect.width / nw;
    grid.hpx = unprect.height / nh;
    grid.left = (grid.wpx - lgrect.width) / 2;
    grid.top = (grid.hpx - lgrect.height) / 2;
    grid.toplgo = (lgrect.height - lgorect.height) / 2; // offset to grid.top
    grid.leftlgp = (lgrect.width - lgprect.width) / 2; // offset to grid.left
    // don't allow grid off-screen
    grid.leftmax = (nw - 0.5) * grid.wpx -2;
    grid.leftmin = grid.left +1;
    grid.topmax = (nh - 0.75) * grid.hpx -2;
    //console.log(grid);
    grid.nw = nw;
    grid.nh = nh;
    return grid;
}
// Translate from drag tile style left+top to grid tgt outline
function nearGrid(left, top) {
    return {x:Math.round(left / grid.wpx), y:Math.round(top / grid.hpx)}
}
function toGridXY(tgt, xy) {
    let tgtleft = xy.x * grid.wpx + grid.left;
    tgt.style.left = tgtleft + (xy.xoff || 0);
    tgt.style.top = xy.y * grid.hpx + grid.top + (xy.yoff || 0);
    return tgtleft;
}
function tileLeftTop(e) {
    let left = mdown.left + (e.clientX - mdown.cx);
    let top = mdown.top + (e.clientY - mdown.cy);
    if (left > grid.leftmax) left = grid.leftmax;
    if (left < grid.leftmin) left = grid.leftmin;
    if (top > grid.topmax) top = grid.topmax;
    return {left, top, xy:nearGrid(left, top)};
}

function startDrag(e) {
    mdown.elem = e.target.parentNode; // e.target is svg use.  Parent is svg
    mdown.cx = e.clientX;
    mdown.cy = e.clientY;
    let cstyle = getComputedStyle(mdown.elem);
    mdown.left = parseFloat(cstyle.left);
    mdown.top = parseFloat(cstyle.top);
    mdown.scoord = nearGrid(mdown.left, mdown.top); // starting grid coords
    mdown.gcoord.x = -9999; // last grid coords, forces update on drag
    mdown.shifts = null; // nothing to shift yet
    mdown.tgt = document.getElementById('OutTgt');
    mdown.elem.style['z-index'] = 9;
    //let rect = svg.getBoundingClientRect();
    //console.log(rect);
    //dx = rect.left - e.clientX;
    //dy = rect.top - e.clientY;
    //console.log("dx:",dx, "dy:",dy);
    //console.log(mdown);
    //console.log(svg.style);
    //updateGrid();
}

function drag(e) {
    if (mdown.elem) {
        let lt = tileLeftTop(e);
        mdown.elem.style.left = lt.left;
        mdown.elem.style.top = lt.top;

        if (mdown.tgt) {
            // Show grid target for drop
            if (lt.xy.x != mdown.gcoord.x || lt.xy.y != mdown.gcoord.y) {
                if (lt.xy.y < 0) {
                    mdown.gleft = 0;
                    unDragStyle(mdown.tgt);

                    // Which underlay to show outside of unplayed tile area?
                    unDragStyle(mdown.dun); // hide previous underlay
                    if (lt.xy.y == -1) {
                        mdown.dun = document.getElementById('DiagOY'); // warning underlay
                    } else {
                        mdown.dun = document.getElementById('DiscardTgt'); // discard underlay
                    }
                } else {
                    mdown.gleft = toGridXY(mdown.tgt, lt.xy);
                }
                mdown.gcoord.x = lt.xy.x; // update last grid coords
                mdown.gcoord.y = lt.xy.y;
                mdown.shifts = dragShifts(lt.xy);
                //console.log(mdown.shifts);

                if (lt.xy.y >= 0) {
                    unDragStyle(mdown.dun); // hide discard underlay
                }
            }
            showDragArrow('ArrowR', lt.xy, isDragMoveRight(mdown.gleft >= lt.left));
            showDragArrow('ArrowL', lt.xy, isDragMoveLeft(mdown.gleft >= lt.left));
            // Discard underlay?
            if (lt.xy.y < 0) {
                mdown.dun.style.left = lt.left + grid.leftlgp;
                mdown.dun.style.top = lt.top + grid.toplgo;
            }
        }
    }
}

// Is a right/left shift needed for unplayed tiles in mdown current row?
function isDragMoveRight(shRight) {
    return (mdown.shifts && mdown.shifts.shRok && (shRight || !mdown.shifts.shLok));
}
function isDragMoveLeft(shRight) {
    return (mdown.shifts && mdown.shifts.shLok && (!shRight || !mdown.shifts.shRok));
}
function showDragArrow(id, xy, doMove) {
    let arrow = document.getElementById(id);
    if (doMove) {
        xy.yoff = grid.toplgo;
        toGridXY(arrow, xy);
    } else {
        unDragStyle(arrow);
    }
}
function unDragStyle(elem) {
    if (elem && elem.style) {
        elem.style.left = null;
        elem.style.top = null;
    }
}

function endDrag(e) {
    if (mdown.elem) {
        let lt = tileLeftTop(e);
        if (lt.xy.y < -1 && 'dragDiscard' in UiOptions) {
            // Discard the tile
            let tile = svgToTileString(mdown.elem);
            UiOptions.dragDiscard(tile);
        }
        if (lt.xy.y < 0) {
            // In no-drag area, snap back to start location
            toGridXY(mdown.elem, mdown.scoord);
        } else {
            // Snap tile to grid target
            let gleft = toGridXY(mdown.elem, lt.xy);
            dragMoves(lt.xy, (gleft >= lt.left));
        }
        mdown.elem.style['z-index'] = null;

        for (const e of [mdown.tgt, mdown.dun]) {
            if (e) unDragStyle(e);
        }
        mdown.elem = null;
        mdown.tgt = null;
        mdown.dun = null;
        mdown.shifts = null;
        deselectAll(); // in case drag accidentally selected text
    }
}

function dragMoves(to, shRight) {
    console.log("Drag from (%d,%d) to (%d,%d), shift %s preferred",
        mdown.scoord.x, mdown.scoord.y, to.x, to.y, shRight ? 'right' : 'left');

    mdown.shifts = dragShifts(to);
    if (isDragMoveRight(shRight)) {
        console.log("right moves",svgArrToTileString(mdown.shifts.r));
        shiftX(mdown.shifts.r, 1);
    } else if (isDragMoveLeft(shRight)) {
        console.log(" left moves ", svgArrToTileString(mdown.shifts.l));
        shiftX(mdown.shifts.l, -1);
    } else if (mdown.shifts) { // target loc is occupied but no valid shifts
        // row is full, swap target location occupant to drag origin
        toGridXY(mdown.shifts.r[0], mdown.scoord);
    } else if (to.y < 0) {
        // TODO: Discarding this tile
        console.log("discarding", svgArrToTileString([mdown.elem]));
    }
    // Hide the drag arrows
    showDragArrow('ArrowR', null, false);
    showDragArrow('ArrowL', null, false);
    //showDragArrow('DiscardTgt', null, false);
}

// For tile drag, check if destination is occupied, and if so, which other
// tiles would need to be moved for left or right shifts
function dragShifts(to) {
    let allrows = discoverUnplayedInGrid();
    let ri = allrows[to.y]; // tiles on same row as destination (to)

    // Is the 'to' spot occupied?
    //console.log(to, ri);
    if (ri == null || ri[to.x] == null) { return null; } // currently empty

    // At least tgt location tile must move
    let shs = {l:[ri[to.x]], r:[ri[to.x]]};
    // Check right shift needed
    for (let x= to.x+1; x < ri.length && ri[x] != null; ++x) {
        shs.r.push(ri[x]);
    }
    shs.shRok = ((to.x + shs.r.length) < grid.nw); // true if enough room for shift
    // Check left shift needed
    for (let x= to.x-1; x >= 0 && ri[x] != null; --x) {
        shs.l.push(ri[x]);
    }
    shs.shLok = ((to.x - shs.l.length) >= 0); // true if enough room for shift
    return shs;
}

function shiftX(arr, xoffset) {
    for (let elem of arr) {
        let cstyle = getComputedStyle(elem);
        let left = parseFloat(cstyle.left);
        elem.style.left = left + grid.wpx * xoffset; // shift by xoffset grid widths
    }
}

// choose initial grid placement for new hand
function gridAutoPlacement() {
    let x=0, y=0;
    let coords = []; // each entry is {x,y}
    let u = PSt.unplayed;
    for (let i = 0; i < u.length; ++i) {
        if (i > 0 && !PSt.isSameSuitConsecutive(u, i-1)) {
            x += 1; // inter-suit gap
        }
        if (x >= grid.nw) {
            y += Math.floor(x/grid.nw); // wrap to next row
            x = x % grid.nw;
        }
        coords[i] = {x,y};
        x += 1;
    }
    console.log(grid, coords);
    return coords;
}

// Remove all DOM children that contain the given class
function rmChildrenOfClass(elem, cl) {
    let chnext = null;
    for(let child=elem.firstChild; child!==null; child=chnext) {
        chnext=child.nextSibling;
        if (child.classList && child.classList.contains(cl)) {
            elem.removeChild(child);
        }
    }
}

// Discover the grid coordinates of each unplayed tile
function discoverUnplayedInGrid() {
    let ri = [];
    for (let i = 0; i < grid.nh; ++i) {
        let arow = []; arow.length = grid.nw; // empty matches == null
        ri.push(arow); // sub-array for each row
    }
    let unp = domUnplayed();

    for(let child=unp.firstChild; child!==null; child=child.nextSibling) {
        if (child != mdown.elem && child.classList && child.classList.contains("tile-mv")) {
            let cstyle = getComputedStyle(child);
            let left = parseFloat(cstyle.left);
            let top = parseFloat(cstyle.top);
            let c = nearGrid(left, top);

            if (c.y >= grid.nh || c.y < 0 || c.x < 0 || c.x >= grid.nw) {
                console.log("Ignoring tile at grid %s", JSON.stringify(c));
            } else if (ri[c.y][c.x] == null) {
                ri[c.y][c.x] = child; // Mark tile spot in grid
            } else {
                console.error("Multiple tiles at grid %s", JSON.stringify(c));
            }
        }
    }
    return ri;
}

// left shift grid spots of tiles until right-most spot is open
function leftShiftGridRow(allrows, xy) {
    let tgtx = grid.nw-1;
    while (tgtx >= 0 && allrows[xy.y][tgtx] != null) {
        --tgtx;
    }
    if (allrows[xy.y][tgtx] == null) {
        while (tgtx < grid.nw-1) {
            // Move any tiles that need left shifting
            allrows[xy.y][tgtx] = allrows[xy.y][tgtx+1];
            toGridXY(allrows[xy.y][tgtx], {y:xy.y, x:tgtx});
            ++tgtx;
        }
        // Move requested tile to the end of the row
        allrows[xy.y][tgtx] = allrows[xy.y][xy.x];
        allrows[xy.y][xy.x] = null;
        toGridXY(allrows[xy.y][tgtx], {y:xy.y, x:tgtx});
    } else {
        console.error("leftShiftGridRow: no space");
    }
}

// When the display area resizes, re-position tiles as needed
function refreshGrid() {
    let allrows = discoverUnplayedInGrid();
    let oldgrid = grid; // remember old grid bounds
    grid = updateGrid();
    let emptySpots = []; // track the number of empty spots per row
    let overflow = []; // tiles that cannot be fit into their original row
    for (let xy={x:0, y:0}; xy.y < oldgrid.nh; ++xy.y) {
        emptySpots[xy.y] = 0;
        for (xy.x=0; xy.x < oldgrid.nw; ++xy.x) {
            if (allrows[xy.y][xy.x] == null) {
                if (xy.x < grid.nw) {
                    ++emptySpots[xy.y]; // available spot in new grid
                }
            } else {
                if (xy.x < grid.nw) {
                    toGridXY(allrows[xy.y][xy.x], xy); // spot is valid in new grid
                } else {
                    if (emptySpots[xy.y] > 0) {
                        leftShiftGridRow(allrows, xy);
                        --emptySpots[xy.y]; // mark spot used
                    } else {
                        overflow.push({y:xy.y, x:xy.x});
                    }
                }
            }
        }
    }

    // Move overflow tiles to end of other row
    for (const ov of overflow) {
        for (let y=0; y< grid.nh; ++y) {
            if (emptySpots[y] > 0) {
                // Move tile to this row, then do left shifts
                allrows[y][ov.x] = allrows[ov.y][ov.x];
                allrows[ov.y][ov.x] = null;
                leftShiftGridRow(allrows, {y, x:ov.x});
                --emptySpots[y]; // mark spot used
                break; // stop empty spot search for this overflow tile
            }
        }
        if (allrows[ov.y][ov.x] != null) {
            console.error("Failed to move overflow tile at (%d,%d)",ov.x,ov.y);
        }
    }
}

function refreshUnplayed(seat) {
    let coords = gridAutoPlacement(); // initial tile grid coords
    let u = PSt.unplayed;
    let unp = domUnplayed();
    rmChildrenOfClass(unp, 'tile-mv'); // remove any previously added tiles

    for (let i = 0; i < coords.length; i++) {
        // <svg class="tile-lg tile-mv"><use href="media/stiles.svg#CN"/></svg>
        let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("tile-lg", "tile-mv");
        let use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", "media/stiles.svg#" + u[i]);
        svg.appendChild(use);
        unp.appendChild(svg);
        toGridXY(svg, coords[i]);
        tileMvListeners(svg);
    }
}
function svgSetTileString(elem, tile, pos) {
    let uses = elem.getElementsByTagName('use');
    let i = pos || 0;
    if (uses.length > i) {
        uses[i].setAttribute("href", "media/stiles.svg#" + tile);
    } else {
        console.error("SVG/use not found in ", elem);
    }
}
function svgToTileString(svg) {
    return svg.firstElementChild.getAttribute("href").slice(-2);
}

function svgArrToTileString(arr) {
    let ss = [];
    arr.forEach(e => ss.push(svgToTileString(e)));
    return ss;
}

// Clear any text selection in the webpage
// https://stackoverflow.com/questions/3169786/clear-text-selection-with-javascript
function deselectAll() {
    if (window.getSelection) {
        if (window.getSelection().empty) {  // Chrome
          window.getSelection().empty();
        } else if (window.getSelection().removeAllRanges) {  // Firefox
          window.getSelection().removeAllRanges();
        }
      } else if (document.selection) {  // IE?
        document.selection.empty();
    }
}

function tileMvListeners(el) {
    el.addEventListener('mousedown', startDrag);
    el.addEventListener('mousemove', drag);
    el.addEventListener('mouseup', endDrag);
    //el.addEventListener('mouseleave', endDrag);
    el.addEventListener('touchstart', startDrag);
    el.addEventListener('touchmove', drag);
    el.addEventListener('touchend', endDrag);
    //el.addEventListener('touchleave', endDrag);
    el.addEventListener('touchcancel', endDrag);
}

function init(opts) {
    UiOptions = opts || {};
    // Register event handlers for all movable tiles
    var tile_mvs = document.getElementsByClassName("tile-mv");
    Array.from(tile_mvs).forEach(tileMvListeners);
    grid = updateGrid(); // initialize the unplayed tiles grid
}

export {
    init, refreshGrid, refreshUnplayed, deselectAll,
    svgToTileString, svgSetTileString,
}

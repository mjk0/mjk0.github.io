/////////////////
// SVG Drag and Drop support,
// from: http://www.petercollingridge.co.uk/tutorials/svg/interactive/dragging/
//
var svg;
var selectedElement, offset, transform,
    minX, maxX, minY, maxY;

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
    set_boundaries(viewBox);
}
function set_boundaries(viewBox) {
    boundaryX1 = viewBox.minX;
    boundaryX2 = viewBox.minX + viewBox.w;
    boundaryY1 = viewBox.minY;
    boundaryY2 = viewBox.minY + viewBox.h;
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
        //bbox = selectedElement.getBBox();
        minX = boundaryX1 - selectedElement.getAttribute('bbminx');
        maxX = boundaryX2 - selectedElement.getAttribute('bbmaxx');
        minY = boundaryY1 - selectedElement.getAttribute('bbminy');
        maxY = boundaryY2 - selectedElement.getAttribute('bbmaxy');
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
    drag_init, change_boundaries
};

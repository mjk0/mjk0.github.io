//////////
// Copied from: https://gist.github.com/Draradech/35d36347312ca6d0887aa7d55f366e30#file-jigsaw-html
//

var seed = 1;
function random() { var x = Math.sin(seed) * 10000; seed += 1; return x - Math.floor(x); }
function uniform(min, max) { var r = random(); return min + r * (max - min); }
function rbool() { return random() > 0.5; }

function $(id) { return document.getElementById(id); }

var a, b, c, d, e, t, j, flip, xi, yi, xn, yn, vertical, offset, width, height, radius;
var svg;
function first() { e = uniform(-j, j); next();}
function next()  { var flipold = flip; flip = rbool(); a = (flip == flipold ? -e: e); b = uniform(-j, j); c = uniform(-j, j); d = uniform(-j, j); e = uniform(-j, j);}
function sl()  { return vertical ? height / yn : width / xn; }
function sw()  { return vertical ? width / xn : height / yn;}
function ol()  { return offset + sl() * (vertical ? yi : xi); }
function ow()  { return offset + sw() * (vertical ? xi : yi); }
function l(v)  { var ret = ol() + sl() * v; return Math.round(ret * 100) / 100; }
function w(v)  { var ret = ow() + sw() * v * (flip ? -1.0 : 1.0); return Math.round(ret * 100) / 100; }
function p0l() { return l(0.0); }
function p0w() { return w(0.0); }
function p1l() { return l(0.2); }
function p1w() { return w(a); }
function p2l() { return l(0.5 + b + d); }
function p2w() { return w(-t + c); }
function p3l() { return l(0.5 - t + b); }
function p3w() { return w(t + c); }
function p4l() { return l(0.5 - 2.0 * t + b - d); }
function p4w() { return w(3.0 * t + c); }
function p5l() { return l(0.5 + 2.0 * t + b - d); }
function p5w() { return w(3.0 * t + c); }
function p6l() { return l(0.5 + t + b); }
function p6w() { return w(t + c); }
function p7l() { return l(0.5 + b + d); }
function p7w() { return w(-t + c); }
function p8l() { return l(0.8); }
function p8w() { return w(e); }
function p9l() { return l(1.0); }
function p9w() { return w(0.0); }

const P = {
    'seed':     1,
    'tabsize':  22, // % of tile?
    'jitter':   4,  // % of tile?
    'pieces':   400,    // target # of pieces
    'xn':       5,  // number of tiles in x direction.  Auto-calc from pieces & image dims
    'yn':       3,  // number of tiles in y direction
    'naturalWidth':    984,  // Will be read from image object, then set here
    'naturalHeight':   450,
    'areaRatio': 2.0, // target area ratio.  2 means half the area used by completed puzzle
    'viewBox':  {minX:0, minY:0, w:0, h:0}, // most recently calculated viewBox
    'radius':   2.0, // ignored.  Was corner radius
    'stroke':   "black",
    'strokeW1k': 0.3, // stroke-width scalled to a 1k width image
};
// Puzzle scramble state.  Set on scramble, updated on drag, cleared on completion
var pss = null; // {url:, numPieces:, areaRatio:, trX:[], trY:[]}

function options(opts) {
    Object.keys(opts).forEach((k) => {
        if (P.hasOwnProperty(k)) {
            P[k] = opts[k]; // accept new value
        } else {
            console.error('Unknown option: "'+k+'": '+opts[k]);
        }
    });
}

function gen_d()
{
    var edges = {}; // edges as d-cmd fragments.  keys: (t|r|b|l)#row'x'#col
    var str = "";
    
    seed = P.seed;
    t = P.tabsize / 200.0;
    j = P.jitter / 100.0;
    xn = P.xn;
    yn = P.yn;
    
    vertical = 0;
    for (yi = 0; yi <= yn; ++yi)
    {
        xi = 0;
        first();
        for (; xi < xn; ++xi)
        {
            // top edge
            str  = "M " + p0l() + "," + p0w() + " ";
            if (yi == 0 || yi == yn) {
                str += "L " + p9l() + " " + p9w() + " ";
            } else {
                str += "C " + p1l() + " " + p1w() + " " + p2l() + " " + p2w() + " " + p3l() + " " + p3w() + " ";
                str += "C " + p4l() + " " + p4w() + " " + p5l() + " " + p5w() + " " + p6l() + " " + p6w() + " ";
                str += "C " + p7l() + " " + p7w() + " " + p8l() + " " + p8w() + " " + p9l() + " " + p9w() + " ";
            }
            edges['t'+yi+'x'+xi] = str;

            // bottom edge of previous row (in reverse order)
            if (yi == 0 || yi == yn) {
                str  = "L " + p0l() + "," + p0w() + " ";
            } else {
                str  = "C " + p8l() + " " + p8w() + " " + p7l() + " " + p7w() + " " + p6l() + " " + p6w() + " ";
                str += "C " + p5l() + " " + p5w() + " " + p4l() + " " + p4w() + " " + p3l() + " " + p3w() + " ";
                str += "C " + p2l() + " " + p2w() + " " + p1l() + " " + p1w() + " " + p0l() + "," + p0w() + " ";
            }
            edges['b'+(yi-1)+'x'+xi] = str;
            next();
        }
    }
    
    vertical = 1;
    for (xi = 0; xi <= xn; ++xi)
    {
        yi = 0;
        first();
        for (; yi < yn; ++yi)
        {
            // right edge
            //str  = "M " + p0w() + "," + p0l() + " ";
            if (xi == 0 || xi == xn) {
                str  = "L " + p9w() + " " + p9l() + " ";
            } else {
                str  = "C " + p1w() + " " + p1l() + " " + p2w() + " " + p2l() + " " + p3w() + " " + p3l() + " ";
                str += "C " + p4w() + " " + p4l() + " " + p5w() + " " + p5l() + " " + p6w() + " " + p6l() + " ";
                str += "C " + p7w() + " " + p7l() + " " + p8w() + " " + p8l() + " " + p9w() + " " + p9l() + " ";
            }
            edges['r'+yi+'x'+(xi-1)] = str;

            // left edge
            if (xi == 0 || xi == xn) {
                str  = "L " + p0w() + "," + p0l() + " ";
            } else {
                str  = "C " + p8w() + " " + p8l() + " " + p7w() + " " + p7l() + " " + p6w() + " " + p6l() + " ";
                str += "C " + p5w() + " " + p5l() + " " + p4w() + " " + p4l() + " " + p3w() + " " + p3l() + " ";
                str += "C " + p2w() + " " + p2l() + " " + p1w() + " " + p1l() + " " + p0w() + "," + p0l() + " ";
            }
            edges['l'+yi+'x'+xi] = str;
            next();
        }
    }
    
    str  = "M " + (offset + radius) + " " + (offset) + " ";
    str += "L " + (offset + width - radius) + " " + (offset) + " ";
    str += "A " + (radius) + " " + (radius) + " 0 0 1 " + (offset + width) + " " + (offset + radius) + " ";
    str += "L " + (offset + width) + " " + (offset + height - radius) + " ";
    str += "A " + (radius) + " " + (radius) + " 0 0 1 " + (offset + width - radius) + " " + (offset + height) + " ";
    str += "L " + (offset + radius) + " " + (offset + height) + " ";
    str += "A " + (radius) + " " + (radius) + " 0 0 1 " + (offset) + " " + (offset + height - radius) + " ";
    str += "L " + (offset) + " " + (offset + radius) + " ";
    str += "A " + (radius) + " " + (radius) + " 0 0 1 " + (offset + radius) + " " + (offset) + " ";
    return edges;
}

function get_svg_image(callback) {
    var svg_image = document.getElementsByTagName('image')[0];
    var src = svg_image.getAttribute('xlink:href');   // image src URL
    var img = new Image();
    img.onload = function() {
        callback(img);
    }
    img.src = src;
    return img;
}
function get_svg_image_set_viewBox(callback)
{
    get_svg_image((puzzle_img) => {
        P.naturalWidth = puzzle_img.naturalWidth;
        P.naturalHeight = puzzle_img.naturalHeight;

        svg = $("puzzlecontainer");
        let svg_w = svg.clientWidth;
        let svg_h = svg.clientHeight;

        // Make sure SVG pattern '#img1' matches image dimensions
        let pattern = $('img1');
        pattern.setAttribute('width', puzzle_img.naturalWidth);
        pattern.setAttribute('height', puzzle_img.naturalHeight);
        
        let pattern_image = pattern.getElementsByTagName('image')[0];
        pattern_image.setAttribute('width', puzzle_img.naturalWidth);
        pattern_image.setAttribute('height', puzzle_img.naturalHeight);

        // Calculate maximum scaling needed to make image fit in SVG
        let scale_max_x = svg_w / puzzle_img.naturalWidth;
        let scale_max_y = svg_h / puzzle_img.naturalHeight;

        // Scale down anough to make puzzle image use no more than half the SVG area (area_ratio >= 2)
        let area_ratio = Math.max(scale_max_x, scale_max_y) / Math.min(scale_max_x, scale_max_y);
        let scale_xy = Math.max(Math.sqrt(P.areaRatio / area_ratio), 1.05);
        P.viewBox = {
            minX: 0, minY: 0,
            w: puzzle_img.naturalWidth * scale_xy,
            h: puzzle_img.naturalHeight * scale_xy
        };
        if (scale_max_x > scale_max_y) {
            // puzzle aspect ratio is taller than the SVG area
            P.viewBox.w *= scale_max_x / scale_max_y;
        } else {
            // puzzle aspect ratio is wider than the SVG area
            P.viewBox.h *= scale_max_y / scale_max_x;
        }

        // set viewBox to match SVG aspect ratio.  Tiles will use image natural dimensions
        P.viewBox.minX = (puzzle_img.naturalWidth - P.viewBox.w)/2.0; // center image
        P.viewBox.minY = (puzzle_img.naturalHeight - P.viewBox.h)/2.0; // center image
        let viewBox_str = ''+P.viewBox.minX + ' '
            + P.viewBox.minY + ' '
            + P.viewBox.w +' '+ P.viewBox.h;
        svg.setAttribute('viewBox', viewBox_str);
        console.log('svg: '+svg_w+' x '+svg_h+', viewBox: '+viewBox_str);

        callback(puzzle_img, P.viewBox);
    });
}

function update(opts, attributes, callback)
{
    options(opts); // mainly for number of pieces
    get_svg_image_set_viewBox((puzzle_img, viewBox) => {
        // Use image natural dimensions for tiles
        width = puzzle_img.naturalWidth;
        height = puzzle_img.naturalHeight;
        offset = 0.0;

        // Target P.pieces = P.xn * P.yn, and xn/yn = w/h
        let yn = Math.sqrt(P.pieces * height / width);
        P.yn = Math.round(yn);
        P.xn = Math.round(yn * width / height);

        //$("puzzlepath").setAttribute("d", gen_d());
        create_tiles(gen_d(), attributes);
        callback(viewBox);
    });
}
function svg_resize_handler(event, callback) {
    get_svg_image_set_viewBox((puzzle_img, viewBox) => {
        //console.log('SVG resized');
        callback(viewBox);
    });
}

function svg_path(attr) {
    // Create path element
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    return svg_add_attributes(path, attr);
}
function svg_add_attributes(el, attr) {
    // stroke="black" stroke-width="0.1" fill="url(#img1)"
    for (let k in attr) {
        el.setAttribute(k, attr[k]);
    }
    return el;
}

function create_tiles(edges, attributes) {
    // Set stroke-width to equivalent of given value on 1k width image
    let sw = P.strokeW1k * width / 1000.0;
    // Check if resuming an incomplete puzzle
    let resumeState = localStorage.getItem("Jigsaw_scramble");
    if (resumeState !== null) {
        let rs = JSON.parse(resumeState);
        // Does the saved state match the main parameters?
        if (rs.url == localStorage.Jigsaw_img_url && rs.numPieces == P.pieces) {
            pss = rs; // use this as the puzzle initial state
        }
    }

    // Create SVG path elements for each jigsaw tile
    for (let r=0; r < P.yn; ++r) {
        for (let c=0; c < P.xn; ++c) {
            let idn = r*P.xn+c;
            // Get 4 edges for d property
            var d = edges['t'+r+'x'+c] // top
                    + edges['r'+r+'x'+c] // right
                    + edges['b'+r+'x'+c] // bottom
                    + edges['l'+r+'x'+c]; // left
            // Create path element
            var path = svg_path({d, id: idn,
                stroke:P.stroke, 'stroke-width':sw,
                fill:"url(#img1)"
            });
            svg_add_attributes(path, attributes);

            // add translation transform to offset path coordinates by (0,0)
            var translate = svg.createSVGTransform();
            if (pss !== null && pss.trX.length > idn) {
                translate.setTranslate(pss.trX[idn], pss.trY[idn]);
            } else {
                translate.setTranslate(0, 0);
            }
            path.transform.baseVal.insertItemBefore(translate, 0); // first transform
            // add to SVG
            var pathElement = svg.appendChild(path);

            // Save bounding box width & height as attributes
            /*let bbox = pathElement.getBBox();
            pathElement.setAttribute('bbminx', bbox.x);
            pathElement.setAttribute('bbmaxx', bbox.x + bbox.width);
            pathElement.setAttribute('bbminy', bbox.y);
            pathElement.setAttribute('bbmaxy', bbox.y + bbox.height);*/
        }
    }
    //let r1 = $('r1'); svg.removeChild(r1); svg.appendChild(r1); // move to end of list
    console.log("puzzle tiles: "+P.xn+" x "+P.yn +", image: "+width+" x "+height);
}

/*
    <g id="-1" class="draggable" transform="translate(0,0)" >
        <rect id="prerect" x="-1000" y="0" width="2000" height="1500"
            stroke="yellow" stroke-width="20" fill="url(#img1)"
            transform="scale(0.5)" />
        <circle cx="120" cy="120" r="110" stroke="black" stroke-width="20" fill="white" />
    </g>
*/
var pt_g;
function create_preview_tile(scale) {
    // Remove existing preview, if it exists
    rm_preview_tile();
    // Set stroke-width to equivalent of given value on 1k width image
    let sw = 80 * P.strokeW1k * width / 1000.0; // thick for preview image tile
    let csw = sw/8;

    // Create g and contents
    pt_g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg_add_attributes(pt_g, { id:-1, class: 'draggable'});
    var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    svg_add_attributes(rect, {
        x:0, y:0, class: 'draggable dragparent',
        width:(P.naturalWidth), height:(P.naturalHeight),
        stroke:"yellow", 'stroke-width':sw, fill:"url(#img1)"
    });
    var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    let cx = (P.naturalWidth*scale-sw);
    let cy = sw+csw/2;
    svg_add_attributes(circle, {
        cx:cx, cy:cy, r:sw,
        'stroke-width':(csw), fill:"inherit", class:"cbtn cbtnred"
    });
    var xpath = svg_path({
        d:"M"+(cx-sw/2)+" "+(cy-sw/2)+" l"+sw+" "+sw+" M"+(cx-sw/2)+" "+(cy+sw/2)+" l"+sw+" -"+sw,
        id:'xpath', stroke:"inherit", 'stroke-width':csw, class:"cbtn"
    });
    /*
    let anim = document.createElementNS("http://www.w3.org/2000/svg", "animate");
    svg_add_attributes(anim, { 'xlink:href':'#-1', restart:'always',
        attributeName:'opacity', from:'0', to:'1', dur:'2s', begin:'0s', fill:'freeze'
    }); */

    // Scale preview by requested amount
    let tr_scale = svg.createSVGTransform();
    tr_scale.setScale(scale, scale);
    rect.transform.baseVal.insertItemBefore(tr_scale, 0);

    let tr_translate = svg.createSVGTransform();
    tr_translate.setTranslate(P.viewBox.minX+P.viewBox.w-(P.naturalWidth*scale), P.viewBox.minY);
    pt_g.transform.baseVal.insertItemBefore(tr_translate, 0);

    // Add elements to SVG
    pt_g.appendChild(rect);
    pt_g.appendChild(circle);
    pt_g.appendChild(xpath);
    // Add zoom circle buttons
    for (const [zi, zv] of ['S', 'M', 'L', 'H'].entries()) {
        let cZoom = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        svg_add_attributes(cZoom, {
            cx:(cx-sw*2*(1.5+zi)), cy:cy, r:sw, id:zv,
            'stroke-width':(csw), fill:"inherit", class:"cbtn"
        });
        pt_g.appendChild(cZoom);
        cZoom.addEventListener('click', cZoom_onclick);
        let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        svg_add_attributes(text, {
            x:(cx-sw*2*(1.5+zi)), y:cy,
            'dominant-baseline':"middle", 'text-anchor': "middle", class:"cbtn"
        });
        text.textContent = zv;
        pt_g.appendChild(text);
    }
    svg.appendChild(pt_g);

    pt_g.addEventListener('mouseenter', preview_tile_buttons_visible);
    pt_g.addEventListener('mouseleave', preview_tile_buttons_hidden);
    circle.addEventListener('click', rm_preview_tile);
}
function rm_preview_tile(event) {
    resize_preview_tile(0);
}
// resize preview tile if it's present
function resize_preview_tile(scale) {
    // remove existing tile, if present
    let g = svg.getElementById('-1');
    if (g) {
        svg.removeChild(g);
        if (scale > 0) {
            create_preview_tile(scale);
        }
    }
}
const cZoom_letter_to_scale = {H:0.75, L:0.5, M:0.33, S:0.25};
function cZoom_onclick(event) {
    let scale = cZoom_letter_to_scale[event.target.id] || 0.4;
    resize_preview_tile(scale);
}
function preview_tile_buttons_visible(event) {
    pt_g.classList.add('showCbtn');
}
function preview_tile_buttons_hidden(event) {
    pt_g.classList.remove('showCbtn');
}
// for better spacing of random tiles, define spacing grid
const gsp = {
    gscale: 1.2,
    gtilew:0, gtileh:0,
    xn:0, yn:0,
    cnt:[], limit:1,
    init: function(opts) {
        this.xn = Math.ceil((P.viewBox.w-P.naturalWidth/P.xn)*P.xn/(P.naturalWidth*this.gscale));
        this.yn = Math.ceil((P.viewBox.h-P.naturalHeight/P.yn)*P.yn/(P.naturalHeight*this.gscale));
        this.gtilew = (P.viewBox.w-P.naturalWidth/P.xn)/this.xn;
        this.gtileh = (P.viewBox.h-P.naturalHeight/P.yn)/this.yn;
        this.limit = 1;
        //console.log('grid is '+this.xn+' x '+this.yn+' ('+this.gtilew+', '+this.gtileh+')');

        // Size count array for each grid location
        this.cnt.length = this.xn*this.yn;
        this.cnt.fill(0);

        let nogo = 99;
        // Block off edge outline?
        if (opts && opts.avoidEdgeOutline) {
            let rc00 = this.rc({x:0,y:0});
            let rc0m = this.rc({x:P.naturalWidth, y:0});
            let rc0md = rc0m - rc00;
            let rcm0 = this.rc({x:0, y:(P.naturalHeight-P.naturalHeight/P.yn)});
            let rcm0d = rcm0 - rc00;
            for (let rc=rc00; rc <= rc0m; ++rc) {
                //[-this.xn, 0, this.xn, rcm0d-this.xn, rcm0d, rcm0d+this.xn].forEach( v => {
                [0, rcm0d].forEach( v => {
                        if (rc+v >= 0 && rc+v < this.cnt.length) {
                        this.cnt[rc+v] = nogo;
                    }
                });
            }
            for (let rc=rc00+this.xn; rc < rcm0; rc += this.xn) {
                //[-1, 0, 1, rc0md-1, rc0md, rc0md+1].forEach( v => {
                [0, rc0md].forEach( v => {
                    if (rc+v >= 0 && rc+v < this.cnt.length) {
                        this.cnt[rc+v] = nogo;
                    }
                });
            }
        }
        //console.log(this.cnt);
    },
    rc: function(pos) {
        let c = Math.floor((pos.x-P.viewBox.minX) / this.gtilew);
        let r = Math.floor((pos.y-P.viewBox.minY) / this.gtileh);
        return (r*this.xn+c);
    },
    hasReachedLimit: function(pos) {
        let rc = this.rc(pos);
        return (this.cnt[rc] >= this.limit);
    },
    count: function(pos, idn) {
        let rc = this.rc(pos);
        ++this.cnt[rc];
        //console.log('co: id='+idn+' cnt['+rc+']='+this.cnt[rc]+', ('+Math.round(pos.x)+', '+Math.round(pos.y)+')');
    },
    constrainCoords: function(pos) {
        let cfloat = (pos.x-P.viewBox.minX) / this.gtilew;
        let rfloat = (pos.y-P.viewBox.minY) / this.gtileh;
        let c = Math.floor(cfloat);
        let r = Math.floor(rfloat);
        let tcnt = this.cnt[r*this.xn+c]; // how many tiles placed here so far?

        // Constrain position into tile-cnt-dependent quadrants
        if (c < this.xn-1 && tcnt < 4) {
            let crem = cfloat%1;
            while (crem >= ((tcnt == 0 || tcnt == 3)? 0.25 : 0.75)) {
                crem -= 0.25;
                pos.x -= this.gtilew * 0.25;
            }
            while (crem < 0.5 && (tcnt == 1 || tcnt == 2)) {
                crem += 0.25;
                pos.x += this.gtilew * 0.25;
            }
        }
        if (r < this.yn-1 && tcnt < 4) {
            let rrem = rfloat%1;
            while (rrem >= ((tcnt == 0 || tcnt == 2)? 0.25 : 0.75)) {
                rrem -= 0.25;
                pos.y -= this.gtileh * 0.25;
            }
            while (rrem < 0.5 && (tcnt == 1 || tcnt == 3)) {
                rrem += 0.25;
                pos.y += this.gtileh * 0.25;
            }
        }
        //console.log('cc: cnt['+(r*this.xn+c)+']='+this.cnt[r*this.xn+c]+', ('+Math.round(pos.x)+', '+Math.round(pos.y)+')');
    }
};

// randomize location of all PATH elements of the SVG
function scramble_tiles(opts) {
    let paths = svg.getElementsByTagName('path');
    let avoidCenter = opts.hasOwnProperty('scrAvoidCenter') ? opts.scrAvoidCenter : 0;
    let avoidPreview = opts.hasOwnProperty('scrAvoidPreview') ? opts.scrAvoidPreview : 1;
    let scale = opts.hasOwnProperty('previewSize') ? opts.previewSize : 0.5;
    let previewTile = svg.getElementById('-1');

    // initialize to default location of preview tile
    let previewBbox = {
        minX: (P.viewBox.minX+P.viewBox.w-(P.naturalWidth*scale)),
        minY: P.viewBox.minY,
        maxX: (P.viewBox.minX+P.viewBox.w),
        maxY: (P.viewBox.minY+P.naturalHeight*scale)
    };
    let centerBbox = { minX: 0, minY:0, maxX: P.naturalWidth, maxY: P.naturalHeight };

    // Get preview tile bbox if needed
    if (avoidPreview && previewTile) {
        let previewTr = previewTile.transform.baseVal.getItem(0);
        let bbox = previewTile.getBBox();
        previewBbox.minX = bbox.x + previewTr.matrix.e;
        previewBbox.maxX = previewBbox.minX + bbox.width;
        previewBbox.minY = bbox.y + previewTr.matrix.f;
        previewBbox.maxY = previewBbox.minY + bbox.height;
    }
    //console.log(JSON.stringify(opts)+' aP:'+avoidPreview+' '+JSON.stringify(previewBbox));

    // Set puzzle scramble state in case user wants to resume after exiting
    pss = {
        numPieces: P.pieces,
        areaRatio: P.areaRatio,
        url: localStorage.Jigsaw_img_url,
        trX: [], // translate X
        trY: [], // translate Y
    };

    // viewBox defines valid coordinate space
    let minX = P.viewBox.minX;
    let minY = P.viewBox.minY;
    let boundaryX2 = P.viewBox.minX + P.viewBox.w;
    let boundaryY2 = P.viewBox.minY + P.viewBox.h;

    // for better spacing of random tiles, define spacing grid
    gsp.init({avoidEdgeOutline: avoidCenter});
    let rand = {x:0, y:0};

    for (let el of paths) {
        if (el.id >= "0" && el.id < "A") {
            let bbox = el.getBBox();
            let bbminx = bbox.x;
            let bbminy = bbox.y;
            let el_w = bbox.width;
            let el_h = bbox.height;
            let transform = el.transform.baseVal.getItem(0);
            let idn = +el.id;

            // Generate random offsets
            let tryCnt = 0;
            for (let offsetVerified=false; !offsetVerified; ) {
                rand.x = uniform(minX, boundaryX2-el_w);
                rand.y = uniform(minY, boundaryY2-el_h);

                // Check if that grid location has reached its tile limit
                if (gsp.hasReachedLimit(rand)) {
                    ++tryCnt;
                    if (tryCnt < 100) {
                        continue;
                    } else {
                        ++gsp.limit; // increase limit
                        console.log('gsp limit:'+gsp.limit);
                    }
                }
                gsp.constrainCoords(rand); // modifies coordinates, but only within tile area

                // pattern image defines exclusion space
                // (0,0) -> (P.naturalWidth, P.naturalHeight)
                if ((true || isOutsideOf(rand.x, rand.y, el_w, el_h, centerBbox))
                 && (!avoidPreview || isOutsideOf(rand.x, rand.y, el_w, el_h, previewBbox))) {
                    let offsetX = rand.x - bbminx;
                    let offsetY = rand.y - bbminy;
                    transform.setTranslate(offsetX, offsetY);
                    pss.trX[idn] = offsetX;
                    pss.trY[idn] = offsetY;
                    offsetVerified = true;
                    gsp.count(rand, idn); // keep track of tiles added in this grid location
                }
            }
        }
    }
    // Save initial scramble state
    pss_checkpoint();
    //console.log(gsp.cnt);
}

function isOutsideOf(x, y, el_w, el_h, bbox) {
    return (y+el_h < bbox.minY || y > bbox.maxY || x+el_w < bbox.minX || x > bbox.maxX);
}

// Save the current state pf pss (Puzzle scramble state) to localStorage
function pss_checkpoint() {
    if (pss !== null) {
        localStorage['Jigsaw_scramble'] = JSON.stringify(pss);
    }
}
// Puzzle complete, remove pss
function pss_remove() {
    pss = null;
    localStorage.removeItem('Jigsaw_scramble');
}

function id_to_rc(id, container) {
    // get row & col of dragging tile
    let rc = +id;
    container.r = Math.floor(rc/P.xn);
    container.c = rc%P.xn;
    if (container.r >= P.yn) {
        console.error('Bad id('+id+') => r('+r+')/c('+c+')');
    }
}

// Check for any snaps outside current snap group
function snap_grp_to_neighbor(drg, dx, dy, neighbors) {
    for (let rc of neighbors) {
        let ndelta = neighbor_rc_delta(drg, dx, dy, rc);
        if (ndelta) { // null if no snap
            return ndelta;
        }
    }
    return null;
}

// Check if a neighboring tile is within the snap tolerance
function snap_to_neighbor(drg, dx, dy) {
    // Check all 4 neighbors.  Stop if snap possible
    for (let dd of [[-1,0], [0,-1], [0,1], [1,0]]) {
        let ndelta = neighbor_delta(drg, dx, dy, dd);
        if (ndelta) { // null if no snap
            return ndelta;
        }
    }
    return null;
}

// Compare target row,col tile with given transform, and
// calc distance as fraction of given bounding box
function neighbor_delta(drg, dx, dy, dd) {
    let r = drg.r + dd[0];
    let c = drg.c + dd[1];
    if (r >= 0 && r < P.yn && c >= 0 && c < P.xn) {
        return neighbor_rc_delta(drg, dx, dy, r*P.xn+c);
    }
    return null;
}
function neighbor_rc_delta(drg, dx, dy, rc) {
    let nEl = svg.getElementById(rc);
    let nTr = nEl.transform.baseVal.getItem(0);
    // Percentage of original tile deltas
    let pde = Math.abs(nTr.matrix.e - dx)/drg.bb.width;
    let pdf = Math.abs(nTr.matrix.f - dy)/drg.bb.height;
    // need non-zero, but less than tolerance
    if (pde < drg.snap_tol && pdf < drg.snap_tol) {
        //console.log('to#'+r+','+c+'('+Math.round(pde*100)+'%,'+Math.round(pdf*100)+'%) ');
        return {rc, dx: nTr.matrix.e, dy: nTr.matrix.f};
    }
    return null;
}

export {
    P, update, options, svg_resize_handler, scramble_tiles, id_to_rc,
    pss, pss_checkpoint, pss_remove,
    snap_to_neighbor, snap_grp_to_neighbor,
    create_preview_tile, resize_preview_tile, rm_preview_tile
};

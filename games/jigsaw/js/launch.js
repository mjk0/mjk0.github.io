"use strict";
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
var img_custom, img_resume, p_resume;
function test_image() {
    img_test.src = img_url.value;
}
function img_test_passed(event) {
    img_test_result.innerHTML = "[Result: &#9989; Good]";
}
function img_test_failed(event) {
    img_test_result.innerHTML = "[Result: &#10060; Bad]";
}

const sample_images = [
    // media/backyard-180px.jpg
    "media/backyard.jpg",

    // https://encrypted-tbn0.gstatic.com/images?q=tbn%3AANd9GcQQ1suy6-l8tJt5pl0OrYA9W6H_ewrwnau6fA0alyMHsTNgIiX2&usqp=CAU
    "https://gradivahotels.com/wp-content/uploads/2019/08/Tropical-Vacation.jpg",

    // https://lh6.googleusercontent.com/proxy/NT5fRkJDFMB4paWCbHagCrFFzE7MQMViavDkEjcGMK8v_EuuQL-Fd3ELft76_Z13WYDVdi9L6q6iMxeoCBajWpjeiKmvhlvDxXyJwsdhLLxg7cs22QwkPqrSoVxB_N6Un16hPtyxKjZqQ7NKo2yhtgyvcn1cPNejwSShGrwSY9KYSl3rXRXl6ISCKqfGIenjqK0wK8GM02Cp8tpambzoypj4X3ZZ_xIeNd-Xy3zl8PvjjfyvH8YyPQvmXUhTAZwsw8N5qw=s240-w240-h135-fcrop64=1,00001999fffff3c7-k-no-nd-mv
    "https://lh6.googleusercontent.com/proxy/NT5fRkJDFMB4paWCbHagCrFFzE7MQMViavDkEjcGMK8v_EuuQL-Fd3ELft76_Z13WYDVdi9L6q6iMxeoCBajWpjeiKmvhlvDxXyJwsdhLLxg7cs22QwkPqrSoVxB_N6Un16hPtyxKjZqQ7NKo2yhtgyvcn1cPNejwSShGrwSY9KYSl3rXRXl6ISCKqfGIenjqK0wK8GM02Cp8tpambzoypj4X3ZZ_xIeNd-Xy3zl8PvjjfyvH8YyPQvmXUhTAZwsw8N5qw=s1920-w1920-h1080-fcrop64=1,00001999fffff3c7-k-no-nd-mv",

    // https://lh3.googleusercontent.com/jBiW5JY7CH4JNT8fP-fGQuzK3G1QghWndEVxuh1fxgeJnO6cJ3suVOKde1WsgwoHzs1uqow=s240
    "https://lh6.googleusercontent.com/proxy/FtgmdiIeWl-LD-il97L0_fVAqntwZZXPoOFW4LSyEdULdene1G6ZxT4_BruPzO5-y4kBFwADONpmRaAUO_-NNPjFL605jgjFvwmk1s8ywiC7QQzG8zhySz0hcVSdi-NNmgV_6yEPXm3zcD8C9CGVAcf-U_HRAq9BuqXl-CNAf00VIceVZlnoFHDTNFfp_W2K2wmVmbm4RkygpA_3Mql_BbXgcxXr8p0dGmDy1eg-dyGKQ3kNRMFg=s1920-w1920-h1080-p-k-no-nd-mv",

    // https://lh3.googleusercontent.com/byQ-t5R54ayuA7SLBbB6G2Kd8YS2fNk4VJ3XrtdM8lvT0twi1IUiOV4g7WuST4Xoh1leIA=s240
    "https://i.etsystatic.com/5451974/r/il/a9eb3b/2279803383/il_fullxfull.2279803383_gt2h.jpg",

    // https://images.pexels.com/photos/371589/pexels-photo-371589.jpeg?auto=compress&cs=tinysrgb&dpr=2&w=240
    "https://images.pexels.com/photos/371589/pexels-photo-371589.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260",

    // https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Aerial_view_of_Love_valley_Cappadocia_from_hot_air_balloon_1510232_3_4_Compressor.jpg/180px-Aerial_view_of_Love_valley_Cappadocia_from_hot_air_balloon_1510232_3_4_Compressor.jpg
    //"https://upload.wikimedia.org/wikipedia/commons/7/71/Aerial_view_of_Love_valley_Cappadocia_from_hot_air_balloon_1510232_3_4_Compressor.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Aerial_view_of_Love_valley_Cappadocia_from_hot_air_balloon_1510232_3_4_Compressor.jpg/1280px-Aerial_view_of_Love_valley_Cappadocia_from_hot_air_balloon_1510232_3_4_Compressor.jpg",

    // https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Amur_tiger_yawning_widescreen.jpg/180px-Amur_tiger_yawning_widescreen.jpg
    //"https://upload.wikimedia.org/wikipedia/commons/2/28/Amur_tiger_yawning_widescreen.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Amur_tiger_yawning_widescreen.jpg/1280px-Amur_tiger_yawning_widescreen.jpg",
    
    //https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/BaylorLineTunnel.jpg/180px-BaylorLineTunnel.jpg
    "https://upload.wikimedia.org/wikipedia/commons/0/04/BaylorLineTunnel.jpg",
    
    //https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Biltmore_Estate-27527-1.jpg/180px-Biltmore_Estate-27527-1.jpg
    //"https://upload.wikimedia.org/wikipedia/commons/0/02/Biltmore_Estate-27527-1.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Biltmore_Estate-27527-1.jpg/1280px-Biltmore_Estate-27527-1.jpg",
    
    // https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Biltmore_Estate-27527-2.jpg/180px-Biltmore_Estate-27527-2.jpg
    //"https://upload.wikimedia.org/wikipedia/commons/8/8c/Biltmore_Estate-27527-2.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Biltmore_Estate-27527-2.jpg/1280px-Biltmore_Estate-27527-2.jpg",
    
    // https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Bisbee_Arizona-27527-1.jpg/180px-Bisbee_Arizona-27527-1.jpg
    //"https://upload.wikimedia.org/wikipedia/commons/8/85/Bisbee_Arizona-27527-1.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Bisbee_Arizona-27527-1.jpg/1280px-Bisbee_Arizona-27527-1.jpg",
    
    // https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Black_Spiny-tailed_Iguana-27527.jpg/180px-Black_Spiny-tailed_Iguana-27527.jpg
    //"https://upload.wikimedia.org/wikipedia/commons/0/0e/Black_Spiny-tailed_Iguana-27527.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Black_Spiny-tailed_Iguana-27527.jpg/1280px-Black_Spiny-tailed_Iguana-27527.jpg",
    
    // https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Cathedral_Rock_Water-27527-1.jpg/180px-Cathedral_Rock_Water-27527-1.jpg
    //"https://upload.wikimedia.org/wikipedia/commons/4/4f/Cathedral_Rock_Water-27527-1.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Cathedral_Rock_Water-27527-1.jpg/1280px-Cathedral_Rock_Water-27527-1.jpg",
    
    // https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Feeding_Recharging.png/180px-Feeding_Recharging.png
    //"https://upload.wikimedia.org/wikipedia/commons/d/d1/Feeding_Recharging.png",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Feeding_Recharging.png/1280px-Feeding_Recharging.png",
    
    // https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Grayson_Highlands_Ponies-27527-2.jpg/180px-Grayson_Highlands_Ponies-27527-2.jpg
    //"https://upload.wikimedia.org/wikipedia/commons/1/19/Grayson_Highlands_Ponies-27527-2.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Grayson_Highlands_Ponies-27527-2.jpg/1280px-Grayson_Highlands_Ponies-27527-2.jpg",
    
    // https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Iller_water_stair.jpg/180px-Iller_water_stair.jpg
    //"https://upload.wikimedia.org/wikipedia/commons/8/83/Iller_water_stair.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Iller_water_stair.jpg/1280px-Iller_water_stair.jpg",
    
    // https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Katrinetorp_Mansion_close.jpg/180px-Katrinetorp_Mansion_close.jpg
    //"https://upload.wikimedia.org/wikipedia/commons/1/1c/Katrinetorp_Mansion_close.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Katrinetorp_Mansion_close.jpg/1280px-Katrinetorp_Mansion_close.jpg",

    // https://lh3.googleusercontent.com/e37_djKWCAiCbRhxO5EUbAQ66F6w3izcv9F_C5jxd6nNLpok9q9CBKfa3fD1Hjwl4PK__bo=s240
    "https://cdn.pixabay.com/photo/2017/08/27/15/09/moraine-lake-2686353_1280.jpg",

    // https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Horsetram.jpg/320px-Horsetram.jpg
    "https://upload.wikimedia.org/wikipedia/commons/7/78/Horsetram.jpg",

    // https://lh3.googleusercontent.com/5dDWnlh43Yr221fl0HasmrAAnuhPy-AimQJ3zoh8SxC3Ju-p8jMokoKYDNT5KmUk_qAU=s240
    "https://images-na.ssl-images-amazon.com/images/I/81qPc6NtSEL._SL1200_.jpg",

    // https://lh3.googleusercontent.com/GIWr181nD5PRv2Am9ZifEdZNeHZ8kOqJSzvqV-fm6u6AV9ToW_QiBOAm6mwYHCjCxSzJfg=s240
    "https://images.fineartamerica.com/images-medium-large-5/serenity-eileen-fong.jpg",

    // https://lh3.googleusercontent.com/KYWacyVfk8q-CJOeKK6tTO_6arXn18C0ZXoz5Z9JD14pZYKC0gRdOAPrkdrSAFgEaLRD8rI=s240
    "https://st2.depositphotos.com/2031485/8390/i/950/depositphotos_83906902-stock-photo-chinese-garden-with-bridge-and.jpg",

    // https://lh3.googleusercontent.com/Il2Ous7x3EqQ97RgmyRp_MFgA8IYVeaItc9ExPRZ8hG0drRrsb_eSzW2y4cGcSfDhqmPag=s200
    "https://mk0spaceflightnoa02a.kinstacdn.com/wp-content/uploads/2020/06/49956109906_44a0b5541c_k.jpg",

    // https://lh3.googleusercontent.com/HTFJvlKptaqXQ3RPSBA7EJ6qKo9ymCTdOb5KFKqsHq5QfBFNwusbfpAu904GtXTgxGI5lV4=s240
    "https://images-na.ssl-images-amazon.com/images/I/91LYxLjLyIL._AC_SL1500_.jpg",

    // media/Maine_state_line-240x180.jpg
    "media/Maine_state_line.jpg",

    // media/Ottawa-200px-squish.jpg
    "media/Ottawa-768px.jpg",
];

var input_custom_changed = false;
function input_custom_keypress(event) {
    //console.log(event);
    if (event.key == "Enter") {
        img_custom.src = img_url.value;
        input_custom_changed = false;
    } else {
        input_custom_changed = true;
    }
}
function input_custom_onfocusout(event) {
    if (input_custom_changed) {
        img_custom.src = img_url.value;
    }
}
function paste_from_clipboard() {
    // navigator.clipboard.readText().then(text => img_url.value = text);
    img_url.focus();
    //img_url.select();
    img_url.value = '';
    document.execCommand("paste");
    input_custom_changed = true;
}

var carousel_i = 0;
var carousel_needs_init = true;

function tab_samples() {
    // Is the carousel initialized yet?
    if (carousel_needs_init) {
        let last_carousel_i = carousel_i;
        $('.carousel').carousel({
            onCycleTo: function(data) {
                //let img = data.getElementsByTagName('img')[0];
                carousel_i = $(data).index();
                img_url.value = sample_images[carousel_i];
                if (img_custom.src != custom_no_img) {
                    img_custom.src = custom_no_img;
                }
            }
        });
        if (last_carousel_i > 0) {
            $('.carousel').carousel('set', last_carousel_i);
        }
        carousel_needs_init = true;
    }
}

// Resume tab selected
var resumeState = null;
function tab_resume() {
    // If anything to resume, will be in resumeState
    if (resumeState !== null) {
        let rs = JSON.parse(resumeState);
        img_url.value = rs.url;
        img_resume.src = rs.url;
        let last_numPieces = rs.numPieces;
        set_radio_group_value('pieces', last_numPieces);
        let last_areaRatio = rs.areaRatio;
        set_radio_group_value('areaRatio', last_areaRatio);

        // Show resume puzzle options
        p_resume.innerHTML = 'Puzzle options: '+last_numPieces+' pieces, '
            +Math.round(100/last_areaRatio)+'% zoom';
    }
}

function set_radio_group_value(group, val) {
    $('input[name="'+group+'"][value="'+val+'"]').prop('checked', true);
}

// Function that executes jQuery code after page load is complete
$(document).ready(function(){
    //let a_start = document.getElementById("a_start");
    //a_start.addEventListener("click", pre_puzzle);

    // Save img_url input field element ref
    img_url = document.getElementById("img_url");
    // Save img tag for test
    img_test = document.getElementById("img_test");
    img_test.addEventListener("load", img_test_passed);
    img_test.addEventListener("error", img_test_failed);
    img_test_result = document.getElementById("img_test_result");
    // Custom & resume img preview
    img_custom = document.getElementById("img-custom");
    img_resume = document.getElementById("img-resume");
    p_resume = document.getElementById("p-resume");

    // Image URL passed as URL parameter?
    const img_url_param = urlParams.get('url');
    // If anything to resume, will be at hash with this key
    resumeState = localStorage.getItem("Jigsaw_scramble");

    // Restore previous values if present in localStorage
    if (img_url_param) {
        img_url.value = img_url_param;
        set_radio_group_value('imgsel', 'custom');
        img_custom.src = img_url.value;
    } else if (localStorage.Jigsaw_img_url) {
        img_url.value = localStorage.Jigsaw_img_url;
        carousel_i = sample_images.indexOf(localStorage.Jigsaw_img_url);
        if (resumeState !== null) {
            // Start with resume tab
            set_radio_group_value('imgsel', 'resume');
            tab_resume();
        } else if (carousel_i < 0) {
            // Image URL wasn't from the samples, so go back to custom
            set_radio_group_value('imgsel', 'custom');
            img_custom.src = img_url.value;
        }
    }

    let tabVal = get_radio_group_value('imgsel');
    if (tabVal == "samples") {
        // Init image thumbnail carousel
        tab_samples();
    }

    // Restore option selections
    if (localStorage.Jigsaw_numPieces) {
        set_radio_group_value('pieces', localStorage.Jigsaw_numPieces);
    }
    if (localStorage.Jigsaw_areaRatio) {
        set_radio_group_value('areaRatio', localStorage.Jigsaw_areaRatio);
    }

});

export {
    pre_puzzle, test_image, paste_from_clipboard,
    tab_samples, tab_resume, input_custom_keypress, input_custom_onfocusout
};

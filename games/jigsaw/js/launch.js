"use strict";
const urlParams = new URLSearchParams(window.location.search);

function pre_puzzle() {
    // Get number of pieces selection for puzzle
    let numPieces = $('input[name=pieces]:checked').val() || 25;
    localStorage.Jigsaw_numPieces = numPieces;
    let areaRatio = $('input[name=areaRatio]:checked').val() || 2.5;
    localStorage.Jigsaw_areaRatio = areaRatio;
    localStorage.Jigsaw_img_url = img_url.value;
    //alert('in pre_puzzle()');
    return true;
}

var img_url, img_test, img_test_result;
function test_image() {
    img_test.src = img_url.value;
}
function img_test_passed(event) {
    img_test_result.innerHTML = "[Result: &#9989; Good]";
}
function img_test_failed(event) {
    img_test_result.innerHTML = "[Result: &#10060; Bad]";
}
function paste_from_clipboard() {
    // navigator.clipboard.readText().then(text => img_url.value = text);
    img_url.focus();
    //img_url.select();
    img_url.value = '';
    document.execCommand("paste");
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

    // https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Horsetram.jpg/320px-Horsetram.jpg
    "https://upload.wikimedia.org/wikipedia/commons/7/78/Horsetram.jpg",

    // https://lh3.googleusercontent.com/5dDWnlh43Yr221fl0HasmrAAnuhPy-AimQJ3zoh8SxC3Ju-p8jMokoKYDNT5KmUk_qAU=s240
    "https://images-na.ssl-images-amazon.com/images/I/81qPc6NtSEL._SL1200_.jpg",

    // https://lh3.googleusercontent.com/GIWr181nD5PRv2Am9ZifEdZNeHZ8kOqJSzvqV-fm6u6AV9ToW_QiBOAm6mwYHCjCxSzJfg=s240
    "https://images.fineartamerica.com/images-medium-large-5/serenity-eileen-fong.jpg",

    // https://lh3.googleusercontent.com/HTFJvlKptaqXQ3RPSBA7EJ6qKo9ymCTdOb5KFKqsHq5QfBFNwusbfpAu904GtXTgxGI5lV4=s240
    //"https://images-na.ssl-images-amazon.com/images/I/91LYxLjLyIL._AC_SL1500_.jpg",

    // media/Maine_state_line-240x180.jpg
    "media/Maine_state_line.jpg",

    // media/Ottawa-200px-squish.jpg
    "media/Ottawa-768px.jpg",
];

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

    // Image URL passed as URL parameter?
    const img_url_param = urlParams.get('url');

    // Restore previous values if present in localStorage
    let carousel_i = 0;
    if (img_url_param) {
        img_url.value = img_url_param;
    } else if (localStorage.Jigsaw_img_url) {
        img_url.value = localStorage.Jigsaw_img_url;
        carousel_i = sample_images.indexOf(localStorage.Jigsaw_img_url);
    }
    if (localStorage.Jigsaw_numPieces) {
        $('input[name=pieces][value='+localStorage.Jigsaw_numPieces+']').prop('checked', true);
    }

    // Init image thumbnail carousel
    $('.carousel').carousel({
        onCycleTo: function(data) {
            //let img = data.getElementsByTagName('img')[0];
            img_url.value = sample_images[$(data).index()];
        }
    });
    if (carousel_i > 0) {
        $('.carousel').carousel('set', carousel_i);
    }
    if (img_url_param) {
        img_url.value = img_url_param;
    } else if (localStorage.Jigsaw_img_url) {
        img_url.value = localStorage.Jigsaw_img_url;
    }
});

export {pre_puzzle, test_image, paste_from_clipboard};

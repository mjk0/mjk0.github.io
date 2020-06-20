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

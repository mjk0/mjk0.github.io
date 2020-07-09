"use strict";

const url_lists = {
'favorites':[
    /* {title:"", url:""}, */
    {title:'Fall colors, lake',url:"https://wallpaperaccess.com/full/247868.jpg"},
    {title:'Home 1',url:"https://cdn.shopify.com/s/files/1/1259/9857/products/75a2c0be-7ed1-4e88-a4a2-ea05e75ebfcc.jpg?v=1579734546"},
    {title:'Lake 2',url:"https://images.pexels.com/photos/371589/pexels-photo-371589.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260"},

    {title:'Winter village 1',url:"https://images.fineartamerica.com/images-medium-large-5/winter-village-usa-steve-crisp.jpg"},
    {title:'Winter village 2',url:"https://images.fineartamerica.com/images-medium-large-5/winter-village-stream-steve-crisp.jpg"},
    {title:'Canyon sun',url:"https://images.unsplash.com/photo-1526749837599-b4eba9fd855e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1650&q=80"},

    {title:'Picnic',url:"https://i.pinimg.com/originals/a3/f6/8c/a3f68c9cfef65dba0d79417aba614e5a.jpg"},
    {title:'Rainy night walk',url:"https://ae01.alicdn.com/kf/HTB1cjIiMpXXXXceXVXXq6xXFXXXw/Rainy-Night-Walk-The-wooden-puzzle-1000-pieces-paper-jigsaw-puzzle-white-card-adult-children-s.jpg"},
    {title:'Copenhagen 2',url:"https://bucketlistjourney.net/wp-content/uploads/2009/11/91g92vfAp3L._SL1500_.jpg"},
 
    {title:'Heidelberg',url:"https://images.unsplash.com/photo-1566808636151-d95263b71d3f?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=668&q=80"},
    {title:'Haleakalā NP',url:"https://images.unsplash.com/photo-1572298707819-5a59309fc04e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=800&q=80"},
    {title:'Landscape flowers',url:"https://i.pinimg.com/originals/8f/c8/1a/8fc81a4efa96a8c56d0825bd52b05d7c.jpg"},

    {title:'Norwegian Fjord',url:"https://www.fjords.com/wp-content/uploads/photo-gallery/slideshow/wallpaper84.jpg?bwg=1577103120"},
    {title:'Backyard',url:"media/backyard.jpg"},
    {title:'Maine state line',url:"media/Maine_state_line.jpg"},

    {title:'Green lake',url:"https://lh6.googleusercontent.com/proxy/NT5fRkJDFMB4paWCbHagCrFFzE7MQMViavDkEjcGMK8v_EuuQL-Fd3ELft76_Z13WYDVdi9L6q6iMxeoCBajWpjeiKmvhlvDxXyJwsdhLLxg7cs22QwkPqrSoVxB_N6Un16hPtyxKjZqQ7NKo2yhtgyvcn1cPNejwSShGrwSY9KYSl3rXRXl6ISCKqfGIenjqK0wK8GM02Cp8tpambzoypj4X3ZZ_xIeNd-Xy3zl8PvjjfyvH8YyPQvmXUhTAZwsw8N5qw=s1920-w1920-h1080-fcrop64=1,00001999fffff3c7-k-no-nd-mv"},
    {title:'Water wheel',url:"https://lh6.googleusercontent.com/proxy/FtgmdiIeWl-LD-il97L0_fVAqntwZZXPoOFW4LSyEdULdene1G6ZxT4_BruPzO5-y4kBFwADONpmRaAUO_-NNPjFL605jgjFvwmk1s8ywiC7QQzG8zhySz0hcVSdi-NNmgV_6yEPXm3zcD8C9CGVAcf-U_HRAq9BuqXl-CNAf00VIceVZlnoFHDTNFfp_W2K2wmVmbm4RkygpA_3Mql_BbXgcxXr8p0dGmDy1eg-dyGKQ3kNRMFg=s1920-w1920-h1080-p-k-no-nd-mv"},
    {title:'The Last Supper',url:"https://images.fineartamerica.com/images/artworkimages/mediumlarge/2/22-the-last-supper-leonardo-da-vinci.jpg"},

    {title:'Blue hydrangea',url:"https://i.etsystatic.com/6996104/r/il/a9e75a/1894452140/il_570xN.1894452140_nwll.jpg"},
    {title:'Tropical vacation 1',url:"https://gradivahotels.com/wp-content/uploads/2019/08/Tropical-Vacation.jpg"},
    {title:'Peach Tree',url:"https://images-na.ssl-images-amazon.com/images/I/91LYxLjLyIL._AC_SL1500_.jpg"},

    {title:'Copenhagen row house',url:"https://elviragallery.com/wp-content/uploads/2019/11/Copenhagen2.jpg"},
    {title:'Painting, Paris',url:"https://i.pinimg.com/originals/fd/67/8e/fd678ed3b23f4260e7fad075e3179950.jpg"},
    {title:'Serenity garden',url:"https://images.fineartamerica.com/images-medium-large-5/serenity-eileen-fong.jpg"},

    {title:'Chinese garden',url:"https://st2.depositphotos.com/2031485/8390/i/950/depositphotos_83906902-stock-photo-chinese-garden-with-bridge-and.jpg"},
    {title:'Moraine lake',url:"https://cdn.pixabay.com/photo/2017/08/27/15/09/moraine-lake-2686353_1280.jpg"},
    {title:'Mason flowers',url:"https://images-na.ssl-images-amazon.com/images/I/81qPc6NtSEL._SL1200_.jpg"},

    {title:'Love Valley, Cappadocia',url:"https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Aerial_view_of_Love_valley_Cappadocia_from_hot_air_balloon_1510232_3_4_Compressor.jpg/1280px-Aerial_view_of_Love_valley_Cappadocia_from_hot_air_balloon_1510232_3_4_Compressor.jpg"},
    {title:'World map',url:"https://i.etsystatic.com/5451974/r/il/a9eb3b/2279803383/il_fullxfull.2279803383_gt2h.jpg"},
    {title:'Katrinetorp mansion',url:"https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Katrinetorp_Mansion_close.jpg/1280px-Katrinetorp_Mansion_close.jpg"},

    {title:'Bisbee, Arizona',url:"https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Bisbee_Arizona-27527-1.jpg/1280px-Bisbee_Arizona-27527-1.jpg"},
    {title:'Cathedral Rock',url:"https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Cathedral_Rock_Water-27527-1.jpg/1280px-Cathedral_Rock_Water-27527-1.jpg"},
    {title:'Biltmore estate 2',url:"https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Biltmore_Estate-27527-2.jpg/1280px-Biltmore_Estate-27527-2.jpg"},

    {title:'Biltmore estate 1',url:"https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Biltmore_Estate-27527-1.jpg/1280px-Biltmore_Estate-27527-1.jpg"},
    {title:'Victoria parliament',url:"https://i0.wp.com/fishingbooker.com/blog/media/victoria-bc-e1562251210497.jpg?fit=1440%2C960&ssl=1"},
    {title:"St John's",url:"https://www.nlhhn.org/wp-content/uploads/2020/02/stjohns.jpg"},

    {title:'Falcon 9 launch',url:"https://mk0spaceflightnoa02a.kinstacdn.com/wp-content/uploads/2020/06/49956109906_44a0b5541c_k.jpg"},
    {title:'Ottawa locks',url:"media/Ottawa-768px.jpg"},
    {title:'Lake beach',url:"https://images.unsplash.com/photo-1561467059-f815ae1ef5eb?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1700&q=80"},
    
    {title:'Tulips 1',url:"https://images.unsplash.com/photo-1488928741225-2aaf732c96cc?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1650&q=80"},

    /* {title:"", url:""}, */
],
};

function getList(name) { return url_lists[name]; }
function setList(name, newval) { url_lists[name] = newval; }
function exists(name) { return url_lists.hasOwnProperty(name); }
function remove(name) { return delete url_lists[name]; }

//module.exports = { getList, setList, exists, remove };
export { getList, setList, exists, remove };

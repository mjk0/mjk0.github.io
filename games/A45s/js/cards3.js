// Deal 5 cards from a random deck
/* global */
"use strict";

var Game = {
    server: "ws://pizzamonster.org:8081", // "ws://192.168.1.3:8081",
    ws: null,
    username: null,
    users: [],
    games: [],
    ourGame: 0, // 1-based
    ourSeat: -1,
    dealer: 255, // last player to bid
    fore: 255, // first player to bid
    declarer: 255,  // contract winner after bidding complete
    hand: [],
    discards: [],
    discarded: false,
    cardsPlayed: [],
    cardsPlayedPast: [], // save cards from recently played tricks
    cardsPlayedTricks: [], // helper to show stacks of cards for display

    // Allow Cross-domain AJAX for debugging
    init: function() {
        try {
            this.ws = new WebSocket(this.server);
            this.ws.onopen = this.wsOnOpen;
            this.ws.onclose = this.wsOnClose;
            this.ws.onerror = this.wsOnError;
            this.ws.onmessage = this.wsOnMsg;
        } catch (e) {
            console.error(e);
        }
    },

    wsOnOpen: function(ev) {
        console.log("Ws open: "+ev.target.url); // {"isTrusted":true}
        UI.updateLoginDisplay(1);
    },

    wsOnClose: function(ev) {
        console.log("Ws close: "+ev.target.url);
        UI.updateLoginDisplay(0);
    },

    wsOnError: function(ev) {
        console.log("Ws error: "+ev);
    },

    wsOnMsg: function(ev) {
        console.log("Ws msg: "+ev.data);
        var j;
        try {
            j = JSON.parse(ev.data);
            if ('action' in j && j.action in WsActionHandlers) {
                WsActionHandlers[j.action](j);
            }
        } catch(e) {
            console.log('Error: '+e);
        }
    },

    wsSendMsg: function(data) {
        this.ws.send(JSON.stringify(data));
    },

    // Ask server to create a freshly shuffled deck of cards
    shuffleDeck: function() {
        this.wsSendMsg({'action': 'shuffleDeck'});
    },
    shuffleInit() {
        this.hand = ['cback','cback','cback','cback','cback'];
        this.discarded = false;
        this.discards.length = 0;
        this.cardsPlayed.length = 0;
        this.cardsPlayedPast.length = 0;
        this.cardsPlayedTricks.length = 0;
    },

    // Get 5 cards for deck as {'cards': [...]}
    dealCards: function(n) {
        this.wsSendMsg({'action': 'dealTopCards', 'numCards': n});
    },
    // Add kitty cards to the play hand
    addKittyCards(a=null) {
        if (this.hand.length > 5) { this.hand.length = 5; }
        const b = a? a: ['cbcatsil','cbcatsil','cbcatsil','cbcatsil'];
        Array.prototype.push.apply(this.hand, b); // add all of b to end of hand
    },

    discardAtPos: function(n) {
        return moveBetweenArrays(n, this.hand, this.discards);
    },
    // Reclaim a previously discarded card, moving from discards[n] to player's hand
    reclaimAtPos: function(n) {
        return moveBetweenArrays(n, this.discards, this.hand);
    }
};

// remove from array by value
function removeA(arr, v) {
    var ax;
    while ((ax = arr.indexOf(v)) !== -1) {
        arr.splice(ax, 1);
    }
    return arr;
}
// move array element a[n] to end of b array
function moveBetweenArrays(n, a, b) {
    if (n >= 0 && n<a.length) {
        b.push(a[n]);
        a.splice(n,1);
        return true;
    }
    return false;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// responses to WebSocket messages
const wsRcv = {
    authenticate: function(data) {
        $('#login').modal('open');
    },
    userJoined: function(data) {
        Game.users.push(data.uname); // One user joined
        console.log(data.uname+' joined the game');
        if (Game.username == data.uname) {
            UI.updateLoginDisplay(2);  // server says we're logged in!
        }
        UI.updateUsersDisplay();
    },
    userExited: function(data) {
        removeA(Game.users, data.uname); // One user exited
        console.log(data.uname+' exited the game');
        UI.updateUsersDisplay();
    },
    allGames: function(data) {
        Game.games = data.games; // Complete user list
        UI.updateGamesDisplay();
    },
    allUsers: function(data) {
        Game.users = data.users; // Complete user list
        UI.updateUsersDisplay();
    },
    seatDiff: function(data) {
        for (var gn in data.diffs) {
            Game.games[gn-1] = data.diffs[gn];
            if (gn == Game.ourGame)
                UI.updateSeatNamesInDisplay();
        }
        UI.updateGamesDisplay();
    },
    ourGame: function(data) {
        Game.ourGame = data._id; // UI will update on seatDiff, coming next
        Game.ourSeat = data.seat;
        UI.seatAssigned();
    },
    deckShuffled: function(data) {
        // Deck was just shuffled, show backs of cards only
        Game.shuffleInit();
        if ('dealer' in data)
            Game.dealer = data.dealer;
        if ('fore' in data) // the one who bids & plays first
            Game.fore = data.fore;
        if ('declarer' in data) // contract winner (255 until bidding is complete)
            Game.declarer = data.declarer;

        UI.deckShuffled(data);
    },

    kitty: function(data) {
        Game.addKittyCards(data.cards);
        UI.updateCardsDisplay();
    },
    rcvCards: function(data) {
        Game.hand = data.cards;
        UI.rcvCards();
    }
};

const UI = {
    login: function() {
        const username = $('#mjk-username').val();
        if (username) {
            Game.username = username;
            localStorage.setItem('mjk-username', username);
        }
        Game.wsSendMsg({'action': 'authenticate', 'username': username});
        // Jump to Lobby for game selection
        $('.sidenav').sidenav('open');
    },
    sitAt: function(gnum, seat) {
        // Check if in-progress
        const started = Game.games[gnum-1].started;
        Game.wsSendMsg({'action': (started? 'joinAt':'sitAt'), 'game': gnum, seat});
    },
    sendMsgToGame: function() {
        var msg = $('#msg').val();
        Game.wsSendMsg({'action': 'beNice', 'message': msg});
    },
    bidCnt: 0,
    enterBidInDisplay: function(bid) {
        $('.bid-table td').eq(this.bidCnt++).text(bid);
    },
    enterBid: function(bid) { // from UI
        this.enterBidInDisplay(bid);
        Game.wsSendMsg({'action': 'bid', 'bid': bid});
        this.showOurBidArea(false);
    },
    bids: function(ba) { // message from server
        //console.log('bids: fromSeat='+ba.fromSeat+', '+ba.bids.length+' bids');
        if (ba.fromSeat != Game.ourSeat) { 
            for (var b of ba.bids) {
                this.enterBidInDisplay(b);
            }
        }
    },
    clearBidTable: function(fore=0) {
        $('.bid-table td').empty();
        this.bidCnt = fore;
        this.enterBidInDisplay('?');
        this.bidCnt = fore;
        //console.log('clearBidTable()')
    },
    // enable our bid selection
    showOurBidArea(v=true) {
        if (v) {
            $('.bid-self').removeClass('hide-me');
        } else {
            $('.bid-self').addClass('hide-me');
        }
    },
    // received contract msg from server
    endOfBidding(contract) {
        Game.declarer = contract.declarer;
        const declarerSeat = (Game.declarer&3);
        Game.fore = contract.fore || ((declarerSeat+1)&3);
        const cBid = Math.floor(Game.declarer/16)*5 + 15;
        $('#contractWho').text(Game.games[Game.ourGame-1].seats[declarerSeat]);
        $('#contractBid').text(cBid);
        this.showPlayArea(3); // show discards
        //this.showKitty(false);
        // Are we the declarer?  If so, add kitty cards to our hand
        if (declarerSeat == Game.ourSeat) {
            Game.addKittyCards(); // null array will add placeholder kitty cards
            this.updateCardsDisplay();
        }
        this.clickCardEnabled = true; // for discards
    },
    showKitty(v=true) {
        if (v) {
            $('#khand').removeClass('hide-me');
        } else {
            $('#khand').addClass('hide-me');
        }
    },
    seatToDir: ['E', 'S', 'W', 'N'],
    setDealerInfo(data) {
        $('#curDealer').text(this.seatToDir[data.dealer]+'/ '+data.dealerName);
    },
    namebars: [],
    updateSeatNamesInDisplay() {
        // Update player names
        const seats = Game.games[Game.ourGame-1].seats;
        const dirs = $('.seatdir');
        const names = $('.seatname');
        const bars = $('.namebar');
        for (var i=2; i<6; ++i) {
            var si = (Game.ourSeat+i-1)&3;
            this.namebars[si] = bars.eq(i);
            dirs.eq(i).text(this.seatToDir[si]);
            names.eq(i).text(seats[si] || 'Robot');
        }
    },
    seatAssigned() {
        // with seat assignment, can init play display by fore number
        this.fpPos = ['n','l','o','r'];
        for (var i=0; i<Game.ourSeat; ++i) {
            this.fpPos.unshift( this.fpPos.pop() ); // rotate right
        }
    },
    otherPlayerCfan: [],
    updateOtherPlayerNumCards() {
        while (this.otherPlayerCfan.length) {
            var uses = $('#'+this.fpPos[this.otherPlayerCfan.shift()]+'hand').find("use");
            this.updateCards(uses, ['cbfan'+(4-Game.cardsPlayedPast.length)]);
        }
    },
    // get element that shows current trick play order
    qForePlay() {
        return $("#play-"+this.fpPos[Game.fore&3]);
    },
    prepForePlayOrder() {
        const q = this.qForePlay();
        this.updateCards(q.find("use"), Game.cardsPlayed);
        $('#play-l,#play-o,#play-r,#play-n').addClass('hide-me');
        q.removeClass('hide-me');
    },
    cardsPlay1(c, fromSeat) {
        Game.cardsPlayed.push(c);
        if (fromSeat != Game.ourSeat) { // reduce card fan size of other player
            this.otherPlayerCfan.push(fromSeat);
        }
        if (!this.sleeping) {
            this.updateOtherPlayerNumCards();
            const q = this.qForePlay();
            this.updateCards(q.find("use"), Game.cardsPlayed, false);
        }
    },
    cardsPlayed(data) {
        var fromSeat = data.fromSeat; // use for transition effects
        for (var c of data.plays) {
            this.cardsPlay1(c, fromSeat++);
        }
    },
    highlightActivePlayer(si) {
        for (var i=0; i<this.namebars.length; ++i) {
            this.namebars[i].removeClass(i == si? 'nb-inactive':'nb-active');
            this.namebars[i].addClass(i == si? 'nb-active':'nb-inactive');
        }
    },
    playACard(data) {
        this.highlightActivePlayer(data.fromSeat);
        this.clickCardEnabled = (data.fromSeat == Game.ourSeat); // for play of a single card
    },
    playInProgress(data) {
        this.biddingEnded();
        Game.fore = data.fore;
        this.showPlayArea(2); // show card play area
        this.prepForePlayOrder();
    },
    rcvPastTricks(data) {
        for (var pp of data.plays) {
            Game.cardsPlayedPast.push(pp);
            Game.cardsPlayedTricks.push('cshoriz');
        }
        $('#ttricks').removeClass('hide-me'); // make sure past tricks display is visible
        this.updateCards($("#ttricks").find("use"), Game.cardsPlayedTricks, false);
        // Update other player 'card fans'
        for (var i=1; i<4; ++i) {
            this.otherPlayerCfan.push((Game.ourSeat+i)&3);
        }
        this.updateOtherPlayerNumCards();
    },
    sleeping: false,
    trickEnd(data) {
        if (Game.hand.length) {
            // Since more tricks, prepare for next one
            // Rotate trick order until first card is from near seat
            while (Game.fore != Game.ourSeat) {
                Game.cardsPlayed.push(Game.cardsPlayed.shift());
                Game.fore = (Game.fore+1)&3;
            }
            Game.cardsPlayedPast.push(Game.cardsPlayed);
            Game.cardsPlayedTricks.push('cshoriz');
            $('#ttricks').removeClass('hide-me'); // make sure past tricks display is visible
            this.updateCards($("#ttricks").find("use"), Game.cardsPlayedTricks, false);
            Game.cardsPlayed = [];
            Game.fore = data.fore;
            this.sleeping = true;
            sleep(2000).then(() => {
                this.sleeping = false;
                this.updateOtherPlayerNumCards();
                this.prepForePlayOrder();
            });
        }
    },
    showTrick(n) {
        this.updateCards($('#play-trick-svg').find("use"), Game.cardsPlayedPast[n]);
        $('#showATrick').modal('open');
    },
    playEnd(data) {
        // Hand play is complete.  Show results
        $('.playEnd').removeClass('hide-me');
    },
    shuffleNextDealer() {
        $('.playEnd').addClass('hide-me');
        this.updateCards($('#lhand,#ohand,#rhand').find("use"), ['cbfan5','cbfan5','cbfan5']);
        $("input[name=trumpSuit]:checked").prop('checked', false); // uncheck selected suit
        this.trumpSuit({'suit': 'cbcatsil'}); // contract suit unknown
        Game.wsSendMsg({'action': 'shuffleNextDealer'});
    },
    // Game just announced the trump suit
    trumpSuit(data) {
        this.updateCards($('#contractSuit svg').find('use'), [data.suit]);
    },

    // show 0:nothing, 1:bid, 2:play 3:discard
    fpPos: ['l','o','r','n'],
    playView: 0, // starts as pre-bidding (blank) view
    showPlayArea: function(v, option=null) {
        this.playView = v;
        switch (v) {
        case 0:
            $('#discards').addClass('hide-me');
            $('#ttricks').addClass('hide-me');
            $('#play-div').addClass('hide-me');
            $('.bid-table,.bid-self').addClass('hide-me');
            if (!option) { // null option shows kitty
                this.showKitty(true);
            }
            break;
        case 1: // bidding
            $('#discards').addClass('hide-me');
            $('#ttricks').addClass('hide-me');
            $('#play-div').addClass('hide-me');
            //this.clearBidTable();
            $('.bid-table').removeClass('hide-me');
            this.showOurBidArea(!option);
            this.showKitty(true);
            break;
        case 2: // card play
            $('.bid-table,.bid-self').addClass('hide-me');
            $('#discards').addClass('hide-me');
            $('#play-l,#play-o,#play-r,#play-n').addClass('hide-me');
            $('#play-div').removeClass('hide-me');
            var fpp = this.fpPos[Game.fore&3];
            $('#play-'+fpp).removeClass('hide-me');
            this.showKitty(false);
            if (Game.cardsPlayedTricks.length)
                $('#ttricks').removeClass('hide-me');
            else
                $('#ttricks').addClass('hide-me');
            break;
        case 3: // discard and choose trump suit
            $('#ttricks').addClass('hide-me');
            $('#play-div').addClass('hide-me');
            $('.bid-table,.bid-self').addClass('hide-me');
            $('#discards').removeClass('hide-me');
            this.showKitty(false);
            break;
        }
    },
    clickCardEnabled: false,
    // Clicked on a card in the player's hand
    clickCard: function(n) {
        //console.log('Card '+n+' is '+ (n<Game.hand.length? Game.hand[n] : 'blank/unknown'));
        if (this.clickCardEnabled) {
            if (Game.discarded) {
                this.clickCardEnabled = false; // disable after each play of a single card
                const r = {'action':'cardsPlayed', 'plays': [Game.hand[n]], 'fromSeat': Game.ourSeat};
                Game.wsSendMsg(r);
            }
            if (Game.discardAtPos(n)) {
                this.updateCardsDisplay();
            }
        }
    },
    // Clicked on a card in the discard group
    clickDis: function(n) {
        //console.log('Discard '+n+' is '+ (n<Game.discards.length? Game.discards[n] : 'non-existant'));
        if (Game.reclaimAtPos(n)) {
            this.updateCardsDisplay();
        }
    },

    updateCards: function(uses, newHand, hide=true) {
        for (var i = 0; i< uses.length; ++i) {
            var svg = uses.eq(i).parents('svg');
            if (i<newHand.length) {
                uses[i].href.baseVal = 'cards0.svg#'+newHand[i];
                svg.removeClass('hide-me');
            } else {
                uses[i].href.baseVal = 'cards0.svg#cblank';
                if (hide)
                    svg.addClass('hide-me');
            }
        }
    },
    updateCardsDisplay: function() {
        var uses = $("#hand").find("use");
        // Sort hand according to Auction 45s order
        var ts = $("input[name=trumpSuit]:checked").val();
        Game.hand.sort(A45s.comparator(ts));
        this.updateCards(uses, Game.hand);
        //this.clearBidTable();
        // are the discards visible?
        if (this.playView == 3) {
            uses = $("#discards .card-lg").find("use");
            this.updateCards(uses, Game.discards);
        }
    },
    deckShuffled: function(data) {
        this.clearBidTable(data.fore); // first bid position
        this.updateCardsDisplay();
        this.showPlayArea(0);
        this.setDealerInfo(data);
        this.updateSeatNamesInDisplay();
        $('.sidenav').sidenav('close'); // close Lobby slide-out
    },
    // declarer is clicking on trump suit radio buttons
    trumpSuitClickChange() {
        var ts = $("input[name=trumpSuit]:checked").val();
        if (ts) {
            // Pre-select trump suit cards
            var cards = Game.hand.concat(Game.discards);
            Game.hand.length = 0;
            Game.discards.length = 0;
            for (var c of cards) {
                if (ts == c.substring(2) || c == "a_he") {
                    Game.hand.push(c);
                } else {
                    Game.discards.push(c);
                }
            }
        }
        this.updateCardsDisplay();
    },
    handSelected: function() {
        // Make sure trump suit has been chosen if we are the declarer
        const declarerSeat = (Game.declarer&3);
        var ts = $("input[name=trumpSuit]:checked").val();
        if (ts || Game.ourSeat != declarerSeat) {
            const r = {'action':'handSelected', 'cards': Game.hand, 'trumpSuit': ts};
            Game.wsSendMsg(r);
            this.biddingEnded();
            this.showPlayArea(0, 'nokitty');
        } else {
            alert('You must select a trump suit');
        }
    },
    // This can be called directly without handSelected() when joining an in-progress game
    biddingEnded(data) {
        Game.discarded = true;
        this.clickCardEnabled = false; // no more discards
    },
    rcvCards() {
        this.updateCardsDisplay();
        if (Game.discarded) {
            this.showPlayArea(2); // show card play area
            this.prepForePlayOrder();
        } else {
            this.showPlayArea(1, 'hide-self'); // show bidding area
        }
    },

    lobbyGameStatus: function(started, gn) {
        var status;
        if (started) {
            status = 'in progress';
        } else {
            if (gn == Game.ourGame) {
                status = '<button class="btn-small btn-floating" type="button"'+
                ' onclick="Game.shuffleDeck()">'+
                '<i class="material-icons play-lg">play_circle_outline</i>' +
                '</button> start';
            } else {
                status = 'not started';
            }
        }
        return status;
    },
    updateGamesDisplay: function() {
        var gt = $('#gtable');
        gt.empty();  // Clear out previous games list
        var gn = 1;
        for (var g of Game.games) {
            var r = '<tr><td>'+gn+'</td>';
            var sn = 0;
            for (var s of g.seats) {
                r += '<td>'+(s?s:
                    '<button class="btn-small" onClick="UI.sitAt('+gn+','+sn+',this)">'
                    +(g.started ? 'join' : 'sit')
                    +'</button>' )+'</td>';
                ++sn;
            }
            r += '<td>'+this.lobbyGameStatus(g.started, gn)+'</td>';
            gt.append(r);
            ++gn;
        };
    },
    updateUsersDisplay: function() {
        var uList = $('#uList');
        uList.empty();  // Clear out previous list
        Game.users.forEach(u => {
            uList.append('<li class="collection-item">'+u+'</li>');
        });
    },

    // 0: not connected, 1: connected, 2: logged in
    updateLoginDisplay(state) {
        if (state > 1 && Game.username) {
            $('#logi-name').text(Game.username);
        } else {
            $('#logi-name').text(state? 'connected' : 'not connected');
        }
    },

    init: function() {
        Game.shuffleInit();
        this.showPlayArea(0); // pre-bidding view
        const username = Game.username || localStorage.getItem('mjk-username');
        if (username) {
            $('#mjk-username').val(username);
        }
        this.updateLoginDisplay(0); // until logged in, hide connected username

        // Lobby slide-out panel
        $('.sidenav').sidenav();  // initialize lobby slide-out panel
        $('.tabs').tabs();  // initialize tabs
        $('.tabs').tabs('select','tab-games'); // pre-select games tab, since class="active" not

        // Make sure 'enter' in form fields doesn't close WebSocket
        $('form').on('submit', (event)=>{ event.preventDefault(); });

        // Modal login dialog
        var elems = document.querySelectorAll('.modal');
        var instances = M.Modal.init(elems);
        $('#login').modal({'dismissible': false});
        M.updateTextFields(); // reflect pre-init of login value from locaStorage

        // Click event handlers for player hand cards and discards
        var svgs = $("#hand").find("svg");
        for (var i=0; i<svgs.length; ++i) {
            svgs.eq(i).attr('onclick', 'UI.clickCard('+i+')' );
        }
        svgs = $("#discards .card-lg").find('svg');
        for (var i=0; i<svgs.length; ++i) {
            svgs.eq(i).attr('onclick', 'UI.clickDis('+i+')' );
        }
        svgs = $("#ttricks").find('use');
        for (var i=0; i<svgs.length; ++i) {
            svgs.eq(i).attr('onclick', 'UI.showTrick('+i+')' );
        }
        // Change event handler for trump suit (winning bidder only)
        $("input[name=trumpSuit]").change(this.trumpSuitClickChange.bind(this));
    }
};

// For each action received from the server, map to handler
const WsActionHandlers = {
    'authenticate': wsRcv.authenticate,
    'userExited': wsRcv.userExited,
    'userJoined': wsRcv.userJoined,
    'allGames': wsRcv.allGames,
    'allUsers': wsRcv.allUsers,
    'seatDiff': wsRcv.seatDiff,
    'yourGame': wsRcv.ourGame,
    'deckShuffled': wsRcv.deckShuffled,
    'cardsDealt': wsRcv.rcvCards, // data.cards[]
    'kitty': wsRcv.kitty,
    'playInProgress': UI.playInProgress.bind(UI), // for join-in-progress
    'trumpSuit': UI.trumpSuit.bind(UI),
    'bid': UI.bids.bind(UI),
    'cardsPlayed': UI.cardsPlayed.bind(UI),
    'playACard': UI.playACard.bind(UI),
    'trickEnd': UI.trickEnd.bind(UI),
    'pastPlays': UI.rcvPastTricks.bind(UI),
    'playEnd': UI.playEnd.bind(UI),
    'contract': UI.endOfBidding.bind(UI),
    'yourBid': UI.showOurBidArea.bind(UI)
};

// Function that executed jQuery code after page load is complete
$(document).ready(function(){
    Game.init();
    UI.init();
});

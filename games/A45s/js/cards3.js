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
    trumpSuit: null, // cached copy of UI authoritative methods ('cl', 'di', 'he', 'sp')
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
        this.trumpSuit = null;
        this.prepNextDeal();
    },
    // Things that the UI needs before deck shuffled msg arrives
    prepNextDeal() {
        this.declarer = 255;
    },

    // Get 5 cards for deck as {'cards': [...]}
    dealCards: function(n) {
        this.wsSendMsg({'action': 'dealTopCards', 'numCards': n});
    },
    // Add kitty cards to the play hand
    addKittyCards(a=null) {
        if (this.hand.length > 5) { this.hand.length = 5; }
        const b = a?a.sort(A45s.comparator(null)): ['cbcatsil','cbcatsil','cbcatsil','cbcatsil'];
        Array.prototype.push.apply(this.hand, b); // add all of b to end of hand
    },
    weAreDealer() {
        return this.dealer == this.ourSeat;
    },
    weAreDeclarer() {
        return this.declarer != 255 && (this.declarer&3) == this.ourSeat;
    },
    isTrump(c) {
        return this.trumpSuit == c.substring(2) || c == 'a_he';
    },
    // was trump led?
    trumpLed() {
        return (this.cardsPlayed.length && this.isTrump(this.cardsPlayed[0]));
    },
    // is it legal to play hand[n]
    legalPlay(n) {
        if (!this.trumpLed() || this.isTrump(this.hand[n])) {
            return true; // legal if trump not led or card is trump
        } else {
            // Only legal if no trump cards left
            var foundTrump = false;
            for (var i=0; i<this.hand.length && !foundTrump; ++i) {
                // You can renege the 5 of trump, but not others
                foundTrump = this.isTrump(this.hand[i]) && this.hand[i][0] != '5';
            }
            return !foundTrump;
        }
    },
    // get array of hand[] indices that contain trump cards
    trumpsInHand() {
        var a = [];
        for (var i=0; i<this.hand.length; ++i) {
            // You can renege the 5 of trump, but not others
            if (this.isTrump(this.hand[i])) {
                a.push(i);
            }
        }
        return a;
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
        UI.animateKitty();
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
    bidCnt: 0, bidMax: 1,
    enterBidInDisplay: function(bid) {
        if (bid > this.bidMax)
            this.bidMax = bid; // track highest bid
        $('.bid-table td').eq(this.bidCnt++).text(bid);
    },
    enterBidWaiting: function() {
        $('.bid-table td').eq(this.bidCnt).text('?');
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
        this.bidMax = 1; // Clear out old high bid
        this.enterBidWaiting();
        //console.log('clearBidTable()')
    },
    bbids: ['pass',15,20,25,30,60],
    // enable our bid selection
    showOurBidArea(v=true) {
        if (v) {
            // show only legal bids
            const q = $('.bid-self button');
            const pts = this.getTotPts();
            const teamMax = (pts[Game.ourSeat&1]<0?60:30);
            for (var i=1; i<this.bbids.length && i<q.length; ++i) {
                const dbl = '' + (this.bbids[i] >= 30 ? '/'+this.bbids[i]*2 :'');
                if (this.bbids[i] > this.bidMax && this.bbids[i] <= teamMax) {
                    q.eq(i).text('bid: '+this.bbids[i]+dbl);
                    q.eq(i).removeClass('hide-me');
                } else if (this.bbids[i] == this.bidMax && Game.weAreDealer()
                            && this.bbids[i] <= teamMax) {
                    q.eq(i).text('hold: '+this.bbids[i]+dbl);
                    q.eq(i).removeClass('hide-me');
                } else {
                    q.eq(i).addClass('hide-me');
                }
            }
        }
        this.show('.bid-self', v);
    },
    show(sel, v=true) {
        if (v) {
            $(sel).removeClass('hide-me');
        } else {
            $(sel).addClass('hide-me');
        }
    },
    yourBid(data) {
        // Highlight currently bidding player
        this.highlightActivePlayer(data.toSeat);
        this.enterBidWaiting();
        this.showOurBidArea(data.toSeat == Game.ourSeat);
    },
    // received contract msg from server
    endOfBidding(contract) {
        Game.declarer = contract.declarer;
        const declarerSeat = (Game.declarer&3);
        Game.fore = contract.fore || ((declarerSeat+1)&3);
        const cBid = Math.floor(Game.declarer/16)*5 + 15;
        $('.contractWho').text(Game.games[Game.ourGame-1].seats[declarerSeat]);
        $('#contractBid').text(cBid);
        // Are we the declarer?  If so, add kitty cards to our hand
        if (Game.weAreDeclarer()) {
            // Declarer's discards display and kitty animation on rcv kitty cards
        } else {
            this.showPlayArea(3); // show discards
            this.prepDiscardsDisplay();
            this.updateCardsDisplay();
        }
        this.highlightActivePlayer(declarerSeat);
    },
    // animate transfer of kitty to declarer's hand
    animateKitty() {
        // rcv function has added kitty to hand, but no UI update yet
        const anim = 'animated zoomOut';
        $('#khand').addClass(anim).one(
            'webkitAnimationEnd animationend', function() {
                UI.showKitty(false); // hide before removing animation
                $(this).removeClass(anim);

                // after animation
                UI.clickCardEnabled = true; // for discards
            }
        );
        UI.showPlayArea(3, {'showKitty':true}); // show discards
        UI.updateCardsDisplay({'noSort':true});
        UI.prepDiscardsDisplay();

        // simultaneously animate new cards in hand
        const q = $("#hand").find("svg");
        for (var aa of [5,6,7,8]) {
            q.eq(aa).addClass('animated zoomIn').one(
                'webkitAnimationEnd animationend', function() {
                    UI.showKitty(false); // hide before removing animation
                    $(this).removeClass('animated zoomIn');
            });
        }
    },
    prepDiscardsDisplay() {
        // Enable appropriate discard table rows
        const ts = this.getTrumpSuit() || false;
        const decl = Game.weAreDeclarer();
        this.show('#disSelRow', ts || decl);
        this.show('#b-done', ts);
        this.show('.rdo-trump', decl);
        this.show('#disWOTRow', !ts && !decl);
        this.show('#disTrumpRow', !decl);
        if (decl && !ts) {
            // declarer hasn't selected trump yet.  Pulse the radio choices
            $('.rdo-trump label').addClass('animated pulse infinite');
        }
    },
    showKitty(v=true) { this.show('#khand', v); },
    seatToDir: ['E', 'S', 'W', 'N'],
    setDealerInfo(data) {
        if (data.dealerName == 'Robot')
            $('#curDealer').text(this.seatToDir[data.dealer]+' Robot');
        else
            $('#curDealer').text(data.dealerName);

        // Make crown visible in dealer namebar
        const crowns = $('.crowncl'); // each is an SVG
        for (var i=1; i<5; ++i) {
            var si = (Game.ourSeat+i)&3;
            this.show(crowns.eq(i), (si == Game.dealer));
        }
        console.log('setDealerInfo');
    },
    namebars: [],
    updateSeatDirs() {
        const dirs = $('.seatdir');
        const bars = $('.namebar');
        for (var i=2; i<6; ++i) {
            var si = (Game.ourSeat+i-1)&3;
            this.namebars[si] = bars.eq(i);
            dirs.eq(i).text(this.seatToDir[si]);
            dirs.eq(i).removeClass((si&1)? 'EW':'NS');
            dirs.eq(i).addClass((si&1)? 'NS':'EW');
        }
    },
    updateSeatNamesInDisplay() {
        // Update player names
        const seats = Game.games[Game.ourGame-1].seats;
        const names = $('.seatname');
        for (var i=2; i<6; ++i) {
            var si = (Game.ourSeat+i-1)&3;
            names.eq(i).text((seats[si] || 'Robot'));
        }
    },
    seatAssigned() {
        // with seat assignment, can init play display by fore number
        this.fpPos = ['n','l','o','r'];
        for (var i=0; i<Game.ourSeat; ++i) {
            this.fpPos.unshift( this.fpPos.pop() ); // rotate right
        }
        this.updateSeatDirs();
    },
    otherPlayerCfan: [],
    updateOtherPlayerNumCards() {
        while (this.otherPlayerCfan.length) {
            var uses = $('#'+this.fpPos[this.otherPlayerCfan.shift()]
                        +'hand td.card-fan-m').find("use");
            this.updateCards(uses, ['cbfan'+(4-Game.cardsPlayedPast.length)], false);
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
    playPosToEff: {'l': 'Left','o':'Down', 'r':'Right', 'n':'Up'},
    cardsPlay1(c, fromSeat) {
        Game.cardsPlayed.push(c);
        if (fromSeat != Game.ourSeat) { // reduce card fan size of other player
            this.otherPlayerCfan.push(fromSeat);
        }
        if (!this.sleeping) {
            this.updateOtherPlayerNumCards();
            const q = this.qForePlay();
            this.updateCards(q.find("use"), Game.cardsPlayed, false); /*
            const wDir = this.fpPos[(Game.fore+Game.cardsPlayed.length-1)&3];
            const anim = 'animated slideIn'+this.playPosToEff[wDir];
            q.find('use').eq(Game.cardsPlayed.length-1).addClass(anim).one(
                'webkitAnimationEnd animationend', function() {
                    $(this).removeClass(anim);
                }
            ); /* */
        }
    },
    cardsPlayed(data) {
        var fromSeat = data.fromSeat; // use for transition effects
        for (var c of data.plays) {
            this.cardsPlay1(c, (fromSeat++)&3);
        }
    },
    // Animate the play spot for this player
    cardPlayAnimate(ena=true) {
        const uses = this.qForePlay().find("use");
        const anim = 'animYourPlay'; //'animated fadeIn flash infinite';
        if (uses.length > Game.cardsPlayed.length) {
            if (ena) {
                // Use the transparent 'Your play' card
                uses[Game.cardsPlayed.length].href.baseVal = 'cards0.svg#cyplay';
                uses.eq(Game.cardsPlayed.length).addClass(anim);
            } else {
                // if still on 'Your play' card, set to blank
                if (uses[Game.cardsPlayed.length].href.baseVal == 'cards0.svg#cyplay') {
                    uses[Game.cardsPlayed.length].href.baseVal = 'cards0.svg#cblank';
                }
                uses.eq(Game.cardsPlayed.length).removeClass(anim);
            }
        }
    },
    waitingOn(data) {
        this.highlightPlayers(data.fromSeat);
    },
    // Highlight the single active player
    highlightActivePlayer(si) { this.highlightPlayers([si]); },
    // Highlight multiple players (for waiting on...)
    highlightPlayers(arr) { // sorted array, low to high
        var si = arr.shift(); // get first seat to highlight
        for (var i=0; i<this.namebars.length; ++i) {
            this.namebars[i].removeClass(i == si? 'nb-inactive':'nb-active');
            this.namebars[i].addClass(i == si? 'nb-active':'nb-inactive');
            if (i == si)
                si = arr.shift(); // next seat, if any
        }
    },
    playACard(data) {
        this.highlightActivePlayer(data.fromSeat);
        this.clickCardEnabled = (data.fromSeat == Game.ourSeat); // for play of a single card
        if (this.sleeping && this.clickCardEnabled) {
            this.sleepingClickEnable = true;
            this.clickCardEnabled = false;
        } else if (!this.sleeping && this.clickCardEnabled) {
            this.cardPlayAnimate();
        }
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
    sleepingClickEnable: false,
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
                this.clickCardEnabled = this.sleepingClickEnable;
                this.sleepingClickEnable = false;
                this.updateOtherPlayerNumCards();
                this.prepForePlayOrder();
                if (this.clickCardEnabled) {
                    this.cardPlayAnimate();
                }
            });
        }
    },
    showTrick(n) {
        this.updateCards($('#play-trick-svg').find("use"), Game.cardsPlayedPast[n]);
        $('#showATrick').modal('open');
    },
    playEnd(data) {
        // Hand play is complete.  Show results
        $('#ptsEW').text(data.ptsEW ? data.ptsEW : "0");
        $('#ptsNS').text(data.ptsNS ? data.ptsNS : "0");
        $('#ptsTotEW').text(data.totEW ? data.totEW : "0");
        $('.totPtsVal').eq(0).text(data.totEW ? data.totEW : "0");
        $('#ptsTotNS').text(data.totNS ? data.totNS : "0");
        $('.totPtsVal').eq(1).text(data.totNS ? data.totNS : "0");

        $('.playEnd').removeClass('hide-me');
    },
    getTotPts() {
        const q = $('.totPtsVal');
        return [q.eq(0).text(), q.eq(1).text()];
    },
    getScoreHistory() {
        Game.wsSendMsg({'action': 'getScoreHistory'});
    },
    tdWinCell(a,b) {
        return (a>b ? '<td class="winCell">':'<td>')+a+'</td>'+
                (b>a ? '<td class="winCell">':'<td>')+b+'</td>';
    },
    scoreHistory(data) {
        var st = $('#scoreHbody');
        st.empty();  // Clear out previous score history
        var gn = 1;
        // Add completed games history
        for (var pg of data.pastGames) {
            var r = '<tr class="pastGames"><td>'+gn+'</td>';
            r += this.tdWinCell(pg[0], pg[1]) + '</tr>';
            st.append(r);
            ++gn;
        };
        // Add current game history
        r = '<tr><td rowspan="'+(data.pastScores.length+1)+'">'+gn+'</td>';
        if (data.pastScores.length) {
            r += this.tdWinCell(data.pastScores[0][0], data.pastScores[0][1])+'</tr>';
            st.append(r);
            for (var i=1; i<data.pastScores.length; ++i) {
                r = '<tr>'+this.tdWinCell(data.pastScores[i][0], data.pastScores[i][1])+'</tr>';
                st.append(r);
            };
            r = '<tr class="bordtop nb-kitty"><td>'+data.score[0]
                +'</td>'+'<td>'+data.score[1]+'</td></tr>';
        } else {
            // no score history yet
            r += '<td colspan="2"><i>No score history yet</i></td></tr>';
        }
        st.append(r);
        $('#scoreHistory').modal('open');
    },
    // UI prep for next deal
    prepNextDeal() {
        $('.playEnd').addClass('hide-me');
        this.updateCards($('.card-fan-m').find("use"), ['cbfan5','cbfan5','cbfan5']);
        Game.prepNextDeal();
        this.trumpSuit({'suit': 'cbcatsil'}); // contract suit unknown
        $('.contractWho').text('TBD'); // declarer To Be Determined
    },
    shuffleNextDealer() {
        this.prepNextDeal();
        Game.wsSendMsg({'action': 'shuffleNextDealer'});
    },
    // Game just announced the trump suit
    trumpSuit(data) {
        this.setTrumpSuit(data.suit);
        this.updateCards($('.contractSuit svg').find('use'), [data.suit, data.suit]);
        this.prepDiscardsDisplay();
        // If just selected a trump, and not declarer, enable card clicks
        if (this.getTrumpSuit() && !Game.weAreDeclarer()) {
            this.preSelectTrumpCards();
            this.clickCardEnabled = true;
        }
    },
    getTrumpSuit() {
        const ts = $("input[name=trumpSuit]:checked").val();
        Game.trumpSuit = ts; // Cached copy for quick access
        return ts;
    },
    setTrumpSuit(suit) { // any invalid suit unselects all
        const q = $("input[name=trumpSuit][value='"+suit+"']");
        if (q.length) { // found suit value?
            q.prop('checked', true); // check selected suit
            Game.trumpSuit = suit; // Cached copy for quick access
        } else { // unset any currently selected suit
            $("input[name=trumpSuit]:checked").prop('checked', false); // uncheck selected
            Game.trumpSuit = null; // Cached copy for quick access
        }
    },

    // show 0:nothing, 1:bid, 2:play 3:discard
    fpPos: ['l','o','r','n'],
    playView: 0, // starts as pre-bidding (blank) view
    showPlayArea: function(v, option={}) {
        this.playView = v;
        switch (v) {
        case 0:
            $('#discards').addClass('hide-me');
            $('#ttricks').addClass('hide-me');
            $('#play-div').addClass('hide-me');
            $('.bid-table,.bid-self').addClass('hide-me');
            this.showKitty(option.showKitty || false);
            break;
        case 1: // bidding
            $('#discards').addClass('hide-me');
            $('#ttricks').addClass('hide-me');
            $('#play-div').addClass('hide-me');
            //this.clearBidTable();
            $('.bid-table').removeClass('hide-me');
            this.showOurBidArea(!option['hide-self']);
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
            this.showKitty(option.showKitty || false);
            break;
        }
    },
    clickCardEnabled: false,
    // Clicked on a card in the player's hand
    clickCard: function(n) {
        //console.log('Card '+n+' is '+ (n<Game.hand.length? Game.hand[n] : 'blank/unknown'));
        if (this.clickCardEnabled) {
            var valid = true;
            if (Game.discarded) {
                if (!Game.legalPlay(n)) {
                    valid = false;
                    const a = Game.trumpsInHand(); // indices of all trump cards
                    const q = $("#hand").find("svg");
                    for (var aa of a) {
                        q.eq(aa).addClass('animated bounce infinite');
                    }
                } else {
                    this.clickCardEnabled = false; // disable after each play of a single card
                    // Clear any previous animations
                    $("#hand").find("svg").removeClass('animated bounce infinite');
                    this.cardPlayAnimate(false);
                    // Show animation for card moving up
                    const anim = 'animated slideOutUp';
                    $("#hand").find("svg").eq(n).addClass(anim).one(
                        'webkitAnimationEnd animationend', function() {
                            $(this).removeClass(anim);

                            const r = {'action':'cardsPlayed', 'plays': [Game.hand[n]], 'fromSeat': Game.ourSeat};
                            Game.wsSendMsg(r);
                            if (Game.discardAtPos(n))
                                UI.updateCardsDisplay();
                        }
                    ); /* */
                }
            } else if (valid && Game.discardAtPos(n)) {
                // show card removed from hand
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
    updateCardsDisplay: function(options={}) {
        var uses = $("#hand").find("use");
        if (uses.length > 9) {
            uses.length = 9; // ignore crown in namebar
        }
        // Sort hand according to Auction 45s order
        var ts = this.getTrumpSuit();
        if (!options.noSort) {
            Game.hand.sort(A45s.comparator(ts));
        }
        this.updateCards(uses, Game.hand);
        //this.clearBidTable();
        // are the discards visible?
        if (this.playView == 3) {
            uses = $("#discards .card-lg").find("use");
            this.updateCards(uses, Game.discards);
        }
    },
    deckShuffled: function(data) {
        this.prepNextDeal();
        this.clearBidTable(data.fore); // first bid position
        this.updateCardsDisplay();
        this.showPlayArea(0);
        this.setDealerInfo(data);
        this.updateSeatNamesInDisplay(); // To add asterisk next to dealer, for Jane
        $('.sidenav').sidenav('close'); // close Lobby slide-out
    },
    // declarer is clicking on trump suit radio buttons
    trumpSuitClickChange() {
        $('.rdo-trump label').removeClass('animated pulse infinite'); // choice made
        this.preSelectTrumpCards();
    },
    preSelectTrumpCards() {
        var ts = this.getTrumpSuit();
        if (ts) {
            // Pre-select trump suit cards
            var cards = Game.hand.concat(Game.discards);
            if (Game.weAreDeclarer()) {
                cards.sort(A45s.comparator(null));
            }
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
        this.show('#b-done', true);
        $('#b-done').addClass('animated pulse infinite'); // choice made
    },
    handSelected: function() {
        // Make sure trump suit has been chosen before chosing discards
        var ts = this.getTrumpSuit();
        if (ts) {
            $('#b-done').removeClass('animated pulse infinite'); // choice made
            const r = {'action':'handSelected', 'cards': Game.hand, 'trumpSuit': ts};
            Game.wsSendMsg(r);
            this.biddingEnded();
            this.showPlayArea(0, {'showKitty':false});
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
            this.showPlayArea(1, {'hide-self':true}); // show bidding area
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
        if (Game.games.length == 0) {
            // Not connected.
            var r = '<tr><td colspan="6">⚠️<i>You are not connected</i> - '
            +'<button class="btn-small" onClick="Game.init()">Re-connect</button>'
            +'</td></tr>';
            gt.append(r);
        }
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
            if (state == 0) {
                Game.games.length = 0;
                UI.updateGamesDisplay();
            }
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
        $(".dropdown-trigger").dropdown({ coverTrigger: false }); // nav-bar drop-down

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
    'scoreHistory': UI.scoreHistory.bind(UI),
    'contract': UI.endOfBidding.bind(UI),
    'waitingOn': UI.waitingOn.bind(UI),
    'yourBid': UI.yourBid.bind(UI)
};

// Function that executed jQuery code after page load is complete
$(document).ready(function(){
    Game.init();
    UI.init();
});

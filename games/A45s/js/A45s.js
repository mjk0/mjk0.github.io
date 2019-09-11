// Auction 45s-specific functions
const A45s = {
    sortOrder: {},
    suitOrder: {
        'none': ['het', 'clt', 'dit', 'spt'],
        'cl': ['clt', 'din', 'spn', 'hen'],
        'di': ['dit', 'cln', 'hen', 'spn'],
        'he': ['het', 'cln', 'din', 'spn'],
        'sp': ['spt', 'din', 'cln', 'hen'],
        // For each suit, as non-trump and as trump
        'clt': ['5_cl', 'j_cl', 'a_he', 'a_cl', 'k_cl', 'q_cl', '2_cl', '3_cl', '4_cl', '6_cl', '7_cl', '8_cl', '9_cl', 't_cl'],
        'cln': ['k_cl', 'q_cl', 'j_cl', 'a_cl', '2_cl', '3_cl', '4_cl', '5_cl', '6_cl', '7_cl', '8_cl', '9_cl', 't_cl'],
        'dit': ['5_di', 'j_di', 'a_he', 'a_di', 'k_di', 'q_di', 't_di', '9_di', '8_di', '7_di', '6_di', '4_di', '3_di', '2_di'],
        'din': ['k_di', 'q_di', 'j_di', 't_di', '9_di', '8_di', '7_di', '6_di', '5_di', '4_di', '3_di', '2_di', 'a_di'],
        'spt': ['5_sp', 'j_sp', 'a_he', 'a_sp', 'k_sp', 'q_sp', '2_sp', '3_sp', '4_sp', '6_sp', '7_sp', '8_sp', '9_sp', 't_sp'],
        'spn': ['k_sp', 'q_sp', 'j_sp', 'a_sp', '2_sp', '3_sp', '4_sp', '5_sp', '6_sp', '7_sp', '8_sp', '9_sp', 't_sp'],
        'het': ['5_he', 'j_he', 'a_he', 'k_he', 'q_he', 't_he', '9_he', '8_he', '7_he', '6_he', '4_he', '3_he', '2_he'],
        'hen': ['k_he', 'q_he', 'j_he', 't_he', '9_he', '8_he', '7_he', '6_he', '5_he', '4_he', '3_he', '2_he']
    },

    init: function() {
        for (var trumpSuit of ['none', 'cl', 'di', 'he', 'sp']) {
            var so = {}; // empty assoc array
            var ord = 52;
            for (var suit of this.suitOrder[trumpSuit]) {
                for (var c of this.suitOrder[suit]) {
                    if (c !== 'a_he' || trumpSuit !== 'none' || suit == 'het') {
                        so[c] = ord--;
                    }
                }
            }
            so['cback'] = ord; // -1
            so['cbcatsil'] = ord; // -2
            this.sortOrder[trumpSuit] = so;
            if (ord !== 0)
                console.log('For '+trumpSuit+' trump: '+JSON.stringify(so));
        }
    },

    // Returns Comparator function to help sort in trump-suited order
    comparator: function(trumpSuit) {
        return function(a, b) {
            var so = A45s.sortOrder[trumpSuit || 'none'];
            //console.log('sorting with trump suit of "'+trumpSuit+'"');
            if (!(a in so)) {
                console.log('card '+a+' not in sort order of '+JSON.stringify(so));
            }
            if (!(b in so)) {
                console.log('card '+b+' not in sort order of '+JSON.stringify(so));
            }
            return (so[b] - so[a]);
        }
    }
};

A45s.init();

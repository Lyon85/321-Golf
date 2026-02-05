// Shared game state (load second)
(function (global) {
    var Golf = global.Golf;
    Golf.state = {
        game: null,
        players: [],
        hole: null,
        holeSensor: null,
        holeArrow: null,
        clubs: [],
        golfCarts: [],
        currentHoleIndex: 0,
        isMatchActive: false,
        isWaitingToStart: true,
        playerReady: [false, false], // [P1 ready, P2/AI ready]
        aimLine: null,
        hitConeGraphics: null,
        particles: null,
        terrains: [],
        isHost: true,
        connection: null,
        remotePlayers: {},
        myId: null
    };
})(typeof window !== 'undefined' ? window : this);

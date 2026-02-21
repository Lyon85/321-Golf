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
        currentHoleIndex: 1,
        isMatchActive: false,
        isWaitingToStart: true,
        playerReady: [false, false], // [P1 ready, P2/AI ready]
        aimLine: null,
        hitConeGraphics: null,
        particles: null,
        terrains: [],
        myPlayerId: null, // Server-assigned player ID (0 or 1)
        inspectPoint: null, // Point to inspect for slope info
        lastProcessedInput: 0,
        pendingInputs: []
    };
})(typeof window !== 'undefined' ? window : this);

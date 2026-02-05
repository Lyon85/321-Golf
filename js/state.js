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
        aimLine: null,
        hitConeGraphics: null,
        particles: null,
        terrains: []
    };
})(typeof window !== 'undefined' ? window : this);

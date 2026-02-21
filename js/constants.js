// Collision categories and club types (load first)
(function (global) {
    var Golf = (global.Golf = global.Golf || {});

    Golf.CAT_DEFAULT = 0x0001;
    Golf.CAT_PLAYER = 0x0002;
    Golf.CAT_BALL = 0x0004;
    Golf.CAT_BUILDING = 0x0010;
    Golf.CAT_CAR = 0x0020;
    Golf.CAT_HOLE = 0x0040;
    Golf.CAT_TERRAIN = 0x0080;
    Golf.CAT_DEEP_WATER = 0x0100;
    Golf.LOBBY_ROOM_PREFIX = '321golf-room-';
    Golf.INSPECT_RADIUS = 5; // Radius in tiles for slope inspection

    // Elevation Constants
    Golf.SLOPE_FORCE_MULT = 0.0003;
    Golf.ELEVATION_GRID_SIZE = 512; // Resolution of height visuals
    // Colors from Valley to Peak
    Golf.ELEVATION_COLORS = [
        0x1b5e20, // -1.0 (Deep Valley)
        0x2e7d32, // -0.5 (Low)
        0x4caf50, //  0.0 (Flat)
        0x8bc34a, //  0.5 (Hill)
        0xd4e157  //  1.0 (Peak)
    ];

    Golf.CLUB_TYPES = {
        DRIVER: { name: 'Driver', power: 0.02, accuracy: 0.5, color: 0xffd32a, arc: 1.5 },
        IRON: { name: 'Iron', power: 0.01, accuracy: 0.75, color: 0xff3f34, arc: 1.0 },
        PUTTER: { name: 'Putter', power: 0.005, accuracy: 1.0, color: 0x0fbcf9, arc: 0 }
    };

    Golf.PLAYER_STATES = {
        IDLE: 'IDLE',
        WALKING: 'WALKING',
        SWINGING: 'SWINGING',
        SWIMMING: 'SWIMMING'
    };

    Golf.SWING_STATES = {
        NONE: 'NONE',
        BACKSWING: 'BACKSWING',
        HIT: 'HIT'
    };

    Golf.DIRECTIONS = {
        N: 'N', NE: 'NE', E: 'E', SE: 'SE',
        S: 'S', SW: 'SW', W: 'W', NW: 'NW'
    };

    Golf.TERRAIN_TYPES = {
        GRASS: { name: 'Grass', color: 0x2ecc71, frictionAir: 0.015, label: 'grass', elevation: 0 },
        G1: { name: 'Grass 1', color: 0x6BD99A, frictionAir: 0.1, label: 'g1', elevation: 0 },
        G2: { name: 'Grass 2', color: 0x2ECC71, frictionAir: 0.6, label: 'g2', elevation: 0 },
        G3: { name: 'Grass 3', color: 0x15964B, frictionAir: 0.8, label: 'g3', elevation: 0 },
        ROUGH: { name: 'Rough', color: 0x27ae60, frictionAir: 1, label: 'rough', elevation: 5 },
        BUNKER: { name: 'Bunker', color: 0xf1c40f, frictionAir: 1, label: 'bunker', elevation: 0, shotPowerMult: 0.4, shotAccuracyPenalty: 15 },
        WATER: { name: 'Water', color: 0x3498db, frictionAir: 1, label: 'water', elevation: 0 },

        WATER1: { name: 'Shallow Water', color: 0x5dade2, frictionAir: 1, label: 'water1', elevation: 0 },
        WATER2: { name: 'Deep Water', color: 0x3498db, frictionAir: 1, label: 'water2', elevation: 0 },
        WATER3: { name: 'Abyss', color: 0x2874a6, frictionAir: 1, label: 'water3', elevation: 0 },
        MOUNTAIN: { name: 'Mountain', color: 0x7f8c8d, frictionAir: 0.1, label: 'mountain', elevation: 20 },
        M1: { name: 'Mountain 1', color: 0xA2B4B5, frictionAir: 0.1, label: 'm1', elevation: 30 },
        M2: { name: 'Mountain 2', color: 0x7f8c8d, frictionAir: 0.1, label: 'm2', elevation: 60 },
        M3: { name: 'Mountain 3', color: 0x627071, frictionAir: 0.1, label: 'm3', elevation: 100 }
    };

    /**
     * Converts world (top-down) coordinates to screen (isometric) coordinates.
     */
    Golf.toIsometric = function (x, y) {
        return {
            x: x - y,
            y: (x + y) / 2
        };
    };

    /**
     * Converts screen (isometric) coordinates back to world (top-down) coordinates.
     */
    Golf.fromIsometric = function (isoX, isoY) {
        return {
            x: (2 * isoY + isoX) / 2,
            y: (2 * isoY - isoX) / 2
        };
    };
})(typeof window !== 'undefined' ? window : this);

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
        DRIVER: { name: 'Driver', power: 0.015, accuracy: 0.7, color: 0xffd32a, arc: 1.5 },
        IRON: { name: 'Iron', power: 0.009, accuracy: 0.95, color: 0xff3f34, arc: 1.0 },
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
        GRASS: { name: 'Grass', color: 0x2ecc71, frictionAir: 0.015, label: 'grass' },
        ROUGH: { name: 'Rough', color: 0x27ae60, frictionAir: 0.05, label: 'rough' },
        BUNKER: { name: 'Bunker', color: 0xf1c40f, frictionAir: 2.2, label: 'bunker' },
        WATER: { name: 'Water', color: 0x3498db, frictionAir: 0.2, label: 'water', cartGripMult: 0.1, cartMaxSpeedMult: 0.2 },
        WATER1: { name: 'Shallow Water', color: 0x5dade2, frictionAir: 0.1, label: 'water1', cartGripMult: 0.4, cartMaxSpeedMult: 0.5, playerSpeedMult: 0.6 },
        WATER2: { name: 'Deep Water', color: 0x3498db, frictionAir: 0.2, label: 'water2', cartGripMult: 0.1, cartMaxSpeedMult: 0.2 },
        WATER3: { name: 'Abyss', color: 0x2874a6, frictionAir: 0.3, label: 'water3', cartGripMult: 0.05, cartMaxSpeedMult: 0.1 },
        MOUNTAIN: { name: 'Mountain', color: 0x7f8c8d, frictionAir: 0.1, label: 'mountain' }
    };
})(typeof window !== 'undefined' ? window : this);

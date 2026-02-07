(function (global) {
    var Golf = global.Golf;
    var CAT_PLAYER = Golf.CAT_PLAYER;
    var CAT_BALL = Golf.CAT_BALL;
    var CAT_BUILDING = Golf.CAT_BUILDING;
    var CAT_DEFAULT = Golf.CAT_DEFAULT;
    var CAT_HOLE = Golf.CAT_HOLE;

    Golf.createPlayer = function (scene, x, y, color, isAI, playerIndex) {
        var pBody = scene.matter.add.rectangle(x, y, 32, 40, {
            friction: 0.005,
            frictionAir: 0.01,
            label: 'player',
            height: 12,
            collisionFilter: {
                category: CAT_PLAYER,
                mask: CAT_BUILDING | CAT_DEFAULT | Golf.CAT_TERRAIN | CAT_BALL | Golf.CAT_CAR
            }
        });
        pBody.baseFrictionAir = 0.03;
        var pSprite = scene.add.sprite(0, 0, 'player-sheet', playerIndex * 8) // Start frame for player
            .setDisplaySize(48, 48); // Scale up the 16x16 sprite
        // Avoid tinting for now to see actual spritesheet colors, or apply subtle tint
        // pSprite.setTint(color); 

        var bBody = scene.matter.add.circle(x + 60, y, 8, {
            friction: 0.005,
            frictionAir: 0.01,
            restitution: 0.6,
            label: 'ball',
            collisionFilter: {
                category: CAT_BALL,
                mask: CAT_BUILDING | CAT_DEFAULT | CAT_HOLE | Golf.CAT_TERRAIN | CAT_PLAYER | Golf.CAT_CAR
            }
        });
        bBody.baseFrictionAir = 0.01;
        var bSprite = scene.add.circle(0, 0, 8, 0xffffff).setStrokeStyle(1, 0x000000).setDepth(5);
        var bShadow = scene.add.circle(0, 0, 8, 0x000000, 0.3).setDepth(4).setVisible(false);
        var trail = scene.add.particles(0, 0, 'white', {
            follow: bSprite,
            scale: { start: 0.5, end: 0 },
            alpha: { start: 0.3, end: 0 },
            lifespan: 300,
            tint: color,
            frequency: 50
        });

        return {
            body: pBody,
            sprite: pSprite,
            ball: bBody,
            ballSprite: bSprite,
            ballShadow: bShadow,
            ballHeight: 0,
            ballInFlight: false,
            isAI: isAI,
            color: color,
            isAiming: false,
            power: 0,
            powerDir: 1,
            aiTimer: 0,
            inventory: [],
            activeClub: null,
            trail: trail,
            lastSafePos: { x: x + 60, y: y },
            state: Golf.PLAYER_STATES.IDLE,
            direction: Golf.DIRECTIONS.S,
            swingState: Golf.SWING_STATES.NONE,
            playerIndex: playerIndex || 0
        };
    };
})(typeof window !== 'undefined' ? window : this);

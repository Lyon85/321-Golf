(function (global) {
    var Golf = global.Golf;
    var CAT_PLAYER = Golf.CAT_PLAYER;
    var CAT_BALL = Golf.CAT_BALL;
    var CAT_BUILDING = Golf.CAT_BUILDING;
    var CAT_DEFAULT = Golf.CAT_DEFAULT;
    var CAT_HOLE = Golf.CAT_HOLE;

    Golf.createPlayer = function (scene, x, y, color, isAI) {
        var pBody = scene.matter.add.rectangle(x, y, 32, 48, {
            friction: 0.1,
            frictionAir: 0.03,
            label: 'player',
            collisionFilter: {
                category: CAT_PLAYER,
                mask: CAT_BUILDING | CAT_DEFAULT
            }
        });
        var pSprite = scene.add.rectangle(0, 0, 32, 48, color).setStrokeStyle(2, 0xffffff);

        var bBody = scene.matter.add.circle(x + 60, y, 8, {
            friction: 0.005,
            frictionAir: 0.01,
            restitution: 0.6,
            label: 'ball',
            collisionFilter: {
                category: CAT_BALL,
                mask: CAT_BUILDING | CAT_DEFAULT | CAT_HOLE
            }
        });
        var bSprite = scene.add.circle(0, 0, 8, 0xffffff).setStrokeStyle(1, 0x000000).setDepth(5);
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
            isAI: isAI,
            color: color,
            isAiming: false,
            power: 0,
            powerDir: 1,
            aiTimer: 0,
            inventory: [],
            activeClub: null,
            trail: trail
        };
    };
})(typeof window !== 'undefined' ? window : this);

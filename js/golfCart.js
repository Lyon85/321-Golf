(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;
    var CAT_BUILDING = Golf.CAT_BUILDING;
    var CAT_PLAYER = Golf.CAT_PLAYER;
    var CAT_BALL = Golf.CAT_BALL;
    var CAT_DEFAULT = Golf.CAT_DEFAULT;
    var CAT_CAR = Golf.CAT_CAR;

    Golf.createGolfCart = function (scene, x, y, color, ownerId) {
        var body = scene.matter.add.rectangle(x, y, 60, 100, {
            chamfer: { radius: 10 },
            friction: 0.5,
            frictionAir: 0.03,
            restitution: 0.2,
            density: 0.01,
            label: 'cart',
            height: 20,
            collisionFilter: {
                category: CAT_CAR,
                mask: CAT_BUILDING | CAT_PLAYER | CAT_BALL | CAT_DEFAULT | CAT_CAR | Golf.CAT_TERRAIN
            }
        });

        var sprite = scene.add.container(x, y);
        // Use the player's color for the base
        var base = scene.add.rectangle(0, 0, 60, 100, color || 0xf1c40f).setStrokeStyle(4, 0x000000);
        var roof = scene.add.rectangle(0, -10, 56, 70, 0xffffff, 0.8).setStrokeStyle(2, 0x000000);
        var seat = scene.add.rectangle(0, 25, 50, 20, 0x34495e);
        var wheel1 = scene.add.rectangle(-32, -35, 12, 24, 0x2c3e50);
        var wheel2 = scene.add.rectangle(32, -35, 12, 24, 0x2c3e50);
        var wheel3 = scene.add.rectangle(-32, 35, 12, 24, 0x2c3e50);
        var wheel4 = scene.add.rectangle(32, 35, 12, 24, 0x2c3e50);
        sprite.add([wheel1, wheel2, wheel3, wheel4, base, seat, roof]);

        var cart = { body: body, sprite: sprite, ownerId: ownerId };
        state.golfCarts.push(cart);
        return cart;
    };

    Golf.enterCart = function (p, cart) {
        if (cart.ownerId !== undefined && cart.ownerId !== p.playerIndex) return;

        p.driving = cart;
        p.sprite.setVisible(false); // Hide sprite to prevent jitter/ghosting
        p.sprite.setAlpha(0);
        p.savedMask = p.body.collisionFilter.mask;
        p.body.collisionFilter.mask = 0;
        p.body.isSensor = true;
        if (!p.isAI) state.game.scene.scenes[0].speedometer.classList.remove('hidden');
    };

    Golf.exitCart = function (p) {
        var cart = p.driving;
        p.driving = null;
        p.sprite.setVisible(true); // Show sprite again
        p.sprite.setAlpha(1);
        if (p.savedMask !== undefined) p.body.collisionFilter.mask = p.savedMask;
        p.body.isSensor = false;
        if (p.savedMask !== undefined) p.body.collisionFilter.mask = p.savedMask;
        p.body.isSensor = false;
        if (!p.isAI) state.game.scene.scenes[0].speedometer.classList.add('hidden');
        var exitAngle = cart.body.angle + Math.PI / 2;
        state.game.scene.scenes[0].matter.body.setPosition(p.body, {
            x: cart.body.position.x + Math.cos(exitAngle) * 60,
            y: cart.body.position.y + Math.sin(exitAngle) * 60
        });
    };

    Golf.handleDriving = function (scene, p, overrideKeys) {
        var cart = p.driving;
        var keys = overrideKeys || {
            W: scene.keys.W.isDown,
            A: scene.keys.A.isDown,
            S: scene.keys.S.isDown,
            D: scene.keys.D.isDown,
            SHIFT: scene.keys.SHIFT.isDown
        };

        // Grip physics (Lateral Friction)
        var sideAngle = cart.body.angle;
        var lx = Math.cos(sideAngle);
        var ly = Math.sin(sideAngle);
        var curVel = cart.body.velocity;
        var latVel = curVel.x * lx + curVel.y * ly;

        // Terrain handling modifiers
        var terrain = cart.body.currentTerrainType;
        var terrainGripMult = terrain && terrain.cartGripMult !== undefined ? terrain.cartGripMult : 1.0;
        var terrainSpeedMult = terrain && terrain.cartMaxSpeedMult !== undefined ? terrain.cartMaxSpeedMult : 1.0;

        var grip = 0.8 * terrainGripMult; // Reduce lateral sliding

        scene.matter.body.setVelocity(cart.body, {
            x: curVel.x - latVel * lx * grip,
            y: curVel.y - latVel * ly * grip
        });

        var isTurbo = keys.SHIFT;

        if (!p.turboRamp) p.turboRamp = 0;
        if (isTurbo && keys.W) {
            p.turboRamp = Math.min(1, p.turboRamp + 0.016);
        } else if (!isTurbo) {
            p.turboRamp = Math.max(0, p.turboRamp - 0.032);
        }

        var baseMax = 8 * terrainSpeedMult;
        var turboBoost = 3.0 * terrainSpeedMult;
        var currentMax = baseMax + turboBoost * p.turboRamp;

        var baseForce = 0.2 * terrainSpeedMult;
        var turboForceBoost = 0.008 * terrainSpeedMult;
        var force = baseForce + turboForceBoost * p.turboRamp;

        var torque = 0.8;
        var angle = cart.body.angle - Math.PI / 2;

        if (keys.W) {
            scene.matter.body.applyForce(cart.body, cart.body.position, {
                x: Math.cos(angle) * force,
                y: Math.sin(angle) * force
            });
        }
        if (keys.S) {
            scene.matter.body.applyForce(cart.body, cart.body.position, {
                x: -Math.cos(angle) * (force * 0.3),
                y: -Math.sin(angle) * (force * 0.3)
            });
        }

        var velocity = Math.sqrt(cart.body.velocity.x * cart.body.velocity.x + cart.body.velocity.y * cart.body.velocity.y);
        if (velocity > 0.5) {
            var turnDir = keys.S ? -1 : 1;
            if (keys.A) cart.body.torque = -torque * turnDir;
            if (keys.D) cart.body.torque = torque * turnDir;
        }

        if (velocity > currentMax) {
            var ratio = currentMax / velocity;
            scene.matter.body.setVelocity(cart.body, {
                x: cart.body.velocity.x * ratio,
                y: cart.body.velocity.y * ratio
            });
        }

        if (!p.isAI) {
            var displaySpeed = Math.floor(velocity * 10);
            scene.speedValue.innerText = displaySpeed;
            if (isTurbo) scene.speedometer.classList.add('fast');
            else scene.speedometer.classList.remove('fast');
        }
    };
})(typeof window !== 'undefined' ? window : this);

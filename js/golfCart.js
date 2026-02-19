(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;
    var CAT_BUILDING = Golf.CAT_BUILDING;
    var CAT_PLAYER = Golf.CAT_PLAYER;
    var CAT_BALL = Golf.CAT_BALL;
    var CAT_DEFAULT = Golf.CAT_DEFAULT;
    var CAT_CAR = Golf.CAT_CAR;

    Golf.createGolfCart = function (scene, x, y, color, ownerId) {
        var body = scene.matter.add.rectangle(x, y, 60, 120, {
            chamfer: { radius: 10 },
            friction: 0.5,
            frictionAir: 0.03,
            restitution: 0.2,
            density: 0.01,
            label: 'cart',
            height: 20,
            collisionFilter: {
                category: CAT_CAR,
                mask: CAT_BUILDING | CAT_PLAYER | CAT_BALL | CAT_DEFAULT | CAT_CAR | Golf.CAT_TERRAIN | Golf.CAT_DEEP_WATER
            }
        });

        // SHIFT PIVOT TO FRONT AXLE
        // Hitbox is 120 long.
        // Shift -45 puts pivot at 15px from the front.
        scene.matter.body.setCentre(body, { x: 0, y: -45 }, true);

        var sprite = scene.add.dom(x, y).createFromHTML(`
            <div class="cart-container">
                <div class="cart-visual">
                    <div class="cube cart-body">
                        <div class="face front-bottom"></div><div class="face back"></div>
                        <div class="face front"></div><div class="face back"></div>
                        <div class="face left"></div><div class="face right"></div>
                        <div class="face top"></div><div class="face bottom"></div>
                    </div>
                    <div class="cube wheel front-left">
                        <div class="face front"></div><div class="face back"></div><div class="face left"></div><div class="face right"></div><div class="face top"></div><div class="face bottom"></div>
                    </div>
                    <div class="cube wheel front-right">
                        <div class="face front"></div><div class="face back"></div><div class="face left"></div><div class="face right"></div><div class="face top"></div><div class="face bottom"></div>
                    </div>
                    <div class="cube wheel back-left">
                        <div class="face front"></div><div class="face back"></div><div class="face left"></div><div class="face right"></div><div class="face top"></div><div class="face bottom"></div>
                    </div>
                    <div class="cube wheel back-right">
                        <div class="face front"></div><div class="face back"></div><div class="face left"></div><div class="face right"></div><div class="face top"></div><div class="face bottom"></div>
                    </div>
                    <div class="cart-shadow"></div>
                </div>
            </div>
        `);

        // Set the cart color via CSS variable if provided
        if (color) {
            var hexColor = '#' + color.toString(16).padStart(6, '0');
            sprite.node.querySelector('.cart-container').style.setProperty('--cart', hexColor);
        }

        var cart = { body: body, sprite: sprite, ownerId: ownerId };
        state.golfCarts.push(cart);
        return cart;
    };

    Golf.enterCart = function (p, cart) {
        // Prevent entering if someone else is already driving this cart
        if (cart.driver && cart.driver !== p) return;

        p.driving = cart;
        cart.driver = p; // Mark cart as occupied by this player

        p.sprite.setVisible(false); // Hide sprite to prevent jitter/ghosting
        p.sprite.setAlpha(0);
        p.savedMask = p.body.collisionFilter.mask;
        p.body.collisionFilter.mask = 0;
        p.body.isSensor = true;
        if (!p.isAI) state.game.scene.scenes[0].speedometer.classList.remove('hidden');
    };

    Golf.exitCart = function (p) {
        var cart = p.driving;
        if (cart) cart.driver = null; // Release occupancy
        p.driving = null;
        p.sprite.setVisible(true); // Show sprite again
        p.sprite.setAlpha(1);
        if (p.savedMask !== undefined) p.body.collisionFilter.mask = p.savedMask;
        p.body.isSensor = false;
        if (!p.isAI) state.game.scene.scenes[0].speedometer.classList.add('hidden');

        // Exit to the left side (PI offset from physics angle 0)
        var exitAngle = cart.body.angle + Math.PI;
        state.game.scene.scenes[0].matter.body.setPosition(p.body, {
            x: cart.body.position.x + Math.cos(exitAngle) * 60,
            y: cart.body.position.y + Math.sin(exitAngle) * 60
        });
    };

    Golf.handleDriving = function (scene, p, overrideKeys, delta) {
        var cart = p.driving;
        var keys = overrideKeys || {
            W: scene.keys.W.isDown,
            A: scene.keys.A.isDown,
            S: scene.keys.S.isDown,
            D: scene.keys.D.isDown,
            SHIFT: scene.keys.SHIFT.isDown
        };

        // Normalize based on 60 FPS
        var dt = delta || 16.666;
        if (dt > 100) dt = 100;
        var speedScale = dt / 16.666;

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

        var grip = 0.7 * terrainGripMult; // Reduce lateral sliding (increased from 0.5 for sharper turns)

        scene.matter.body.setVelocity(cart.body, {
            x: curVel.x - latVel * lx * grip,
            y: curVel.y - latVel * ly * grip
        });

        var isTurbo = keys.SHIFT;

        if (!p.turboRamp) p.turboRamp = 0;
        // Scale turbo ramp by delta time (0.016 per 16.666ms frame = 0.001 per ms)
        if (isTurbo && keys.W) {
            p.turboRamp = Math.min(1, p.turboRamp + 0.001 * dt);
        } else if (!isTurbo) {
            p.turboRamp = Math.max(0, p.turboRamp - 0.002 * dt);
        }

        var baseMax = 9 * terrainSpeedMult; // Increased from 7
        var turboBoost = 3.0 * terrainSpeedMult;
        var currentMax = baseMax + turboBoost * p.turboRamp;

        var baseForce = 0.25 * terrainSpeedMult; // Increased from 0.2
        var turboForceBoost = 0.008 * terrainSpeedMult;
        var force = (baseForce + turboForceBoost * p.turboRamp) * speedScale;

        var torque = 3.5 * speedScale; // Increased from 2 for faster rotation
        // Offset forward direction by -45 degrees for isometric alignment
        var angle = cart.body.angle - Math.PI / 2;

        // Elevation Climbing Restriction: Max climb is 5
        var currentElevation = Golf.getElevationAt(cart.body.position.x, cart.body.position.y);
        var checkDist = 45; // Look ahead/back slightly

        var aheadX = cart.body.position.x + Math.cos(angle) * checkDist;
        var aheadY = cart.body.position.y + Math.sin(angle) * checkDist;
        var aheadElev = Golf.getElevationAt(aheadX, aheadY);
        var isSteepAhead = (aheadElev - currentElevation) > 5;

        var backX = cart.body.position.x - Math.cos(angle) * checkDist;
        var backY = cart.body.position.y - Math.sin(angle) * checkDist;
        var backElev = Golf.getElevationAt(backX, backY);
        var isSteepBack = (backElev - currentElevation) > 5;

        // Helper for crash effect
        var triggerCrash = function () {
            var now = scene.time.now;
            if (!p.lastCrashTime || now - p.lastCrashTime > 1000) {
                p.lastCrashTime = now;
                if (Golf.state.particles) {
                    Golf.state.particles.emitParticleAt(cart.body.position.x, cart.body.position.y, 15);
                }
                scene.cameras.main.shake(200, 0.003);
            }
            // Hard stop and bounce back
            var vx = cart.body.velocity.x;
            var vy = cart.body.velocity.y;
            scene.matter.body.setVelocity(cart.body, { x: -vx * 0.5, y: -vy * 0.5 });
        };

        // Check if moving into a steep slope regardless of keys (glitch prevention)
        var velocity = Math.sqrt(cart.body.velocity.x * cart.body.velocity.x + cart.body.velocity.y * cart.body.velocity.y);
        if (velocity > 1.0) {
            // Determine if velocity is pointing towards the steep slope
            var velAngle = Math.atan2(cart.body.velocity.y, cart.body.velocity.x);
            var angleDiffAhead = Math.abs(Phaser.Math.Angle.ShortestBetween(velAngle * 180 / Math.PI, angle * 180 / Math.PI));
            var angleDiffBack = Math.abs(Phaser.Math.Angle.ShortestBetween(velAngle * 180 / Math.PI, (angle + Math.PI) * 180 / Math.PI));

            if (isSteepAhead && angleDiffAhead < 60) {
                triggerCrash();
            } else if (isSteepBack && angleDiffBack < 60) {
                triggerCrash();
            }
        }

        if (keys.W) {
            if (!isSteepAhead) {
                scene.matter.body.applyForce(cart.body, cart.body.position, {
                    x: Math.cos(angle) * force,
                    y: Math.sin(angle) * force
                });
            } else {
                triggerCrash();
            }
        }
        if (keys.S) {
            if (!isSteepBack) {
                scene.matter.body.applyForce(cart.body, cart.body.position, {
                    x: -Math.cos(angle) * (force * 0.6),
                    y: -Math.sin(angle) * (force * 0.6)
                });
            } else {
                triggerCrash();
            }
        }

        velocity = Math.sqrt(cart.body.velocity.x * cart.body.velocity.x + cart.body.velocity.y * cart.body.velocity.y);
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

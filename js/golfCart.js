(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;
    var CAT_BUILDING = Golf.CAT_BUILDING;
    var CAT_PLAYER = Golf.CAT_PLAYER;
    var CAT_BALL = Golf.CAT_BALL;
    var CAT_DEFAULT = Golf.CAT_DEFAULT;
    var CAT_CAR = Golf.CAT_CAR;

    Golf.createGolfCart = function (scene, x, y) {
        var body = scene.matter.add.rectangle(x, y, 60, 100, {
            chamfer: { radius: 10 },
            friction: 0.01,
            frictionAir: 0.01,
            restitution: 0.2,
            density: 0.01,
            label: 'cart',
            collisionFilter: {
                category: CAT_CAR,
                mask: CAT_BUILDING | CAT_PLAYER | CAT_BALL | CAT_DEFAULT | CAT_CAR
            }
        });

        var sprite = scene.add.container(x, y);
        var base = scene.add.rectangle(0, 0, 60, 100, 0xf1c40f).setStrokeStyle(4, 0x000000);
        var roof = scene.add.rectangle(0, -10, 56, 70, 0xffffff, 0.8).setStrokeStyle(2, 0x000000);
        var seat = scene.add.rectangle(0, 25, 50, 20, 0x34495e);
        var wheel1 = scene.add.rectangle(-32, -35, 12, 24, 0x2c3e50);
        var wheel2 = scene.add.rectangle(32, -35, 12, 24, 0x2c3e50);
        var wheel3 = scene.add.rectangle(-32, 35, 12, 24, 0x2c3e50);
        var wheel4 = scene.add.rectangle(32, 35, 12, 24, 0x2c3e50);
        sprite.add([wheel1, wheel2, wheel3, wheel4, base, seat, roof]);

        var cart = { body: body, sprite: sprite };
        state.golfCarts.push(cart);
        return cart;
    };

    Golf.enterCart = function (p, cart) {
        p.driving = cart;
        p.sprite.setAlpha(0.7);
        p.ballSprite.setAlpha(0);
        if (!p.isAI) state.game.scene.scenes[0].speedometer.classList.remove('hidden');
    };

    Golf.exitCart = function (p) {
        var cart = p.driving;
        p.driving = null;
        p.sprite.setAlpha(1);
        p.ballSprite.setAlpha(1);
        if (!p.isAI) state.game.scene.scenes[0].speedometer.classList.add('hidden');
        var exitAngle = cart.body.angle + Math.PI / 2;
        state.game.scene.scenes[0].matter.body.setPosition(p.body, {
            x: cart.body.position.x + Math.cos(exitAngle) * 60,
            y: cart.body.position.y + Math.sin(exitAngle) * 60
        });
    };

    Golf.handleDriving = function (scene, p) {
        var cart = p.driving;
        var isTurbo = scene.keys.SHIFT.isDown;

        if (!p.turboRamp) p.turboRamp = 0;
        if (isTurbo && scene.keys.W.isDown) {
            p.turboRamp = Math.min(1, p.turboRamp + 0.016);
        } else if (!isTurbo) {
            p.turboRamp = Math.max(0, p.turboRamp - 0.032);
        }

        var baseMax = 6;
        var turboBoost = 1.5;
        var currentMax = baseMax + turboBoost * p.turboRamp;

        var baseForce = 0.012;
        var turboForceBoost = 0.008;
        var force = baseForce + turboForceBoost * p.turboRamp;

        var torque = 1.6;
        var angle = cart.body.angle - Math.PI / 2;

        if (scene.keys.W.isDown) {
            scene.matter.body.applyForce(cart.body, cart.body.position, {
                x: Math.cos(angle) * force,
                y: Math.sin(angle) * force
            });
        }
        if (scene.keys.S.isDown) {
            scene.matter.body.applyForce(cart.body, cart.body.position, {
                x: -Math.cos(angle) * (force * 0.3),
                y: -Math.sin(angle) * (force * 0.3)
            });
        }

        var velocity = Math.sqrt(cart.body.velocity.x * cart.body.velocity.x + cart.body.velocity.y * cart.body.velocity.y);
        if (velocity > 0.5) {
            var turnDir = scene.keys.S.isDown ? -1 : 1;
            if (scene.keys.A.isDown) cart.body.torque = -torque * turnDir;
            if (scene.keys.D.isDown) cart.body.torque = torque * turnDir;
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

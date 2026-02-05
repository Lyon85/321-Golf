(function (global) {
    var Golf = global.Golf;

    Golf.handlePlayerMovement = function (scene, p, overrideKeys) {
        var keys = overrideKeys || {
            W: scene.keys.W.isDown,
            A: scene.keys.A.isDown,
            S: scene.keys.S.isDown,
            D: scene.keys.D.isDown
        };

        var force = 0.004;
        var speedCap = 3.5;

        if (p.isAiming) {
            force *= 0.25;
            speedCap *= 0.35;
        } else if (p.state === Golf.PLAYER_STATES.SWIMMING) {
            force *= 0.4;
            speedCap *= 0.6;
        }

        var anyMove = keys.W || keys.S || keys.A || keys.D;

        if (anyMove) {
            p.state = Golf.PLAYER_STATES.WALKING;
            // Determine 8-way direction
            if (keys.W && keys.D) p.direction = Golf.DIRECTIONS.NE;
            else if (keys.W && keys.A) p.direction = Golf.DIRECTIONS.NW;
            else if (keys.S && keys.D) p.direction = Golf.DIRECTIONS.SE;
            else if (keys.S && keys.A) p.direction = Golf.DIRECTIONS.SW;
            else if (keys.W) p.direction = Golf.DIRECTIONS.N;
            else if (keys.S) p.direction = Golf.DIRECTIONS.S;
            else if (keys.A) p.direction = Golf.DIRECTIONS.W;
            else if (keys.D) p.direction = Golf.DIRECTIONS.E;
        } else if (p.state !== Golf.PLAYER_STATES.SWINGING) {
            p.state = Golf.PLAYER_STATES.IDLE;
        }

        if (p.isAiming && !anyMove) {
            scene.matter.body.setVelocity(p.body, { x: 0, y: 0 });
        } else {
            if (keys.W)
                scene.matter.body.applyForce(p.body, p.body.position, { x: 0, y: -force });
            if (keys.S)
                scene.matter.body.applyForce(p.body, p.body.position, { x: 0, y: force });
            if (keys.A)
                scene.matter.body.applyForce(p.body, p.body.position, { x: -force, y: 0 });
            if (keys.D)
                scene.matter.body.applyForce(p.body, p.body.position, { x: force, y: 0 });

            var speed = Math.sqrt(p.body.velocity.x * p.body.velocity.x + p.body.velocity.y * p.body.velocity.y);
            if (speed > speedCap) {
                var ratio = speedCap / speed;
                scene.matter.body.setVelocity(p.body, {
                    x: p.body.velocity.x * ratio,
                    y: p.body.velocity.y * ratio
                });
            }
        }
    };
})(typeof window !== 'undefined' ? window : this);

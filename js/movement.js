(function (global) {
    var Golf = global.Golf;

    /**
     * Handles player movement using Matter.js.
     * NOTE:
     * Matter.js runs on a fixed timestep, so velocity must NOT be delta-scaled.
     * Velocity values are applied per physics step and are refresh-rate independent.
     */
    Golf.handlePlayerMovement = function (scene, p, overrideKeys) {
        var keys = overrideKeys || {
            W: scene.keys.W.isDown,
            A: scene.keys.A.isDown,
            S: scene.keys.S.isDown,
            D: scene.keys.D.isDown
        };

        // Base movement speed (physics units per step)
        var speedCap = 4;

        if (p.isAiming) {
            speedCap *= 0.35;
        } else if (p.state === Golf.PLAYER_STATES.SWIMMING) {
            speedCap *= 0.6;
        }

        var anyMove = keys.W || keys.S || keys.A || keys.D;

        // State + direction handling
        if (anyMove) {
            p.state = Golf.PLAYER_STATES.WALKING;

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

        // If aiming and not moving, stop completely
        if (p.isAiming && !anyMove) {
            scene.matter.body.setVelocity(p.body, { x: 0, y: 0 });
            p.body.frictionAir = (p.body.baseFrictionAir !== undefined)
                ? p.body.baseFrictionAir
                : 0.01;
            return;
        }

        // Disable air friction while moving so setVelocity is not damped
        if (anyMove) {
            p.body.frictionAir = 0;
        } else {
            p.body.frictionAir = (p.body.baseFrictionAir !== undefined)
                ? p.body.baseFrictionAir
                : 0.01;
        }

        // Build movement vector
        var moveX = (keys.D ? 1 : 0) - (keys.A ? 1 : 0);
        var moveY = (keys.S ? 1 : 0) - (keys.W ? 1 : 0);

        // Normalize diagonal movement
        var len = Math.hypot(moveX, moveY);
        if (len > 0) {
            moveX /= len;
            moveY /= len;
        }

        // Apply velocity directly (refresh-rate independent)
        scene.matter.body.setVelocity(p.body, {
            x: moveX * speedCap,
            y: moveY * speedCap
        });
    };

})(typeof window !== 'undefined' ? window : this);

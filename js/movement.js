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
            D: scene.keys.D.isDown,
            SPACE: scene.keys.SPACE.isDown
        };

        // Base movement speed (physics units per step)
        var speedCap = 4;

        if (p.isAiming) {
            speedCap *= 0.35;
        } else if (p.state === Golf.PLAYER_STATES.SWIMMING) {
            speedCap *= 0.6;
        }

        // Apply terrain slowing (e.g. wading in w1)
        if (p.body.currentTerrainType && p.body.currentTerrainType.playerSpeedMult) {
            speedCap *= p.body.currentTerrainType.playerSpeedMult;
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

        // --- Jump Physics ---
        var JUMP_FORCE = 7;
        var GRAVITY = 0.5;

        // Jump Input
        if (keys.SPACE && p.z <= 0) {
            p.vz = JUMP_FORCE;
        }

        // Apply Gravity
        if (p.z > 0 || p.vz !== 0) {
            p.vz -= GRAVITY;
            p.z += p.vz;

            if (p.z < 0) {
                p.z = 0;
                p.vz = 0;
            }
        }
    };

    /**
     * Orchestrates human input (Movement + Aiming).
     */
    Golf.handleHumanInput = function (scene, p, delta) {
        if (p.driving) {
            // Updated to actually call driving logic
            if (Golf.handleDriving) {
                Golf.handleDriving(scene, p, null, delta);
            }
            return;
        }
        Golf.handlePlayerMovement(scene, p);
        if (Golf.handleAiming) {
            Golf.handleAiming(scene, p);
        }
    };

})(typeof window !== 'undefined' ? window : this);

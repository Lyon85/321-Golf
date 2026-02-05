(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;
    var CAT_TERRAIN = Golf.CAT_TERRAIN;
    var CAT_PLAYER = Golf.CAT_PLAYER;
    var CAT_BALL = Golf.CAT_BALL;
    var TERRAIN_TYPES = Golf.TERRAIN_TYPES;

    /**
     * Parses the manual map data and creates visuals/sensors.
     */
    Golf.loadMap = function (scene) {
        var config = Golf.MAP_CONFIG;
        var tokens = Golf.MAP_DATA.replace(/\s+/g, '').split(',');

        state.mapGrid = [];
        state.spawnPoint = { x: config.tileSize / 2, y: config.tileSize / 2 };
        var worldGroup = scene.add.container(0, 0).setDepth(-11);

        for (var r = 0; r < config.rows; r++) {
            state.mapGrid[r] = [];
            for (var c = 0; c < config.cols; c++) {
                var token = tokens[r * config.cols + c] || 'g';
                var x = c * config.tileSize + config.tileSize / 2;
                var y = r * config.tileSize + config.tileSize / 2;

                var tileInfo = { type: 'grass', angle: null };
                var color = 0x2ecc71; // Default Grass

                if (token === 'w') {
                    tileInfo.type = 'water';
                    color = 0x3498db;
                    // Add water sensor
                    scene.matter.add.rectangle(x, y, config.tileSize, config.tileSize, {
                        isStatic: true, isSensor: true, label: 'water',
                        collisionFilter: { category: CAT_TERRAIN }
                    });
                } else if (token === 'r') {
                    tileInfo.type = 'rough';
                    color = 0x27ae60;
                } else if (token === 'b') {
                    tileInfo.type = 'sand';
                    color = 0xf1c40f;
                } else if (token === 's') {
                    tileInfo.type = 'spawn';
                    color = 0x2ecc71; // Keep grass color
                    state.spawnPoint = { x: x, y: y };
                    console.log("Spawn point set at: " + x + ", " + y);
                } else if (token.startsWith('i')) {
                    tileInfo.type = 'incline';
                    tileInfo.angle = parseInt(token.substring(1));
                    color = 0x8bc34a; // Lighter green for hills
                }

                var rect = scene.add.rectangle(x, y, config.tileSize, config.tileSize, color)
                    .setStrokeStyle(2, 0x000000, 0.3) // Thinner outline
                    .setDepth(-11);
                worldGroup.add(rect);

                // Add tile label
                var label = scene.add.text(x, y, token, {
                    family: 'monospace',
                    fontSize: '12px',
                    color: '#000000',
                    align: 'center'
                }).setOrigin(0.5, 1.5).setAlpha(0.6).setDepth(-10); // Offset label upwards
                worldGroup.add(label);

                // Add directional arrow for inclines
                if (tileInfo.type === 'incline' && tileInfo.angle !== null) {
                    var arrow = scene.add.text(x, y, '→', {
                        family: 'monospace',
                        fontSize: '24px',
                        color: '#000000',
                        fontStyle: '900'
                    }).setOrigin(0.5).setAngle(tileInfo.angle).setAlpha(0.7).setDepth(-10);
                    worldGroup.add(arrow);
                }

                state.mapGrid[r][c] = tileInfo;
            }
        }
    };

    /**
     * Returns a force vector based on the incline at (x, y).
     */
    Golf.getSlopeAt = function (x, y) {
        var config = Golf.MAP_CONFIG;
        var c = Math.floor(x / config.tileSize);
        var r = Math.floor(y / config.tileSize);

        if (state.mapGrid && state.mapGrid[r] && state.mapGrid[r][c]) {
            var tile = state.mapGrid[r][c];
            if (tile.type === 'incline' && tile.angle !== null) {
                var rad = Phaser.Math.DegToRad(tile.angle);
                return {
                    x: Math.cos(rad) * Golf.SLOPE_FORCE_MULT,
                    y: Math.sin(rad) * Golf.SLOPE_FORCE_MULT
                };
            }
        }
        return { x: 0, y: 0 };
    };



    /**
     * Returns the friction air value based on the terrain at (x, y).
     */
    Golf.getFrictionAt = function (x, y) {
        var config = Golf.MAP_CONFIG;
        var c = Math.floor(x / config.tileSize);
        var r = Math.floor(y / config.tileSize);

        if (state.mapGrid && state.mapGrid[r] && state.mapGrid[r][c]) {
            var tile = state.mapGrid[r][c];
            var typeKey = tile.type.toUpperCase();
            if (TERRAIN_TYPES[typeKey]) {
                return TERRAIN_TYPES[typeKey].frictionAir;
            }
        }
        return 0.015; // Default grass friction
    };

    /**
     * Returns the full tile info at (x, y).
     */
    Golf.getTileAt = function (x, y) {
        var config = Golf.MAP_CONFIG;
        var c = Math.floor(x / config.tileSize);
        var r = Math.floor(y / config.tileSize);

        if (state.mapGrid && state.mapGrid[r] && state.mapGrid[r][c]) {
            return state.mapGrid[r][c];
        }
        return { type: 'grass' };
    };


    function generateTerrainTextures(scene) {
        // Obsolete
    }

    Golf.createTerrains = function (scene) {
        // Load Manual Map
        Golf.loadMap(scene);

        // Setup Collision Listeners for Water Hazard
        scene.matter.world.on('collisionstart', function (event) {
            event.pairs.forEach(function (pair) {
                var bodyA = pair.bodyA;
                var bodyB = pair.bodyB;

                var terrainBody = bodyA.label === 'water' ? bodyA : (bodyB.label === 'water' ? bodyB : null);
                var otherBody = terrainBody === bodyA ? bodyB : bodyA;

                if (terrainBody && (otherBody.label === 'player' || otherBody.label === 'ball')) {
                    applyTerrainEffect(scene, otherBody, terrainBody.label);
                }
            });
        });

        scene.matter.world.on('collisionend', function (event) {
            event.pairs.forEach(function (pair) {
                var bodyA = pair.bodyA;
                var bodyB = pair.bodyB;

                var terrainBody = bodyA.label === 'water' ? bodyA : (bodyB.label === 'water' ? bodyB : null);
                var otherBody = terrainBody === bodyA ? bodyB : bodyA;

                if (terrainBody && (otherBody.label === 'player' || otherBody.label === 'ball')) {
                    removeTerrainEffect(scene, otherBody);
                }
            });
        });
    };

    function applyTerrainEffect(scene, body, terrainLabel) {
        // Find the player or vehicle associated with this body
        var player = state.players.find(function (p) { return p.ball === body || p.body === body; });
        var target = player; // Default to player/ball owner

        if (body.label === 'ball') {
            // Save base friction if not set
            if (body.baseFrictionAir === undefined) {
                body.baseFrictionAir = body.frictionAir;
            }

            if (terrainLabel === 'water' && player && player.ballHeight < 1) {
                handleWaterHazard(scene, body);
            }
        } else if (body.label === 'player' && terrainLabel === 'water' && player) {
            player.state = Golf.PLAYER_STATES.SWIMMING;
        }
    }

    function removeTerrainEffect(scene, body) {
        if (body.baseFrictionAir !== undefined) {
            body.frictionAir = body.baseFrictionAir;
        }

        var player = state.players.find(function (p) { return p.ball === body || p.body === body; });
        if (player && player.state === Golf.PLAYER_STATES.SWIMMING) {
            player.state = Golf.PLAYER_STATES.IDLE;
        }

        body.currentTerrainType = null;
    }

    function handleWaterHazard(scene, ballBody) {
        // Find the player object for this ball
        var player = state.players.find(function (p) { return p.ball === ballBody; });
        if (!player) return;

        // Visual feedback
        state.particles.emitParticleAt(ballBody.position.x, ballBody.position.y, 20);
        scene.cameras.main.shake(300, 0.005);

        var splashText = scene.add.text(ballBody.position.x, ballBody.position.y - 40, 'SPLASH!', {
            family: 'Outfit',
            fontSize: '32px',
            fontStyle: '900',
            color: '#3498db',
            stroke: '#ffffff',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(100);

        scene.tweens.add({
            targets: splashText,
            y: ballBody.position.y - 120,
            alpha: 0,
            duration: 1500,
            onComplete: function () { splashText.destroy(); }
        });

        // Penalize: Reset to last safe position after a short delay
        scene.time.delayedCall(800, function () {
            if (player.lastSafePos) {
                scene.matter.body.setPosition(ballBody, { x: player.lastSafePos.x, y: player.lastSafePos.y });
                scene.matter.body.setVelocity(ballBody, { x: 0, y: 0 });
            }
        });
    }

})(typeof window !== 'undefined' ? window : this);

(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;
    var CAT_TERRAIN = Golf.CAT_TERRAIN;
    var CAT_PLAYER = Golf.CAT_PLAYER;
    var CAT_BALL = Golf.CAT_BALL;
    var TERRAIN_TYPES = Golf.TERRAIN_TYPES;


    /**
     * Parses the manual map data and creates sensors.
     */
    Golf.loadMap = function (scene) {
        var config = Golf.MAP_CONFIG;
        if (typeof Golf.MAP_DATA !== 'string' || Golf.MAP_DATA.length === 0) {
            console.warn('[Terrain] MAP_DATA not ready. Retrying parse in 500ms...');
            scene.time.delayedCall(500, function () {
                Golf.loadMap(scene);
            });
            return;
        }
        // Split by comma BUT only if not inside brackets
        var tokens = Golf.MAP_DATA.replace(/\s+/g, '').split(/,(?![^\[]*\])/);

        state.mapGrid = [];
        state.spawnPoint = { x: config.tileSize / 2, y: config.tileSize / 2 };

        // worldGroup is still used to hold dynamic elements if needed, 
        // but pool objects will be added to it during init.
        if (!state.worldGroup) {
            state.worldGroup = scene.add.container(0, 0).setDepth(-11);
        }

        state.teePositions = []; // Reset tee positions

        for (var r = 0; r < config.rows; r++) {
            state.mapGrid[r] = [];
            for (var c = 0; c < config.cols; c++) {
                var rawToken = tokens[r * config.cols + c] || 'g';
                var x = c * config.tileSize + config.tileSize / 2;
                var y = r * config.tileSize + config.tileSize / 2;

                // Parse Modifier Format: g1[h], g2[t], g3[i90] (terrain + optional [modifiers])
                var match = rawToken.match(/^([a-zA-Z0-9]+)(?:\[(.*?)\])?$/);
                var token = match ? match[1] : rawToken; // Base terrain token (w1, g2, etc.)
                var modifiers = match && match[2] ? match[2].split(',') : [];

                // Parser for incline (i) and direction (d) modifiers
                var inclineMod = null;
                var directionMod = null;

                for (var m = 0; m < modifiers.length; m++) {
                    var mStr = modifiers[m];
                    var im = mStr.match(/^i(-?\d+)$/);
                    if (im) {
                        inclineMod = parseInt(im[1], 10);
                        continue;
                    }
                    var dm = mStr.match(/^d(-?\d+)$/);
                    if (dm) {
                        directionMod = parseInt(dm[1], 10);
                        continue;
                    }
                }

                var tileInfo = {
                    type: 'grass',
                    direction: directionMod,
                    incline: (inclineMod !== null) ? inclineMod : 0,
                    token: rawToken,
                    baseToken: token,
                    isTee: false
                };



                // Base Type Logic (terrain only; modifiers already set hole/tee)
                if (!tileInfo.type || tileInfo.type === 'grass') {
                    if (token.startsWith('w')) {
                        tileInfo.type = token === 'w1' ? 'water1' : (token === 'w2' ? 'water2' : (token === 'w3' ? 'water3' : 'water'));

                        // Always a sensor for terrain effects (swimming, slowing)
                        scene.matter.add.rectangle(x, y, config.tileSize, config.tileSize, {
                            isStatic: true, isSensor: true, label: tileInfo.type,
                            collisionFilter: { category: CAT_TERRAIN }
                        });

                        // Solid blocker for buggies in w2/w3
                        if (token === 'w2' || token === 'w3') {
                            scene.matter.add.rectangle(x, y, config.tileSize, config.tileSize, {
                                isStatic: true, label: tileInfo.type + '_solid',
                                collisionFilter: { category: Golf.CAT_DEEP_WATER }
                            });
                        }
                    } else if (token.startsWith('g')) {
                        tileInfo.type = 'grass';
                    } else if (token.startsWith('b')) {
                        tileInfo.type = 'bunker';   // ✅ set type for friction
                    } else if (token === 'r') {
                        tileInfo.type = 'rough';
                    } else if (token.startsWith('m')) {
                        tileInfo.type = 'mountain';
                        scene.matter.add.rectangle(x, y, config.tileSize, config.tileSize, {
                            isStatic: true, isSensor: true, label: 'mountain',
                            collisionFilter: { category: CAT_TERRAIN }
                        });
                    } else if (token === 't') {
                        tileInfo.type = 'grass';
                    } else if (token === 'h') {
                        tileInfo.type = 'hole_position';
                        if (!state.holePositions) state.holePositions = [];
                        state.holePositions.push({ x: x, y: y, row: r, col: c });
                    } else if (token.startsWith('i') && !inclineMod) {
                        tileInfo.type = 'incline';
                        tileInfo.angle = parseInt(token.substring(1), 10);
                    }
                }

                // Modifier: [t] = tee spawn
                if (modifiers.indexOf('t') !== -1 || token === 't') {
                    tileInfo.isTee = true;
                    state.teePositions.push({ x: x, y: y });
                }

                // Modifier: [h] = hole spawn
                if (modifiers.indexOf('h') !== -1 || token === 'h') {
                    tileInfo.type = 'hole_position';
                    if (!state.holePositions) state.holePositions = [];
                    state.holePositions.push({ x: x, y: y, row: r, col: c });
                }

                if (directionMod !== null) {
                    tileInfo.type = 'incline';
                    tileInfo.direction = directionMod;
                } else if (inclineMod !== null) {
                    // Backward compatibility: [i90] without [dXX] sets direction (old behavior)
                    tileInfo.type = 'incline';
                    tileInfo.direction = inclineMod;
                    tileInfo.incline = 5; // Default some incline if only angle given
                } else if (token.startsWith('i')) {
                    tileInfo.type = 'incline';
                    tileInfo.direction = parseInt(token.substring(1), 10);
                    tileInfo.incline = 5;
                }

                state.mapGrid[r][c] = tileInfo;
            }
        }
    };

    /**
     * Initializes a pool of tile objects to be reused for rendering the viewport.
     */
    Golf.initTilePool = function (scene) {
        var config = Golf.MAP_CONFIG;
        // Calculate max tiles visible on screen plus a buffer
        var maxTilesX = Math.ceil(scene.cameras.main.width / config.tileSize) + 10;
        var maxTilesY = Math.ceil(scene.cameras.main.height / config.tileSize) + 10;
        var poolSize = maxTilesX * maxTilesY;

        state.tilePool = [];
        for (var i = 0; i < poolSize; i++) {
            // Base rectangle for non-textured tiles
            var rect = scene.add.rectangle(0, 0, config.tileSize, config.tileSize, 0xffffff)
                .setStrokeStyle(0, 0x000000, 0.3)
                .setDepth(-11)
                .setVisible(false);

            // Side rectangle for 3D depth
            var side = scene.add.rectangle(0, 0, config.tileSize, 1, 0x000000)
                .setDepth(-12) // Behind top faces but in front of ground
                .setVisible(false);

            // Debug/Info Labels
            var label = scene.add.text(0, 0, '', {
                family: 'monospace',
                fontSize: '12px',
                color: '#000000',
                align: 'center'
            }).setOrigin(0.5, 1.5).setAlpha(0.6).setDepth(-10).setVisible(false);

            // Slope Arrows
            var arrow = scene.add.text(0, 0, '→', {
                family: 'monospace',
                fontSize: '24px',
                color: '#000000',
                fontStyle: '900'
            }).setOrigin(0.5).setAlpha(0.7).setDepth(-10).setVisible(false);

            // Tee Visuals
            var teeMarker = scene.add.circle(0, 0, 12, 0xff0000).setDepth(-9).setVisible(false);
            var teeInner = scene.add.circle(0, 0, 8, 0xff6b6b).setDepth(-8).setVisible(false);
            var teeText = scene.add.text(0, 0, 'TEE', {
                family: 'monospace',
                fontSize: '12px',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5).setDepth(-7).setVisible(false);

            // 1. Create the single image object for the pool
            // We initialize with g1, but updateMapVisibility will swap it to g2 if needed
            var img = scene.add.image(0, 0, 'grass_g1_texture').setDepth(-11).setVisible(false);

            // 2. Scale the image to perfectly match the tileSize
            // Use setDisplaySize to force the image to match your grid pixels
            img.setDisplaySize(config.tileSize, config.tileSize);

            // 3. Add to pool and worldGroup
            state.tilePool.push({
                rect: rect,
                side: side,
                img: img,
                label: label,
                arrow: arrow,
                tee: { marker: teeMarker, inner: teeInner, text: teeText }
            });

            state.worldGroup.add([rect, side, img, label, arrow, teeMarker, teeInner, teeText]);
        }
        state.poolIdx = 0;
    };
    /**
     * Updates which tiles are visible based on the camera viewport.
     */
    Golf.updateMapVisibility = function (scene) {
        if (!state.mapGrid || !state.tilePool) return;

        var cam = scene.cameras.main;
        var config = Golf.MAP_CONFIG;

        var startCol = Math.max(0, Math.floor(cam.scrollX / config.tileSize));
        var endCol = Math.min(config.cols - 1, Math.ceil((cam.scrollX + cam.width) / config.tileSize));
        var startRow = Math.max(0, Math.floor(cam.scrollY / config.tileSize));
        var endRow = Math.min(config.rows - 1, Math.ceil((cam.scrollY + cam.height) / config.tileSize));

        // Hide all pooled objects first to prevent ghosts
        state.tilePool.forEach(function (p) {
            p.rect.setVisible(false);
            p.side.setVisible(false);
            p.img.setVisible(false); // Make sure the image is reset too
            p.label.setVisible(false);
            p.arrow.setVisible(false);
            p.tee.marker.setVisible(false);
            p.tee.inner.setVisible(false);
            p.tee.text.setVisible(false);
        });

        var poolIdx = 0;
        for (var r = startRow; r <= endRow; r++) {
            for (var c = startCol; c <= endCol; c++) {
                if (poolIdx >= state.tilePool.length) break;

                var tile = state.mapGrid[r][c];
                var poolObj = state.tilePool[poolIdx];
                var x = c * config.tileSize + config.tileSize / 2;
                var y = r * config.tileSize + config.tileSize / 2;

                // Configure base color for non-textured tiles
                var color = 0x2ecc71; // Default Grass
                var baseToken = tile.baseToken != null ? tile.baseToken : tile.token;

                if (baseToken.startsWith('w')) {
                    if (baseToken === 'w1') color = 0x5dade2;
                    else if (baseToken === 'w2') color = 0x3498db;
                    else if (baseToken === 'w3') color = 0x2874a6;
                    else color = 0x3498db;
                } else if (baseToken.startsWith('g')) {
                    if (baseToken === 'g1') color = 0x6BD99A;
                    else if (baseToken === 'g2') color = 0x2ECC71;
                    else if (baseToken === 'g3') color = 0x15964B;
                    else color = 0x2ECC71;
                } else if (baseToken === 'r') {
                    color = 0x27ae60;
                } else if (baseToken.startsWith('b')) {
                    if (baseToken === 'b1') color = 0xFFD62F;
                    else if (baseToken === 'b2') color = 0x2ECC71;
                    else if (baseToken === 'b3') color = 0xD7AC00;
                    else color = 0xFFD62F;
                } else if (baseToken.startsWith('m')) {
                    if (baseToken === 'm1') color = 0xA2B4B5;
                    else if (baseToken === 'm2') color = 0x7f8c8d;
                    else if (baseToken === 'm3') color = 0x627071;
                    else color = 0x7f8c8d;
                }

                var elevation = Golf.getElevationAt(x, y);

                // Apply 3D elevation shift (top Y is actual Y - elevation)
                var topY = y - elevation;

                // --- TEXTURE LOGIC FOR G1 AND G2 ---
                // 1. Define which tokens should use images and what their texture keys are
                var textureMap = {
                    'g1': 'grass_g1_texture',
                    'g2': 'grass_g2_texture',
                    'g3': 'grass_g3_texture',
                    'w1': 'water_w1_texture',
                    'w2': 'water_w2_texture',
                    'w3': 'water_w3_texture',
                    'b': 'bunker_b1_texture',
                    'b2': 'bunker_b2_texture',
                    'b3': 'bunker_b3_texture',
                    'm1': 'mountain_m1_texture',
                    'm2': 'mountain_m2_texture',
                    'm3': 'mountain_m3_texture'
                };

                if (textureMap[baseToken]) {
                    poolObj.rect.setVisible(false);
                    poolObj.img.setTexture(textureMap[baseToken])
                        .setPosition(x, topY)
                        .setDisplaySize(config.tileSize, config.tileSize)
                        .setVisible(true);

                    // --- SINE WAVE SHIMMER FOR WATER ---
                    if (baseToken.startsWith('w')) {
                        // scene.time.now is a millisecond counter
                        // Dividing by 500 controls the speed (higher = slower)
                        // Adding (r + c) offsets the wave so tiles don't flash all at once
                        var wave = Math.sin((scene.time.now / 600) + (r + c) * 0.5);

                        // Map the wave (-1 to 1) to a brightness range (0.7 to 1.0)
                        var brightness = Phaser.Math.Linear(0.7, 1.0, (wave + 1) / 2);

                        // Create a color tint (RGB). We keep Blue high and vary Red/Green.
                        // This creates a "sparkle" effect
                        var colorValue = Math.floor(255 * brightness);
                        poolObj.img.setTint(Phaser.Display.Color.GetColor(colorValue, colorValue, 255));
                    } else {
                        // Clear tint for grass/other tiles so they don't look blue
                        poolObj.img.clearTint();
                    }
                } else {
                    poolObj.img.setVisible(false);
                    poolObj.rect.setPosition(x, topY).setFillStyle(color).setVisible(true);
                }

                // Render side faces for 3D depth
                if (elevation !== 0) {
                    var sideColor = Phaser.Display.Color.ValueToColor(color).darken(30).color;
                    var sideHeight = Math.abs(elevation);
                    var sideY = (elevation > 0) ? (topY + config.tileSize / 2 + sideHeight / 2) : (topY - config.tileSize / 2 - sideHeight / 2);

                    if (elevation < 0) {
                        // For recessed blocks like water/bunker, the side is the "wall" from ground down to the top face
                        sideY = topY - config.tileSize / 2 - sideHeight / 2;
                        // Actually, if it's recessed, we draw the side ABOVE the top face to ground level (y - tile/2)
                        var groundY = y - config.tileSize / 2;
                        var faceTopEdge = topY - config.tileSize / 2;
                        sideHeight = Math.abs(faceTopEdge - groundY);
                        sideY = groundY + sideHeight / 2;
                    } else {
                        // For raised blocks, the side is from the top face down to ground level
                        var groundY = y + config.tileSize / 2;
                        var faceBottomEdge = topY + config.tileSize / 2;
                        sideHeight = Math.abs(faceBottomEdge - groundY);
                        sideY = groundY - sideHeight / 2;
                    }

                    poolObj.side.setPosition(x, sideY)
                        .setSize(config.tileSize, sideHeight)
                        .setFillStyle(sideColor)
                        .setVisible(true);
                } else {
                    poolObj.side.setVisible(false);
                }

                // --- LABELS AND ARROWS ---
                var labelText = tile.baseToken;
                var isRightDown = scene.input.activePointer.rightButtonDown();

                if (tile.direction !== null) {
                    if (isRightDown) {
                        var phaserAngle = tile.direction - 90;
                        var alpha = Phaser.Math.Clamp(0.3 + (tile.incline / 45), 0.3, 1);
                        var scale = Phaser.Math.Clamp(1 + (tile.incline / 15), 1, 3);
                        poolObj.arrow.setPosition(x, y)
                            .setAngle(phaserAngle)
                            .setAlpha(alpha)
                            .setScale(scale)
                            .setVisible(true);
                    } else {
                        poolObj.arrow.setVisible(false);
                    }
                    labelText += "\n" + tile.incline + "°";
                }

                poolObj.label.setPosition(x, y).setText(labelText).setVisible(isRightDown);

                if (tile.isTee) {
                    poolObj.tee.marker.setPosition(x, y).setVisible(true);
                    poolObj.tee.inner.setPosition(x, y).setVisible(true);
                    poolObj.tee.text.setPosition(x, y).setVisible(true);
                }

                poolIdx++;
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

            if (tile.type === 'incline' && tile.direction !== null) {
                var inclineDeg = tile.incline || 0;

                if (inclineDeg === 0) return { x: 0, y: 0 };

                // Compass 0=N, 90=E etc → Phaser conversion
                var rad = Phaser.Math.DegToRad(tile.direction - 90);

                // Realistic gravity component: sin(angle)
                var forceMag =
                    Golf.SLOPE_FORCE_MULT *
                    Math.sin(Phaser.Math.DegToRad(inclineDeg));

                return {
                    x: Math.cos(rad) * forceMag,
                    y: Math.sin(rad) * forceMag
                };
            }
        }

        return { x: 0, y: 0 };
    };


    Golf.applySlopePhysics = function (scene, ball) {

        if (!ball || !ball.body) return;

        var body = ball.body;

        // Determine terrain under the ball (for sand/bunker behavior etc.)
        var tile = Golf.getTileAt(ball.x, ball.y);
        var isBunker = tile && tile.type === 'bunker';

        // Get slope force at ball position
        var slope = Golf.getSlopeAt(ball.x, ball.y);

        var vx = body.velocity.x;
        var vy = body.velocity.y;
        var speed = Math.sqrt(vx * vx + vy * vy);

        // In bunkers, aggressively squash velocity every frame so the ball
        // loses almost all of its momentum as soon as it hits the sand.
        if (isBunker && speed > 0.4) {
            var damp = 0.18; // keep only ~18% of current speed
            scene.matter.body.setVelocity(body, { x: vx * damp, y: vy * damp });
            vx = body.velocity.x;
            vy = body.velocity.y;
            speed = Math.sqrt(vx * vx + vy * vy);
        }

        var slopeForceMag = Math.sqrt(slope.x * slope.x + slope.y * slope.y);

        // --- STATIC FRICTION SIMULATION ---
        // In bunkers we want the ball to come to rest much more aggressively,
        // so we use a higher effective "static" threshold there.
        var staticSpeedThreshold = Golf.STATIC_SPEED_THRESHOLD;
        if (isBunker) {
            staticSpeedThreshold = 0.8;
        }

        if (
            speed < staticSpeedThreshold &&
            slopeForceMag < Golf.STATIC_FORCE_THRESHOLD
        ) {
            // Snap to rest
            scene.matter.body.setVelocity(body, { x: 0, y: 0 });
            body.force.x = 0;
            body.force.y = 0;
            return;
        }

        // --- LOW SPEED EXTRA ROLLING RESISTANCE ---
        // For bunkers, always use the dedicated (very high) friction so the ball
        // virtually stops as soon as it touches sand.
        if (!isBunker && speed < 0.25) {
            body.frictionAir = Golf.LOW_SPEED_FRICTION;
        } else {
            var baseFriction = Golf.getFrictionAt(ball.x, ball.y);
            body.frictionAir = isBunker ? baseFriction * 3 : baseFriction;
        }

        // --- APPLY DOWNHILL FORCE ---
        scene.matter.body.applyForce(body, body.position, slope);
    };


    /**
     * Spawns a hole at a random predetermined position.
     * Call this at game start and after each successful putt.
     */
    Golf.spawnRandomHole = function (scene) {
        // Remove existing hole if any
        if (state.currentHole) {
            if (state.currentHole.circle) state.currentHole.circle.destroy();
            if (state.currentHole.inner) state.currentHole.inner.destroy();
            if (state.currentHole.flagPole) state.currentHole.flagPole.destroy();
            if (state.currentHole.flag) state.currentHole.flag.destroy();
            state.currentHole = null;
        }

        // Select a random hole position
        if (!state.holePositions || state.holePositions.length === 0) {
            console.warn('No hole positions defined in map!');
            return;
        }

        var randomIndex = Phaser.Math.Between(0, state.holePositions.length - 1);
        var holePos = state.holePositions[randomIndex];

        console.log('Spawning hole at position:', holePos);

        // Create hole visual
        var holeCircle = scene.add.circle(holePos.x, holePos.y, 4, 0x000000).setDepth(-9);
        var holeInner = scene.add.circle(holePos.x, holePos.y, 2.5, 0x1a1a1a).setDepth(-8);
        var flagPole = scene.add.line(holePos.x, holePos.y, 0, 0, 0, -30, 0x8b4513, 2).setOrigin(0, 0).setDepth(-7);
        var flag = scene.add.triangle(holePos.x, holePos.y - 30, 0, 0, 15, -8, 0, -16, 0xff0000).setDepth(-7);

        // Store current hole reference
        state.currentHole = {
            x: holePos.x,
            y: holePos.y,
            circle: holeCircle,
            inner: holeInner,
            flagPole: flagPole,
            flag: flag,
            index: randomIndex
        };

        // Update UI if available
        if (scene.holeDisplay) {
            scene.holeDisplay.textContent = 'Hole: ' + (randomIndex + 1);
        }
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
        return 0.01; // Default grass friction
    };

    /**
     * Returns the elevation at (x, y).
     */
    Golf.getElevationAt = function (x, y) {
        var config = Golf.MAP_CONFIG;
        var c = Math.floor(x / config.tileSize);
        var r = Math.floor(y / config.tileSize);

        if (state.mapGrid && state.mapGrid[r] && state.mapGrid[r][c]) {
            var tile = state.mapGrid[r][c];
            var baseToken = tile.baseToken != null ? tile.baseToken : tile.token;

            var elevation = 0;
            var baseTypeKey = baseToken.startsWith('w') ? 'WATER' :
                (baseToken.startsWith('g') ? 'GRASS' :
                    (baseToken === 'r' ? 'ROUGH' :
                        (baseToken.startsWith('b') ? 'BUNKER' :
                            (baseToken.startsWith('m') ? 'MOUNTAIN' : null))));

            // 1. Check for specific subtype first (e.g., G1, M2, W1)
            var subTypeKey = baseToken.toUpperCase();
            if (TERRAIN_TYPES[subTypeKey] && TERRAIN_TYPES[subTypeKey].elevation !== undefined) {
                elevation = TERRAIN_TYPES[subTypeKey].elevation;
            }
            // 2. Fallback to base type (e.g., GRASS, WATER)
            else if (baseTypeKey && TERRAIN_TYPES[baseTypeKey]) {
                elevation = TERRAIN_TYPES[baseTypeKey].elevation || 0;
            }
            return elevation;
        }
        return 0;
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
        return null; // Return null instead of default grass if map is not ready
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

                var terrainBody = bodyA.label.startsWith('water') ? bodyA : (bodyB.label.startsWith('water') ? bodyB : null);
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

                var terrainBody = bodyA.label.startsWith('water') ? bodyA : (bodyB.label.startsWith('water') ? bodyB : null);
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

            if (terrainLabel.startsWith('water') && player && player.ballHeight < 1) {
                handleWaterHazard(scene, body);
            }
        } else if (body.label === 'player' && terrainLabel.startsWith('water') && player) {
            if (terrainLabel === 'water2' || terrainLabel === 'water3' || terrainLabel === 'water') {
                player.state = Golf.PLAYER_STATES.SWIMMING;
            } else if (terrainLabel === 'water1') {
                body.currentTerrainType = TERRAIN_TYPES.WATER1;
            }
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
            strokeThickness: 0
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

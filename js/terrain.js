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
        var tokens = Golf.MAP_DATA.replace(/\s+/g, '').split(/,(?![^\[]*\])/);

        state.mapGrid = [];
        state.spawnPoint = { x: config.tileSize / 2, y: config.tileSize / 2 };

        if (!state.worldGroup) {
            state.worldGroup = scene.add.container(0, 0).setDepth(-11);
        }

        state.teePositions = [];
        var waterBlocks = {}; // Track water blocks for merging: { type: [ {r, c} ] }

        for (var r = 0; r < config.rows; r++) {
            state.mapGrid[r] = [];
            for (var c = 0; c < config.cols; c++) {
                var rawToken = tokens[r * config.cols + c] || 'g';
                var x = c * config.tileSize + config.tileSize / 2;
                var y = r * config.tileSize + config.tileSize / 2;

                var match = rawToken.match(/^([a-zA-Z0-9]+)(?:\[(.*?)\])?$/);
                var token = match ? match[1] : rawToken;
                var modifiers = match && match[2] ? match[2].split(',') : [];

                var inclineMod = null;
                var directionMod = null;

                for (var m = 0; m < modifiers.length; m++) {
                    var mStr = modifiers[m];
                    var im = mStr.match(/^i(-?\d+)$/);
                    if (im) inclineMod = parseInt(im[1], 10);
                    var dm = mStr.match(/^d(-?\d+)$/);
                    if (dm) directionMod = parseInt(dm[1], 10);
                }

                var tileInfo = {
                    type: 'grass',
                    direction: directionMod,
                    incline: (inclineMod !== null) ? inclineMod : 0,
                    token: rawToken,
                    baseToken: token,
                    isTee: false
                };

                // Base Type Logic
                if (token.startsWith('w')) {
                    tileInfo.type = token === 'w1' ? 'water1' : (token === 'w2' ? 'water2' : (token === 'w3' ? 'water3' : 'water'));

                    // Collect water for merging instead of adding sensors immediately
                    if (!waterBlocks[tileInfo.type]) waterBlocks[tileInfo.type] = [];
                    waterBlocks[tileInfo.type].push({ r: r, c: c, x: x, y: y });

                    // Solid blocker for buggies in w2/w3 (still added per-tile for simplicity, or could be merged too)
                    if (token === 'w2' || token === 'w3') {
                        scene.matter.add.rectangle(x, y, config.tileSize, config.tileSize, {
                            isStatic: true, label: tileInfo.type + '_solid',
                            collisionFilter: { category: Golf.CAT_DEEP_WATER }
                        });
                    }
                } else if (token.startsWith('g')) {
                    tileInfo.type = 'grass';
                } else if (token.startsWith('b')) {
                    tileInfo.type = 'bunker';
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
                } else if (token.startsWith('i')) {
                    tileInfo.type = 'incline';
                    tileInfo.direction = directionMod !== null ? directionMod : parseInt(token.substring(1), 10);
                    tileInfo.incline = inclineMod !== null ? inclineMod : 5;
                }

                if (modifiers.indexOf('t') !== -1 || token === 't') {
                    tileInfo.isTee = true;
                    state.teePositions.push({ x: x, y: y });
                }
                if (modifiers.indexOf('h') !== -1 || token === 'h') {
                    tileInfo.type = 'hole_position';
                    if (!state.holePositions) state.holePositions = [];
                    state.holePositions.push({ x: x, y: y, row: r, col: c });
                }

                state.mapGrid[r][c] = tileInfo;
            }
        }

        // --- MERGE WATER SENSORS ---
        // Simple row-merging algorithm for performance
        for (var type in waterBlocks) {
            var blocks = waterBlocks[type];
            var grid = {}; // r -> [c]
            blocks.forEach(b => {
                if (!grid[b.r]) grid[b.r] = [];
                grid[b.r].push(b.c);
            });

            for (var rStr in grid) {
                var r = parseInt(rStr);
                var cols = grid[r].sort((a, b) => a - b);

                var start = 0;
                while (start < cols.length) {
                    var end = start;
                    while (end + 1 < cols.length && cols[end + 1] === cols[end] + 1) {
                        end++;
                    }

                    // Found a contiguous row segment from start to end
                    var count = (end - start) + 1;
                    var centerX = (cols[start] * config.tileSize) + (count * config.tileSize) / 2;
                    var centerY = r * config.tileSize + config.tileSize / 2;

                    scene.matter.add.rectangle(centerX, centerY, count * config.tileSize, config.tileSize, {
                        isStatic: true, isSensor: true, label: type,
                        collisionFilter: { category: CAT_TERRAIN }
                    });

                    start = end + 1;
                }
            }
        }
    };

    /**
     * Initializes a pool of tile objects to be reused for rendering the viewport.
     */
    Golf.initTilePool = function (scene) {
        var config = Golf.MAP_CONFIG;
        // Increase pool size significantly for high-res screens and padding.
        // A single frame can now require ~1500-2000 tiles with large padding.
        var poolSize = 3000;

        state.tilePool = [];
        for (var i = 0; i < poolSize; i++) {
            // Base rectangle for non-textured tiles
            // In isometric, the diamond width is roughly config.tileSize and height is config.tileSize / 2
            var rect = scene.add.rectangle(0, 0, config.tileSize, config.tileSize, 0xffffff)
                .setDepth(-11)
                .setVisible(false);

            // SIDE NOTE: For simple rectangles to look like isometric diamonds, 
            // we will rotate them and scale them in updateMapVisibility.
            // Or we could use graphics, but using images/sprites is often easier to manage.

            // Left and Right sides for the cube face
            var sideL = scene.add.polygon(0, 0, [0, 0, 0, 0, 0, 0, 0, 0], 0x000000)
                .setOrigin(0, 0)
                .setDepth(-12)
                .setVisible(false);
            var sideR = scene.add.polygon(0, 0, [0, 0, 0, 0, 0, 0, 0, 0], 0x000000)
                .setOrigin(0, 0)
                .setDepth(-12)
                .setVisible(false);

            // Debug/Info Labels
            var label = scene.add.text(0, 0, '', {
                family: 'monospace',
                fontSize: '24px',
                color: '#000000',
                align: 'center',
                fontStyle: 'bold'
            }).setOrigin(0.5, 0).setAlpha(0.8).setDepth(-5).setVisible(false);

            // Slope Arrows
            var arrow = scene.add.text(0, 0, '→', {
                family: 'monospace',
                fontSize: '48px',
                color: '#000000',
                fontStyle: '900'
            }).setOrigin(0.5).setAlpha(0.9).setDepth(-5).setVisible(false);

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
            var img = scene.add.image(0, 0, 'grass_g1_texture').setDepth(-11).setVisible(false);

            // 3. Add to pool and worldGroup
            state.tilePool.push({
                rect: rect,
                sideL: sideL,
                sideR: sideR,
                img: img,
                label: label,
                arrow: arrow,
                tee: { marker: teeMarker, inner: teeInner, text: teeText }
            });

            state.worldGroup.add([rect, sideL, sideR, img, label, arrow, teeMarker, teeInner, teeText]);
        }

        // Scale the entire world group Y to create the isometric perspective
        state.worldGroup.setScale(1, 0.5);
        state.poolIdx = 0;
    };
    /**
     * Updates which tiles are visible based on the camera viewport.
     */
    Golf.updateMapVisibility = function (scene) {
        if (!state.mapGrid || !state.tilePool) return;

        var cam = scene.cameras.main;
        var config = Golf.MAP_CONFIG;

        // Hide all pooled objects first to prevent ghosts
        state.tilePool.forEach(function (p) {
            p.rect.setVisible(false);
            p.sideL.setVisible(false);
            p.sideR.setVisible(false);
            p.img.setVisible(false);
            p.label.setVisible(false);
            p.arrow.setVisible(false);
            p.tee.marker.setVisible(false);
            p.tee.inner.setVisible(false);
            p.tee.text.setVisible(false);
        });

        // --- OPTIMIZED VIEWPORT CULLING ---
        // We need to find which (r, c) tiles overlap the screen (cam.scrollX, cam.scrollY, cam.width, cam.height)
        // Screen coords: x = c*S - r*S, y = (c*S + r*S)/2
        // Inverse: 
        // c*S = y + x/2
        // r*S = y - x/2

        var S = config.tileSize;
        var pad = S * 5; // Increased padding for high elevation and smooth driving

        var minX = cam.scrollX - pad;
        var maxX = cam.scrollX + cam.width + pad;
        var minY = cam.scrollY - pad;
        var maxY = cam.scrollY + cam.height + pad;

        // Solver for: 
        // x = (c-r)S
        // y = (c+r+1)S/2  <-- Note the +1 comes from S/2 offset in tile center positioning

        var minRS = Math.min(minY - minX / 2, minY - maxX / 2, maxY - minX / 2, maxY - maxX / 2);
        var maxRS = Math.max(minY - minX / 2, minY - maxX / 2, maxY - minX / 2, maxY - maxX / 2);
        var minCS = Math.min(minY + minX / 2, minY + maxX / 2, maxY + minX / 2, maxY + maxX / 2);
        var maxCS = Math.max(minY + minX / 2, minY + maxX / 2, maxY + minX / 2, maxY + maxX / 2);

        // Subtract S/2 to account for the center offset in our solver
        var startRow = Math.max(0, Math.floor((minRS - S / 2) / S) - 2);
        var endRow = Math.min(config.rows - 1, Math.ceil((maxRS - S / 2) / S) + 2);
        var startCol = Math.max(0, Math.floor((minCS - S / 2) / S) - 2);
        var endCol = Math.min(config.cols - 1, Math.ceil((maxCS - S / 2) / S) + 2);

        // --- VISION RANGE CONSTRAINT (50 TILES AROUND PLAYER) ---
        var localPlayerIndex = state.myPlayerId !== null ? state.myPlayerId : 0;
        var p = state.players[localPlayerIndex];
        if (p && p.body) {
            var pc = Math.floor(p.body.position.x / S);
            var pr = Math.floor(p.body.position.y / S);
            var range = 12;

            startRow = Math.max(startRow, pr - range);
            endRow = Math.min(endRow, pr + range);
            startCol = Math.max(startCol, pc - range);
            endCol = Math.min(endCol, pc + range);
        }

        var poolIdx = 0;
        for (var r = startRow; r <= endRow; r++) {
            for (var c = startCol; c <= endCol; c++) {
                if (poolIdx >= state.tilePool.length) break;

                var tile = state.mapGrid[r][c];
                var poolObj = state.tilePool[poolIdx];

                var worldX = c * S + S / 2;
                var worldY = r * S + S / 2;

                // Screen coordinates for positioning
                var x = Math.round(worldX - worldY);
                var y = Math.round(worldX + worldY);

                var color = 0x2ecc71;
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

                var elevation = Golf.getElevationAt(worldX, worldY);
                var topY = Math.round(y - elevation * 2);

                var textureMap = {
                    'g1': 'grass_g1_texture', 'g2': 'grass_g2_texture', 'g3': 'grass_g3_texture',
                    'w1': 'water_w1_texture', 'w2': 'water_w2_texture', 'w3': 'water_w3_texture',
                    'b': 'bunker_b1_texture', 'b2': 'bunker_b2_texture', 'b3': 'bunker_b3_texture',
                    'm1': 'mountain_m1_texture', 'm2': 'mountain_m2_texture', 'm3': 'mountain_m3_texture'
                };

                var isoSize = Math.ceil(S * 1.41422) + 1;

                if (textureMap[baseToken]) {
                    poolObj.img.setTexture(textureMap[baseToken])
                        .setPosition(x, topY)
                        .setRotation(Math.PI / 4)
                        .setDisplaySize(isoSize, isoSize)
                        .setVisible(true);

                    if (elevation === 0) poolObj.img.setAlpha(1);

                    if (baseToken.startsWith('w')) {
                        var wave = Math.sin((scene.time.now / 600) + (r + c) * 0.5);
                        var brightness = Phaser.Math.Linear(0.7, 1.0, (wave + 1) / 2);
                        var colorValue = Math.floor(255 * brightness);
                        poolObj.img.setTint(Phaser.Display.Color.GetColor(colorValue, colorValue, 255));
                    } else {
                        poolObj.img.clearTint();
                    }
                } else {
                    poolObj.rect.setPosition(x, topY)
                        .setRotation(Math.PI / 4)
                        .setDisplaySize(isoSize, isoSize)
                        .setFillStyle(color)
                        .setVisible(true);
                }

                // Sides
                var sideColorL = Phaser.Display.Color.ValueToColor(color).darken(20).color;
                var sideColorR = Phaser.Display.Color.ValueToColor(color).darken(40).color;

                var elevSW = (r + 1 < config.rows) ? Golf.getElevationAt(worldX, worldY + S) : 0;
                var diffSW = elevation - elevSW;
                var elevSE = (c + 1 < config.cols) ? Golf.getElevationAt(worldX + S, worldY) : 0;
                var diffSE = elevation - elevSE;

                var halfDiagX = Math.round(S);
                var halfDiagY = Math.round(S);

                if (diffSW > 0) {
                    var h = diffSW * 2 + 2;
                    poolObj.sideL.setPosition(x, topY)
                        .setTo([-halfDiagX - 1, -1, 1, halfDiagY + 1, 1, halfDiagY + h, -halfDiagX - 1, h])
                        .setFillStyle(sideColorL).setVisible(true);
                }
                if (diffSE > 0) {
                    var h = diffSE * 2 + 2;
                    poolObj.sideR.setPosition(x, topY)
                        .setTo([-1, halfDiagY + 1, halfDiagX + 1, -1, halfDiagX + 1, h, -1, halfDiagY + h])
                        .setFillStyle(sideColorR).setVisible(true);
                }

                // Depth
                var baseDepth = (r + c) * 10 - 1000;
                poolObj.rect.setDepth(baseDepth + 2);
                poolObj.img.setDepth(baseDepth + 2);
                poolObj.sideL.setDepth(baseDepth + 1);
                poolObj.sideR.setDepth(baseDepth + 1);
                poolObj.arrow.setDepth(baseDepth + 5);
                poolObj.tee.marker.setDepth(baseDepth + 6);
                poolObj.tee.inner.setDepth(baseDepth + 7);
                poolObj.tee.text.setDepth(baseDepth + 8);

                if (tile.isTee) {
                    poolObj.tee.marker.setPosition(x, y).setVisible(true);
                    poolObj.tee.inner.setPosition(x, y).setVisible(true);
                    poolObj.tee.text.setPosition(x, y).setVisible(true);
                }

                // --- Slope Inspection ---
                if (state.inspectPoint) {
                    var pc = Math.floor(p.body.position.x / S);
                    var pr = Math.floor(p.body.position.y / S);
                    var dist = Math.sqrt(Math.pow(c - pc, 2) + Math.pow(r - pr, 2));

                    if (dist <= Golf.INSPECT_RADIUS && (tile.type === 'incline' || tile.incline > 0)) {
                        // Rotation: tile.direction 0 is North (-Y), 90 is East (+X)
                        // Arrow character '→' defaults to pointing East (0 rad)
                        // So we subtract 90 to match the compass
                        var arrowRad = Phaser.Math.DegToRad(tile.direction - 90);

                        poolObj.arrow.setPosition(x, topY)
                            .setRotation(arrowRad)
                            .setVisible(true);

                        poolObj.label.setPosition(x, topY + 20)
                            .setText(tile.incline + '°')
                            .setVisible(true);
                    }
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

            if (tile.incline > 0 && tile.direction !== null) {
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

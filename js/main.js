// 321 Golf - Chaotic Town Edition (script-tag build, no ES modules)
(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;

    function preload() {
        console.log('Phaser: Preloading assets...');
        this.load.spritesheet('player-sheet', Golf.ASSETS.PLAYER_SPRITESHEET, { frameWidth: 160, frameHeight: 160 });

        // This tells Phaser: "Download this file and call it 'grass_texture'"
        this.load.image('grass_g1_texture', 'assets/grass_g1.png');
        this.load.image('grass_g2_texture', 'assets/grass_g2.png');
        this.load.image('grass_g3_texture', 'assets/grass_g3.png');
        this.load.image('mountain_m1_texture', 'assets/mountain_m1.png');
        this.load.image('mountain_m2_texture', 'assets/mountain_m2.jpg');
        this.load.image('water_w1_texture', 'assets/water_w1.jpg');
        this.load.image('water_w2_texture', 'assets/water_w2.jpg');
        this.load.image('water_w3_texture', 'assets/water_w3.jpg');
        this.load.image('bunker_b1_texture', 'assets/sand.png');

    }

    function create() {
        var scene = this;

        // Disable right-click context menu
        this.input.mouse.disableContextMenu();

        // Define Animations for all 4 players
        for (var pIdx = 0; pIdx < 4; pIdx++) {
            var rowStart = Math.floor(pIdx / 2) * 4;
            var colStart = (pIdx % 2) * 4;
            var baseFrame = rowStart * 8 + colStart;

            // Walk Horizontal (Left for P1/P3, Right for P2/P4)
            scene.anims.create({
                key: 'walk_h_' + pIdx,
                frames: scene.anims.generateFrameNumbers('player-sheet', {
                    start: baseFrame, end: baseFrame + 3
                }),
                frameRate: 8,
                repeat: -1
            });

            // Walk Up
            scene.anims.create({
                key: 'walk_n_' + pIdx,
                frames: scene.anims.generateFrameNumbers('player-sheet', {
                    start: baseFrame + 8, end: baseFrame + 11
                }),
                frameRate: 8,
                repeat: -1
            });

            // Walk Down
            scene.anims.create({
                key: 'walk_s_' + pIdx,
                frames: scene.anims.generateFrameNumbers('player-sheet', {
                    start: baseFrame + 16, end: baseFrame + 19
                }),
                frameRate: 8,
                repeat: -1
            });

            // Swing
            scene.anims.create({
                key: 'swing_' + pIdx,
                frames: scene.anims.generateFrameNumbers('player-sheet', {
                    start: baseFrame + 24, end: baseFrame + 26
                }),
                frameRate: 10,
                repeat: 0
            });
        }

        var config = Golf.MAP_CONFIG;
        var worldWidth = config.cols * config.tileSize;
        var worldHeight = config.rows * config.tileSize;

        state.game = scene.game;
        scene.matter.world.setBounds(0, 0, worldWidth, worldHeight);
        scene.cameras.main.setBounds(0, 0, worldWidth, worldHeight);



        var graphics = scene.make.graphics({ x: 0, y: 0, add: false });
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(8, 8, 8);
        graphics.generateTexture('white', 16, 16);

        state.particles = scene.add.particles(0, 0, 'white', {
            speed: { min: 40, max: 80 },
            scale: { start: 0.4, end: 0 },
            alpha: { start: 0.5, end: 0 },
            lifespan: 500,
            frequency: -1,
            blendMode: 'ADD'
        });

        // Clubs will be spawned by server and sent via game-start event
        console.log('[Main] Waiting for server to send club positions...');

        // Initialize Networking
        if (Golf.Networking) {
            Golf.Networking.init(scene);
        }



        try {
            Golf.createTerrains(scene);
            Golf.initTilePool(scene);
        } catch (err) {
            console.error('[Main] Error creating terrains:', err);
        }

        try {
            Golf.createHole(scene);
        } catch (err) {
            console.error('[Main] Error creating hole:', err);
        }

        state.aimLine = scene.add.graphics().setDepth(10000);
        state.hitConeGraphics = scene.add.graphics().setDepth(10000);

        // Pick a random tee if not already set (e.g. by networking or host)
        if (!state.spawnPoint && state.teePositions && state.teePositions.length > 0) {
            var randomIndex = Phaser.Math.Between(0, state.teePositions.length - 1);
            state.spawnPoint = state.teePositions[randomIndex];
            console.log('[Main] Selected initial random tee:', state.spawnPoint);
        }

        var spawnX = state.spawnPoint ? state.spawnPoint.x : worldWidth / 2;
        var spawnY = state.spawnPoint ? state.spawnPoint.y : worldHeight / 2;

        state.players.push(
            Golf.createPlayer(scene, spawnX, spawnY, 0xff4757, false, 0)
        );
        state.players.push(
            Golf.createPlayer(scene, spawnX + 100, spawnY, 0x1e90ff, false, 1)
        );
        state.players.push(
            Golf.createPlayer(scene, spawnX - 100, spawnY, 0xfeca57, false, 2)
        );


        scene.keys = scene.input.keyboard.addKeys('W,A,S,D,SPACE,E,SHIFT,ONE,TWO');

        state.players.forEach(function (p) {
            p.debugText = scene.add.text(0, 0, '', {
                fontSize: '12px',
                fill: '#ffffff',
                backgroundColor: '#000000bb'
            }).setOrigin(0.5).setDepth(11000);
        });

        // Camera will be set to follow the correct player after game starts
        // Either by networking.js (multiplayer) or by triggerStart (single-player)

        state.players.forEach(function (p) {
            Golf.createGolfCart(scene, p.body.position.x + 60, p.body.position.y, p.color, p.playerIndex);
        });

        scene.interactionText = scene.add
            .text(0, 0, '', {
                family: 'Outfit',
                fontSize: '18px',
                fill: '#fff',
                backgroundColor: '#000',
                padding: 5
            })
            .setOrigin(0.5)
            .setAlpha(0)
            .setDepth(11000);

        scene.powerMeterContainer = document.getElementById('power-meter-container');
        scene.powerMeterFill = document.getElementById('power-meter-fill');
        scene.countdownEl = document.getElementById('countdown');
        scene.holeDisplay = document.getElementById('current-hole');
        scene.speedometer = document.getElementById('speedometer');
        scene.speedValue = document.getElementById('speed-value');
        scene.clubSlots = [
            document.getElementById('club-1'),
            document.getElementById('club-2')
        ];
        scene.overlay = document.getElementById('instruction-overlay');

        Golf.setupStartTrigger(scene);
    }

    function update(time, delta) {
        var scene = this;
        if (state.isWaitingToStart) return;
        if (scene.sinkCooldownFrames > 0) scene.sinkCooldownFrames--;

        // Ensure camera is following the correct player
        // Force it for the first 60 frames to make sure it sticks
        if (!scene.cameraFollowFrames) scene.cameraFollowFrames = 0;

        var localPlayerIndex = state.myPlayerId !== null ? state.myPlayerId : 0;
        if (state.players[localPlayerIndex]) {
            if (scene.cameraFollowFrames < 60) {
                scene.cameras.main.startFollow(state.players[localPlayerIndex].sprite, true, 0.1, 0.1);
                scene.cameraFollowFrames++;
                if (scene.cameraFollowFrames === 1) {
                    console.log('[Update] Camera forcefully following player', localPlayerIndex);
                }
            }
        }

        Golf.updateHoleArrow(scene);
        Golf.updateMapVisibility(scene);

        // Send player input to server every frame
        // Golf.sendPlayerInput(scene); // Removing old placeholder

        var localPlayerIndex = state.myPlayerId !== null ? state.myPlayerId : 0;
        if (state.players[localPlayerIndex] && Golf.Networking) {
            Golf.Networking.sendPlayerInput(state.players[localPlayerIndex]);
        }

        // --- ROBUST INPUT CHECK ---
        var ePressed = Phaser.Input.Keyboard.JustDown(scene.keys.E);
        if (ePressed && state.players[localPlayerIndex]) {
            // Diagnostic: Show temporary text on screen to confirm key registration
            var pPos = state.players[localPlayerIndex].body.position;
            var diagText = scene.add.text(pPos.x, pPos.y - 120, 'E PRESSED!', {
                family: 'Outfit',
                fontSize: '24px',
                fontStyle: 'bold',
                color: '#00ff00',
                backgroundColor: '#000000'
            }).setOrigin(0.5).setDepth(1000);
            scene.time.delayedCall(500, function () { diagText.destroy(); });
            console.log('[Main] Diagnostic: E key state captured as TRUE');
        }


        state.players.forEach(function (p, index) {
            // Handle local player input
            // In single-player: control player 0
            // In multiplayer: control the player assigned by server (myPlayerId)
            var isLocalPlayer = (state.myPlayerId === null && index === 0) || (index === state.myPlayerId);

            if (isLocalPlayer && !p.isAI) {
                Golf.handleHumanInput(scene, p, delta);
            }

            var pSprite = p.sprite;

            // Handle DOM Character Visuals
            // Handle DOM Character Visuals
            var golferNode = pSprite.node.querySelector('#golfer');
            if (golferNode) {
                var targetRot = 0;
                switch (p.direction) {
                    case Golf.DIRECTIONS.N: targetRot = 135; break;
                    case Golf.DIRECTIONS.NE: targetRot = 90; break;
                    case Golf.DIRECTIONS.E: targetRot = 45; break;
                    case Golf.DIRECTIONS.SE: targetRot = 0; break;
                    case Golf.DIRECTIONS.S: targetRot = -45; break;
                    case Golf.DIRECTIONS.SW: targetRot = -90; break;
                    case Golf.DIRECTIONS.W: targetRot = -135; break;
                    case Golf.DIRECTIONS.NW: targetRot = -180; break;
                }

                // Override if aiming
                if (p.isAiming || p.swingState === Golf.SWING_STATES.BACKSWING) {
                    var aimDeg = Phaser.Math.RadToDeg(p.aimAngle || 0);
                    targetRot = 45 - aimDeg;
                }

                // Shortest-path rotation logic
                if (p.currentVisualRotation === undefined) p.currentVisualRotation = targetRot;

                var diff = targetRot - (p.currentVisualRotation % 360);
                if (diff > 180) diff -= 360;
                if (diff < -180) diff += 360;

                p.currentVisualRotation += diff;
                golferNode.style.setProperty('--dir-rotate', p.currentVisualRotation + 'deg');
            }

            // Animation State (Walking)
            if (p.state === Golf.PLAYER_STATES.WALKING || p.state === Golf.PLAYER_STATES.SWIMMING) {
                pSprite.node.classList.add('walking');
            } else {
                pSprite.node.classList.remove('walking');
            }

            // Swing Animation States
            if (p.isAiming || p.swingState === Golf.SWING_STATES.BACKSWING) {
                pSprite.node.classList.add('aiming');
                pSprite.node.classList.remove('swinging');
            } else if (p.swingState === Golf.SWING_STATES.HIT) {
                pSprite.node.classList.remove('aiming');
                pSprite.node.classList.add('swinging');
            } else {
                pSprite.node.classList.remove('aiming');
                pSprite.node.classList.remove('swinging');
            }

            // Submerged visual for swimming, or hidden if driving
            if (p.driving || p.remoteDriving) {
                p.sprite.setAlpha(0);
            } else {
                p.sprite.setAlpha(p.state === Golf.PLAYER_STATES.SWIMMING ? 0.6 : 1.0);
            }

            var pElevation = Golf.getElevationAt(p.body.position.x, p.body.position.y);
            // pVisualY: position the sprite so the character's FEET land at (body.y - elevation).
            // The CSS character's feet are 45px below the DOM element's origin (legs: top 60→180px × scale 0.25).
            var PLAYER_FEET_OFFSET = 45;
            var pVisualY = p.body.position.y - pElevation - PLAYER_FEET_OFFSET;
            p.sprite.setPosition(p.body.position.x, pVisualY);
            p.sprite.setDepth(p.body.position.y - pElevation + 20);

            // Update debug text
            var debugInfo = p.state + " (" + p.direction + ")";
            if (p.state === "SWINGING") debugInfo += "\n" + p.swingState;
            p.debugText.setText(debugInfo);
            p.debugText.setPosition(p.body.position.x, p.body.position.y - pElevation + 10);

            var bElevation = Golf.getElevationAt(p.ball.position.x, p.ball.position.y);
            p.ballSprite.setPosition(p.ball.position.x, p.ball.position.y - p.ballHeight - bElevation);
            p.ballSprite.setScale(1 + p.ballHeight / 20);
            p.ballSprite.setDepth(p.ball.position.y - bElevation);

            p.ballShadow.setPosition(p.ball.position.x, p.ball.position.y - bElevation);
            p.ballShadow.setVisible(p.ballHeight > 0 || bElevation !== 0);
            p.ballShadow.setScale(1 - p.ballHeight / 100);
            p.ballShadow.setDepth(p.ball.position.y - bElevation - 0.1);

            var bSpeed = Math.sqrt(p.ball.velocity.x * p.ball.velocity.x + p.ball.velocity.y * p.ball.velocity.y);

            // Dynamic height-based collision
            var baseMask = Golf.CAT_BUILDING | Golf.CAT_DEFAULT | Golf.CAT_HOLE;
            var currentMask = baseMask;

            if (p.ballHeight > 2) {
                // In flight: Can hit players and carts (if below their height)
                // but ignores terrain (clears grass/water)
                if (p.ballHeight <= 12) currentMask |= Golf.CAT_PLAYER;
                if (p.ballHeight <= 20) currentMask |= Golf.CAT_CAR;
            } else {
                // Grounded: Ghost through players and carts, but hit terrain
                currentMask |= Golf.CAT_TERRAIN;
            }

            p.ball.collisionFilter.mask = currentMask;

            // --- Terrain Physics (Friction & Slopes) ---
            if (bSpeed > 0.01) {
                if (p.ballHeight <= 2) {
                    // Determine terrain under the ball.
                    // NOTE: many bunker tiles are encoded as "b..." with incline/direction modifiers,
                    // which change tile.type to "incline". Use baseToken so bunkers are still detected.
                    var tile = Golf.getTileAt(p.ball.position.x, p.ball.position.y);
                    var isBunker =
                        tile &&
                        (
                            tile.type === 'bunker' ||
                            (tile.baseToken && String(tile.baseToken).charAt(0) === 'b')
                        );

                    if (isBunker) {
                        // In bunkers: very high drag and no slope forces.
                        // This keeps the motion mostly one-way from the hit,
                        // then lets the ball roll just a short distance before stopping.
                        var bunkerFriction = Golf.getFrictionAt(p.ball.position.x, p.ball.position.y) * 3;
                        p.ball.frictionAir = bunkerFriction;

                        // Once the ball is almost stopped in sand, snap it fully to rest.
                        if (bSpeed < 0.2) {
                            scene.matter.body.setVelocity(p.ball, { x: 0, y: 0 });
                            bSpeed = 0;
                        }
                    } else {
                        // Normal terrain behaviour
                        var baseFriction = Golf.getFrictionAt(p.ball.position.x, p.ball.position.y);
                        p.ball.frictionAir = baseFriction;

                        // Apply Slopes
                        var slopeForce = Golf.getSlopeAt(p.ball.position.x, p.ball.position.y);
                        if (slopeForce.x !== 0 || slopeForce.y !== 0) {
                            scene.matter.body.applyForce(p.ball, p.ball.position, {
                                x: slopeForce.x * p.ball.mass,
                                y: slopeForce.y * p.ball.mass
                            });
                        }
                    }
                } else {
                    // Reset to default friction in air
                    p.ball.frictionAir = 0.015;
                }
            }
            // -------------------------

            p.trail.emitting = bSpeed > 2;

            if (isLocalPlayer && !p.isAI) {
                // Find nearest interaction target
                var nearestClub = null;
                var minDistClubs = 100; // Increased search radius for logging
                state.clubs.forEach(function (c) {
                    var d = Phaser.Math.Distance.Between(p.body.position.x, p.body.position.y, c.x, c.y);
                    if (d < minDistClubs) {
                        nearestClub = c;
                        minDistClubs = d;
                    }
                });

                var interactionTarget = (minDistClubs <= 75) ? nearestClub : null;

                var nearestCart = null;
                var minDistCarts = 100;
                state.golfCarts.forEach(function (cart) {
                    var d = Phaser.Math.Distance.Between(p.body.position.x, p.body.position.y, cart.body.position.x, cart.body.position.y);
                    if (d < minDistCarts) {
                        nearestCart = cart;
                        minDistCarts = d;
                    }
                });

                var cartTarget = (minDistCarts <= 80) ? nearestCart : null;

                // Interaction Logic
                if (p.driving) {
                    scene.interactionText
                        .setPosition(p.body.position.x, p.body.position.y - 60)
                        .setText('Press E to Exit')
                        .setAlpha(1);
                    if (ePressed) {
                        console.log('[Main] Interaction: E pressed to Exit Cart');
                        Golf.exitCart(p);
                    }
                } else if (interactionTarget) {
                    var isSwap = p.inventory.length >= 2;
                    var label = isSwap ? 'Swap with ' : 'Pick up ';
                    scene.interactionText
                        .setPosition(p.body.position.x, p.body.position.y - 60)
                        .setText('Press E to ' + label + interactionTarget.type.name)
                        .setAlpha(1);

                    if (ePressed) {
                        console.log('[Main] Interaction: E pressed for club:', interactionTarget.id, 'Swap State:', isSwap, 'Current Inv:', p.inventory.map(c => c.name));
                        if (isSwap) {
                            var droppedClub = p.activeClub || p.inventory[0];
                            console.log('[Main] Swapping out equipped club:', droppedClub.name);
                            if (Golf.Networking && state.myPlayerId !== null) {
                                Golf.Networking.requestSwap(interactionTarget.id, droppedClub, p.body.position.x, p.body.position.y);
                            } else {
                                // Local Fallback
                                console.log('[Main] Local Swap Fallback');
                                var idx = p.inventory.findIndex(function (c) { return c.name.toLowerCase() === droppedClub.name.toLowerCase(); });
                                if (idx === -1) idx = 0;
                                p.inventory[idx] = interactionTarget.type;
                                p.activeClub = interactionTarget.type;
                                Golf.removeClub(interactionTarget.id);
                                Golf.createClub(scene, p.body.position.x, p.body.position.y, droppedClub, 'local_d_' + Date.now());
                                Golf.updateClubUI(p);
                            }
                        } else {
                            if (Golf.Networking && state.myPlayerId !== null) {
                                console.log('[Main] Networking Pickup Request');
                                Golf.Networking.requestPickup(interactionTarget.id);
                            } else {
                                // Local Fallback
                                console.log('[Main] Local Pickup Fallback');
                                p.inventory.push(interactionTarget.type);
                                p.activeClub = interactionTarget.type; // Auto-equip
                                Golf.removeClub(interactionTarget.id);
                                Golf.updateClubUI(p);
                            }
                        }
                    }
                } else if (cartTarget) {
                    scene.interactionText
                        .setPosition(p.body.position.x, p.body.position.y - 60)
                        .setText('Press E to Drive')
                        .setAlpha(1);
                    if (ePressed) {
                        console.log('[Main] Interaction: E pressed to Enter Cart');
                        Golf.enterCart(p, cartTarget);
                    }
                } else {
                    scene.interactionText.setAlpha(0);
                }

                // Club Switching
                if (p.inventory.length >= 1) {
                    if (Phaser.Input.Keyboard.JustDown(scene.keys.ONE) && p.inventory[0]) {
                        p.activeClub = p.inventory[0];
                        Golf.updateClubUI(p);
                    } else if (Phaser.Input.Keyboard.JustDown(scene.keys.TWO) && p.inventory[1]) {
                        p.activeClub = p.inventory[1];
                        Golf.updateClubUI(p);
                    }
                }
            }


            if (p.driving) {
                var cartElev = Golf.getElevationAt(p.driving.body.position.x, p.driving.body.position.y);
                p.sprite.setPosition(p.driving.body.position.x, p.driving.body.position.y - cartElev - PLAYER_FEET_OFFSET);
                scene.matter.body.setPosition(p.body, p.driving.body.position);
                // Position and Rotation of the cart sprite are handled in the separate golfCarts loop to avoid redundancy
            }

        });

        // Update Carts (Moved outside player loop)
        state.golfCarts.forEach(function (cart, index) {
            // Check if local player is driving this cart
            var localP = state.players[localPlayerIndex];
            var isLocalDriving = (localP && localP.driving === cart);

            // Interpolation for Remote Carts
            if (!isLocalDriving && cart.netTarget) {
                // Only interpolate if data is fresh (< 200ms)
                // This prevents "rubber banding" to an old position when pushing an empty cart
                var isFresh = (Date.now() - cart.netTarget.timestamp) < 200;

                if (isFresh) {
                    var targetX = cart.netTarget.x;
                    var targetY = cart.netTarget.y;
                    var targetVX = cart.netTarget.vx || 0;
                    var targetVY = cart.netTarget.vy || 0;

                    // Distance Check for Teleport (Snap if error > 50px)
                    var dist = Phaser.Math.Distance.Between(cart.body.position.x, cart.body.position.y, targetX, targetY);

                    if (dist > 50) {
                        // Snap immediately if too far
                        scene.matter.body.setPosition(cart.body, { x: targetX, y: targetY });
                        scene.matter.body.setVelocity(cart.body, { x: targetVX, y: targetVY });
                    } else {
                        // Smooth Interpolation
                        // 1. Set velocity to target velocity to maintain momentum prediction
                        scene.matter.body.setVelocity(cart.body, { x: targetVX, y: targetVY });

                        // 2. Nudge position towards target (Error Correction)
                        // Lower factor (0.1 - 0.2) is smoother but "lazier". Higher is snappier but jittery.
                        var lerpFactor = 0.2;
                        var newX = Phaser.Math.Linear(cart.body.position.x, targetX, lerpFactor);
                        var newY = Phaser.Math.Linear(cart.body.position.y, targetY, lerpFactor);

                        scene.matter.body.setPosition(cart.body, { x: newX, y: newY });
                    }

                    // Smoothly rotate
                    var currentAngle = cart.body.angle;
                    var targetAngle = cart.netTarget.angle;
                    var diff = targetAngle - currentAngle;
                    // Normalize to -PI to +PI
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;

                    scene.matter.body.setAngle(cart.body, currentAngle + diff * 0.2);
                }
            }

            var cartElevation = Golf.getElevationAt(cart.body.position.x, cart.body.position.y);
            cart.sprite.setPosition(cart.body.position.x, cart.body.position.y - cartElevation);
            cart.sprite.setDepth(cart.body.position.y + 40);

            // Sync rotation via CSS variable
            var angleDeg = Phaser.Math.RadToDeg(cart.body.angle);
            // Invert the rotation direction and use 180 deg offset to match physics
            // (North is 0 in physics, and 180 in CSS rotateY for this model)
            var snappedAngle = 180 - (Math.round(angleDeg / 6) * 6);
            cart.sprite.node.querySelector('.cart-visual').style.setProperty('--cart-rotate', snappedAngle + 'deg');

            // --- Sticky Pushing Logic ---
            var isPushedByLocal = false;
            if (localP && !isLocalDriving && !localP.driving) {
                // Check if I am physically pushing (Close + Moving)
                var dist = Phaser.Math.Distance.Between(localP.body.position.x, localP.body.position.y, cart.body.position.x, cart.body.position.y);
                var speed = Math.sqrt(cart.body.velocity.x * cart.body.velocity.x + cart.body.velocity.y * cart.body.velocity.y);

                // If I'm close and it's moving, CLAIM ownership
                // Increased radius to 150 because cart is 160px long (center to end is 80px)
                if (dist < 150 && speed > 0.1) {
                    cart.lastPusher = localPlayerIndex;
                }

                // If I own the "push", maintain authority until it stops
                if (cart.lastPusher === localPlayerIndex) {
                    if (speed > 0.05) {
                        isPushedByLocal = true;
                    } else {
                        // It stopped moving, release ownership
                        cart.lastPusher = null;
                        // (And don't send updates for stationary object)
                    }
                }
            }

            // If local player is driving OR pushing this cart, send update (THROTTLED)
            if ((isLocalDriving || isPushedByLocal) && Golf.Networking) {
                var now = Date.now();
                if (!cart.lastNetworkUpdate || now - cart.lastNetworkUpdate > 33) { // ~30 updates/sec
                    Golf.Networking.sendCartUpdate(index, cart);
                    cart.lastNetworkUpdate = now;
                    // Debug: Log every second to confirm pushing logic
                    if (isPushedByLocal && (!cart.lastPushLog || now - cart.lastPushLog > 1000)) {
                        console.log('[Main] Sending Cart Update (Pushing):', index, 'Dist:', Math.floor(dist || 0));
                        cart.lastPushLog = now;
                    }
                }
            }
        });


    }

    function handleHumanInput(scene, p, delta) {
        if (p.driving) {
            Golf.handleDriving(scene, p, null, delta);
        } else {
            Golf.handlePlayerMovement(scene, p, null, delta);
            Golf.handleAiming(scene, p);
        }
    }

    function handleRemotePlayerInput(scene, p) {
        if (!p.remoteKeys) return;

        // Handle E key for entering/exiting (Guest interaction on Host)
        // We need a debounce or justOneDown check for remote E
        if (p.remoteKeys.E && !p.remoteEWasDown) {
            // "Just Down" logic for remote player
            if (p.driving) {
                Golf.exitCart(p);
            } else {
                var nearCart = null;
                state.golfCarts.forEach(function (cart) {
                    var dist = Phaser.Math.Distance.Between(
                        p.body.position.x, p.body.position.y,
                        cart.body.position.x, cart.body.position.y
                    );
                    if (dist < 80) nearCart = cart;
                });
                if (nearCart) Golf.enterCart(p, nearCart);
            }
        }
        p.remoteEWasDown = p.remoteKeys.E;

        // Use custom handleHumanInput-like logic but with remote inputs
        if (p.driving) {
            Golf.handleDriving(scene, p, p.remoteKeys, 16.66);
        } else {
            Golf.handlePlayerMovement(scene, p, p.remoteKeys, 16.66);
            if (p.remotePointer) {
                Golf.handleAiming(scene, p, p.remotePointer);
            }
        }
    }

    var config = {
        type: Phaser.AUTO,
        width: window.innerWidth,
        height: window.innerHeight,
        parent: 'game-container',
        dom: {
            createContainer: true
        },

        fps: {
            target: 60,
            forceSetTimeOut: true
        },

        physics: {
            default: 'matter',
            matter: {
                gravity: { y: 0 },
                debug: false,
                timing: {
                    fixedDelta: 1000 / 60
                }
            }
        },

        scene: {
            preload: preload,
            create: create,
            update: update
        }
    };


    new Phaser.Game(config);
})(typeof window !== 'undefined' ? window : this);

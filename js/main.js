// 321 Golf - Chaotic Town Edition (script-tag build, no ES modules)
(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;

    function preload() {
        console.log('Phaser: Preloading assets...');
        this.load.spritesheet('player-sheet', Golf.ASSETS.PLAYER_SPRITESHEET, { frameWidth: 16, frameHeight: 16 });
    }

    function create() {
        var scene = this;

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

        state.aimLine = scene.add.graphics().setDepth(10);
        state.hitConeGraphics = scene.add.graphics().setDepth(9);

        var spawnX = worldWidth / 2;
        var spawnY = worldHeight / 2;

        var isHost = (state.myPlayerId === 0 || state.myPlayerId === null);
        if (state.spawnPositions && state.spawnPositions.length > 0) {
            if (isHost) {
                // Host picks a random spawn point
                var randomIndex = Phaser.Math.Between(0, state.spawnPositions.length - 1);
                state.selectedSpawn = state.spawnPositions[randomIndex];
                console.log("[Main] Host selected spawn point:", state.selectedSpawn);

                // Broadcast to guests
                if (Golf.Networking && Golf.Networking.sendSpawnUpdate && state.myPlayerId !== null) {
                    Golf.Networking.sendSpawnUpdate(state.selectedSpawn);
                }
            }

            // If we have a selected spawn (picked by host or synced by guest), use it
            if (state.selectedSpawn) {
                spawnX = state.selectedSpawn.x;
                spawnY = state.selectedSpawn.y;
            } else if (state.spawnPoint) {
                spawnX = state.spawnPoint.x;
                spawnY = state.spawnPoint.y;
            }
        }

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
            }).setOrigin(0.5).setDepth(200);
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
            .setDepth(100);

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


        state.players.forEach(function (p, index) {
            // Handle local player input
            // In single-player: control player 0
            // In multiplayer: control the player assigned by server (myPlayerId)
            var isLocalPlayer = (state.myPlayerId === null && index === 0) || (index === state.myPlayerId);

            if (isLocalPlayer && !p.isAI) {
                handleHumanInput(scene, p, delta);
            }

            // Update animations based on state
            var animKey = '';
            var flip = false;
            var pIdx = p.playerIndex;

            if (p.state === Golf.PLAYER_STATES.WALKING || p.state === Golf.PLAYER_STATES.SWIMMING) {
                if (p.direction.includes('N')) {
                    animKey = 'walk_n_' + pIdx;
                } else if (p.direction.includes('S')) {
                    animKey = 'walk_s_' + pIdx;
                } else {
                    animKey = 'walk_h_' + pIdx;
                }

                // Handle flipping for horizontal
                if (pIdx % 2 === 0) { // P1 and P3 are primarily Left walking
                    if (p.direction.includes('E')) flip = true;
                } else { // P2 and P4 are primarily Right walking
                    if (p.direction.includes('W')) flip = true;
                }
            } else if (p.state === Golf.PLAYER_STATES.SWINGING) {
                animKey = 'swing_' + pIdx;
            } else {
                // Idle: Show first frame of Down animation
                p.sprite.stop();
                var rowStart = Math.floor(pIdx / 2) * 4;
                var colStart = (pIdx % 2) * 4;
                p.sprite.setFrame(rowStart * 8 + colStart + 16);
            }

            if (animKey) {
                p.sprite.play(animKey, true);
                p.sprite.setFlipX(flip);
            }

            // Submerged visual for swimming, or hidden if driving
            if (p.driving || p.remoteDriving) {
                p.sprite.setAlpha(0);
            } else {
                p.sprite.setAlpha(p.state === Golf.PLAYER_STATES.SWIMMING ? 0.6 : 1.0);
            }

            p.sprite.setPosition(p.body.position.x, p.body.position.y);

            // Update debug text
            var debugInfo = p.state + " (" + p.direction + ")";
            if (p.state === "SWINGING") debugInfo += "\n" + p.swingState;
            p.debugText.setText(debugInfo);
            p.debugText.setPosition(p.body.position.x, p.body.position.y + 40);

            p.ballSprite.setPosition(p.ball.position.x, p.ball.position.y - p.ballHeight);
            p.ballSprite.setScale(1 + p.ballHeight / 20);

            p.ballShadow.setPosition(p.ball.position.x, p.ball.position.y);
            p.ballShadow.setVisible(p.ballHeight > 0);
            p.ballShadow.setScale(1 - p.ballHeight / 100);

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
                    // Apply Terrain Friction
                    p.ball.frictionAir = Golf.getFrictionAt(p.ball.position.x, p.ball.position.y);

                    // Apply Slopes
                    var slopeForce = Golf.getSlopeAt(p.ball.position.x, p.ball.position.y);
                    if (slopeForce.x !== 0 || slopeForce.y !== 0) {
                        scene.matter.body.applyForce(p.ball, p.ball.position, {
                            x: slopeForce.x * p.ball.mass,
                            y: slopeForce.y * p.ball.mass
                        });
                    }
                } else {
                    // Reset to default friction in air
                    p.ball.frictionAir = 0.015;
                }
            }
            // -------------------------

            p.trail.emitting = bSpeed > 2;

            if (p.inventory.length < 2) {
                state.clubs.forEach(function (c, i) {
                    if (
                        c.sprite.visible &&
                        !c.tempTaken && // Avoid spamming
                        Phaser.Math.Distance.Between(
                            p.body.position.x, p.body.position.y,
                            c.x, c.y
                        ) < 60
                    ) {
                        // Request pickup from server
                        if (Golf.Networking && c.id !== undefined) {
                            Golf.Networking.requestPickup(c.id);
                            c.tempTaken = true; // Local Debounce
                        }
                    }
                });
            }

            if (!p.isAI && p.inventory.length >= 1) {
                if (Phaser.Input.Keyboard.JustDown(scene.keys.ONE) && p.inventory[0]) {
                    p.activeClub = p.inventory[0];
                    Golf.updateClubUI(p);
                } else if (Phaser.Input.Keyboard.JustDown(scene.keys.TWO) && p.inventory[1]) {
                    p.activeClub = p.inventory[1];
                    Golf.updateClubUI(p);
                }
            }

            if (isLocalPlayer && !p.isAI) {
                var nearCart = null;
                state.golfCarts.forEach(function (cart) {
                    var dist = Phaser.Math.Distance.Between(
                        p.body.position.x, p.body.position.y,
                        cart.body.position.x, cart.body.position.y
                    );
                    if (dist < 80) nearCart = cart;
                });

                if (nearCart && !p.driving) {
                    scene.interactionText
                        .setPosition(p.body.position.x, p.body.position.y - 60)
                        .setText('Press E to Drive')
                        .setAlpha(1);
                    if (Phaser.Input.Keyboard.JustDown(scene.keys.E)) {
                        Golf.enterCart(p, nearCart);
                    }
                } else if (p.driving) {
                    scene.interactionText
                        .setPosition(p.body.position.x, p.body.position.y - 60)
                        .setText('Press E to Exit')
                        .setAlpha(1);
                    if (Phaser.Input.Keyboard.JustDown(scene.keys.E)) {
                        Golf.exitCart(p);
                    }
                } else {
                    scene.interactionText.setAlpha(0);
                }
            }


            if (p.driving) {
                p.sprite.setPosition(p.driving.body.position.x, p.driving.body.position.y);
                scene.matter.body.setPosition(p.body, p.driving.body.position);
                p.driving.sprite.setPosition(p.driving.body.position.x, p.driving.body.position.y);
                p.driving.sprite.setRotation(p.driving.body.angle);
            }

        });

        // Update Carts (Moved outside player loop)
        state.golfCarts.forEach(function (cart, index) {
            cart.sprite.setPosition(cart.body.position.x, cart.body.position.y);
            cart.sprite.setRotation(cart.body.angle);

            // If local player is driving this cart, send update
            var localP = state.players[localPlayerIndex];
            if (localP && localP.driving === cart && Golf.Networking) {
                Golf.Networking.sendCartUpdate(index, cart);
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
        physics: {
            default: 'matter',
            matter: { gravity: { y: 0 }, debug: false }
        },
        scene: { preload: preload, create: create, update: update }
    };

    new Phaser.Game(config);
})(typeof window !== 'undefined' ? window : this);

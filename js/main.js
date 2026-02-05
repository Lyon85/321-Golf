// 321 Golf - Chaotic Town Edition (script-tag build, no ES modules)
(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;

    function preload() {
        console.log('Phaser: Preloading assets...');
    }

    function create() {
        var scene = this;
        var WORLD_SIZE = 20000;
        var HALF_WORLD_SIZE = WORLD_SIZE / 2;

        state.game = scene.game;
        scene.matter.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
        scene.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

        scene.add
            .grid(HALF_WORLD_SIZE, HALF_WORLD_SIZE, WORLD_SIZE, WORLD_SIZE, 128, 128, 0x2ecc71)
            .setAltFillStyle(0x27ae60)
            .setOutlineStyle()
            .setDepth(-10);

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

        Golf.spawnClubs(scene);
        Golf.createHole(scene);
        Golf.createTerrains(scene);

        state.aimLine = scene.add.graphics().setDepth(10);
        state.hitConeGraphics = scene.add.graphics().setDepth(9);

        state.players.push(
            Golf.createPlayer(scene, HALF_WORLD_SIZE, HALF_WORLD_SIZE, 0xff4757, false)
        );
        state.players.push(
            Golf.createPlayer(scene, HALF_WORLD_SIZE + 100, HALF_WORLD_SIZE, 0x1e90ff, true)
        );
        state.players.push(
            Golf.createPlayer(scene, HALF_WORLD_SIZE - 100, HALF_WORLD_SIZE, 0xfeca57, true)
        );

        scene.keys = scene.input.keyboard.addKeys('W,A,S,D,SPACE,E,SHIFT,ONE,TWO');
        scene.cameras.main.startFollow(state.players[0].sprite, true, 0.1, 0.1);

        Golf.createGolfCart(scene, HALF_WORLD_SIZE + 200, HALF_WORLD_SIZE + 50);

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

    function update() {
        var scene = this;
        if (state.isWaitingToStart) return;
        if (scene.sinkCooldownFrames > 0) scene.sinkCooldownFrames--;

        Golf.updateHoleArrow(scene);

        if (state.isHost) {
            Golf.broadcastState(scene);
        } else {
            Golf.sendGuestInput(scene.keys);
        }

        state.players.forEach(function (p, index) {
            // Only the Host calculates physics/logic for AI and remote players
            if (state.isHost) {
                if (p.isAI) {
                    Golf.handleAIBehavior(scene, p);
                } else if (index === 0) {
                    // Local player 1
                    handleHumanInput(scene, p);
                } else if (index === 1 && state.connection) {
                    // Remote player 2 (the guest) handled on host via their inputs
                    handleRemotePlayerInput(scene, p);
                }
            } else {
                // If guest, only handle local player (index 1) input to send to host
                if (index === 1) {
                    handleHumanInput(scene, p);
                }
            }

            p.sprite.setPosition(p.body.position.x, p.body.position.y);
            p.ballSprite.setPosition(p.ball.position.x, p.ball.position.y);
            var bSpeed = Math.sqrt(p.ball.velocity.x * p.ball.velocity.x + p.ball.velocity.y * p.ball.velocity.y);
            p.trail.emitting = bSpeed > 2;

            if (p.inventory.length < 2) {
                state.clubs.forEach(function (c) {
                    if (
                        c.sprite.visible &&
                        Phaser.Math.Distance.Between(
                            p.body.position.x, p.body.position.y,
                            c.x, c.y
                        ) < 60
                    ) {
                        p.inventory.push(c.type);
                        if (!p.activeClub) p.activeClub = c.type;
                        c.sprite.visible = false;
                        c.txt.visible = false;
                        if (!p.isAI) Golf.updateClubUI(p);
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

            if (!p.isAI) {
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
                p.ballSprite.setPosition(p.driving.body.position.x, p.driving.body.position.y);
                scene.matter.body.setPosition(p.body, p.driving.body.position);
                scene.matter.body.setPosition(p.ball, p.driving.body.position);
                p.driving.sprite.setPosition(p.driving.body.position.x, p.driving.body.position.y);
                p.driving.sprite.setRotation(p.driving.body.angle);
            }

            state.golfCarts.forEach(function (cart) {
                cart.sprite.setPosition(cart.body.position.x, cart.body.position.y);
                cart.sprite.setRotation(cart.body.angle);
            });
        });
    }

    function handleHumanInput(scene, p) {
        if (p.driving) {
            Golf.handleDriving(scene, p);
        } else {
            Golf.handlePlayerMovement(scene, p);
            Golf.handleAiming(scene, p);
        }
    }

    function handleRemotePlayerInput(scene, p) {
        if (!p.remoteKeys) return;
        // Host uses Guest's keys to move the Guest's player object in the Host's physics world
        Golf.handlePlayerMovement(scene, p, p.remoteKeys);
        // TODO: Aiming for remote player
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

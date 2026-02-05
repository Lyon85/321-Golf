// 321 Golf - Chaotic Town Edition
const config = {
    type: Phaser.AUTO, width: window.innerWidth, height: window.innerHeight,
    parent: 'game-container',
    physics: { default: 'matter', matter: { gravity: { y: 0 }, debug: false } },
    scene: { preload: preload, create: create, update: update }
};

const game = new Phaser.Game(config);
let players = [], hole, holeSensor, holeArrow, clubs = [], golfCarts = [], currentHoleIndex = 0, isMatchActive = false, isWaitingToStart = true, aimLine, hitConeGraphics, particles;

// Collision Categories
const CAT_DEFAULT = 0x0001;
const CAT_PLAYER = 0x0002;
const CAT_BALL = 0x0004;
const CAT_BUILDING = 0x0010;
const CAT_CAR = 0x0020;
const CAT_HOLE = 0x0040;

const CLUB_TYPES = {
    DRIVER: { name: 'Driver', power: 0.015, accuracy: 0.7, color: 0xffd32a },
    IRON: { name: 'Iron', power: 0.009, accuracy: 0.95, color: 0xff3f34 },
    PUTTER: { name: 'Putter', power: 0.005, accuracy: 1.0, color: 0x0fbcf9 }
};

function preload() {
    console.log("Phaser: Preloading assets...");
}

function create() {
    console.log("Phaser: Creating scene...");
    const scene = this;
    const WORLD_SIZE = 20000;
    const HALF_WORLD_SIZE = WORLD_SIZE / 2;
    scene.matter.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    scene.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

    // Floor
    scene.add.grid(HALF_WORLD_SIZE, HALF_WORLD_SIZE, WORLD_SIZE, WORLD_SIZE, 128, 128, 0x2ecc71).setAltFillStyle(0x27ae60).setOutlineStyle();

    const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
    graphics.fillStyle(0xffffff, 1); graphics.fillCircle(8, 8, 8);
    graphics.generateTexture('white', 16, 16);

    particles = scene.add.particles(0, 0, 'white', {
        speed: { min: 40, max: 80 }, scale: { start: 0.4, end: 0 }, alpha: { start: 0.5, end: 0 }, lifespan: 500, frequency: -1, blendMode: 'ADD'
    });

    // createTown(scene);
    //spawnClubs(scene);
    const HOLE_RADIUS = 35;
    hole = scene.add.circle(0, 0, HOLE_RADIUS, 0x000000).setDepth(1).setStrokeStyle(6, 0x2c2c2c);
    scene.tweens.add({ targets: hole, scale: 1.2, duration: 800, yoyo: true, repeat: -1 });
    spawnHole(scene, true); // First hole near player start so ball can go in

    // Physics sensor so ball collides with hole and sinks (same size as visual)
    holeSensor = scene.matter.add.circle(hole.x, hole.y, HOLE_RADIUS, {
        isStatic: true,
        isSensor: true,
        label: 'hole',
        collisionFilter: {
            category: CAT_HOLE,
            mask: CAT_BALL
        }
    });

    scene.sinkCooldownFrames = 0;
    scene.matter.world.on('collisionactive', (event) => {
        if (!isMatchActive || scene.sinkCooldownFrames > 0) return;
        for (const pair of event.pairs) {
            const a = pair.bodyA, b = pair.bodyB;
            const holeBody = a.label === 'hole' ? a : b.label === 'hole' ? b : null;
            const ballBody = a.label === 'ball' ? a : b.label === 'ball' ? b : null;
            if (!holeBody || !ballBody) continue;
            const ballSpeed = Math.sqrt(ballBody.velocity.x ** 2 + ballBody.velocity.y ** 2);
            if (ballSpeed > 6) continue; // Only sink when moving slowly enough
            const player = players.find(p => p.ball === ballBody);
            if (player) {
                scene.sinkCooldownFrames = 90; // ~1.5s so we don't double-count
                onBallSunk(scene, player);
            }
            break;
        }
    });

    // Arrow pointing to hole (screen-space, fixed to camera)
    const arrowSize = 24;
    const arrowG = scene.make.graphics({ x: 0, y: 0, add: false });
    arrowG.fillStyle(0x2ed573, 1);
    arrowG.lineStyle(3, 0xffffff, 1);
    arrowG.beginPath();
    arrowG.moveTo(0, -arrowSize);
    arrowG.lineTo(-arrowSize * 0.7, arrowSize * 0.6);
    arrowG.lineTo(0, arrowSize * 0.3);
    arrowG.lineTo(arrowSize * 0.7, arrowSize * 0.6);
    arrowG.closePath();
    arrowG.fillPath();
    arrowG.strokePath();
    arrowG.generateTexture('holeArrow', arrowSize * 2.5, arrowSize * 2.5);
    holeArrow = scene.add.image(0, 0, 'holeArrow').setScrollFactor(0).setDepth(100);

    aimLine = scene.add.graphics().setDepth(10);
    hitConeGraphics = scene.add.graphics().setDepth(9);
    players.push(createPlayer(scene, HALF_WORLD_SIZE, HALF_WORLD_SIZE, 0xff4757, false));
    players.push(createPlayer(scene, HALF_WORLD_SIZE + 100, HALF_WORLD_SIZE, 0x1e90ff, true));
    players.push(createPlayer(scene, HALF_WORLD_SIZE - 100, HALF_WORLD_SIZE, 0xfeca57, true));

    scene.keys = scene.input.keyboard.addKeys('W,A,S,D,SPACE,E,SHIFT,ONE,TWO');
    scene.cameras.main.startFollow(players[0].sprite, true, 0.1, 0.1);

    // Initial Golf Cart near spawn
    createGolfCart(scene, HALF_WORLD_SIZE + 200, HALF_WORLD_SIZE + 50);

    scene.interactionText = scene.add.text(0, 0, '', { family: 'Outfit', fontSize: '18px', fill: '#fff', backgroundColor: '#000', padding: 5 }).setOrigin(0.5).setAlpha(0).setDepth(100);
    scene.powerMeterContainer = document.getElementById('power-meter-container');
    scene.powerMeterFill = document.getElementById('power-meter-fill');
    scene.countdownEl = document.getElementById('countdown');
    scene.holeDisplay = document.getElementById('current-hole');
    scene.speedometer = document.getElementById('speedometer');
    scene.speedValue = document.getElementById('speed-value');
    scene.clubSlots = [document.getElementById('club-1'), document.getElementById('club-2')];
    scene.overlay = document.getElementById('instruction-overlay');

    const startTrigger = () => {
        if (isWaitingToStart) {
            console.log("Start Triggered!");
            isWaitingToStart = false;
            if (scene.overlay) scene.overlay.style.display = 'none';
            startCountdown(scene);
        }
    };

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') startTrigger();
    });

    scene.overlay.addEventListener('click', startTrigger);
    scene.spaceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
}

function createPlayer(scene, x, y, color, isAI) {
    const pBody = scene.matter.add.rectangle(x, y, 32, 48, {
        friction: 0.1,
        frictionAir: 0.03, // Significantly reduced for more "glide" momentum
        label: 'player',
        collisionFilter: {
            category: CAT_PLAYER,
            mask: CAT_BUILDING | CAT_DEFAULT
        }
    });
    const pSprite = scene.add.rectangle(0, 0, 32, 48, color).setStrokeStyle(2, 0xffffff);

    const bBody = scene.matter.add.circle(x + 60, y, 8, {
        friction: 0.005,
        frictionAir: 0.01,
        restitution: 0.6,
        label: 'ball',
        collisionFilter: {
            category: CAT_BALL,
            mask: CAT_BUILDING | CAT_DEFAULT | CAT_HOLE
        }
    });
    const bSprite = scene.add.circle(0, 0, 8, 0xffffff).setStrokeStyle(1, 0x000000).setDepth(5);
    const trail = scene.add.particles(0, 0, 'white', { follow: bSprite, scale: { start: 0.5, end: 0 }, alpha: { start: 0.3, end: 0 }, lifespan: 300, tint: color, frequency: 50 });

    return {
        body: pBody, sprite: pSprite, ball: bBody, ballSprite: bSprite,
        isAI: isAI, color: color, isAiming: false, power: 0, powerDir: 1, aiTimer: 0,
        inventory: [], activeClub: null, trail: trail
    };
}

function spawnClubs(scene) {
    const types = Object.keys(CLUB_TYPES);
    for (let i = 0; i < 120; i++) {
        const type = CLUB_TYPES[types[Phaser.Math.Between(0, types.length - 1)]];
        const x = Phaser.Math.Between(1000, 19000), y = Phaser.Math.Between(1000, 19000);
        const sprite = scene.add.rectangle(x, y, 34, 34, type.color).setStrokeStyle(2, 0xffffff);
        const txt = scene.add.text(x, y, type.name.charAt(0), { family: 'Outfit', fontSize: '16px', fontStyle: 'bold', color: '#000' }).setOrigin(0.5);
        clubs.push({ sprite, txt, type, x, y });
        scene.tweens.add({ targets: [sprite, txt], y: y - 10, duration: 1000 + Math.random() * 500, yoyo: true, repeat: -1 });
    }
}

function createTown(scene) {
    for (let i = 0; i < 400; i++) {
        const x = Phaser.Math.Between(500, 19500), y = Phaser.Math.Between(500, 19500);
        if (Phaser.Math.Distance.Between(x, y, 10000, 10000) < 1000) continue;
        const w = Phaser.Math.Between(150, 500), h = Phaser.Math.Between(150, 500);
        scene.matter.add.rectangle(x, y, w, h, {
            isStatic: true,
            collisionFilter: {
                category: CAT_BUILDING,
                mask: CAT_PLAYER | CAT_BALL | CAT_DEFAULT
            }
        });
        scene.add.rectangle(x, y, w, h, 0x353b48).setStrokeStyle(6, 0x2f3640);
        for (let j = 0; j < 4; j++) scene.add.rectangle(x - w / 3 + (j % 2) * w / 1.5, y - h / 3 + Math.floor(j / 2) * h / 1.5, 30, 30, 0xfeca57, 0.6);
        if (Math.random() > 0.5) scene.add.circle(x + w / 2 + 50, y, 40, 0x2ed573).setStrokeStyle(4, 0x01a3a4);
    }
}

function spawnHole(scene, nearStart = false) {
    const HALF = 10000;
    let hx, hy;
    if (nearStart) {
        hx = HALF + Phaser.Math.Between(-200, 200);
        hy = HALF + Phaser.Math.Between(-200, 200);
    } else {
        hx = Phaser.Math.Between(1000, 19000);
        hy = Phaser.Math.Between(1000, 19000);
    }
    hole.setPosition(hx, hy);
    if (holeSensor) scene.matter.body.setPosition(holeSensor, { x: hx, y: hy });
}

function startCountdown(scene) {
    let count = 3; scene.countdownEl.classList.remove('hidden'); scene.countdownEl.innerText = count; isMatchActive = false;
    scene.time.addEvent({
        delay: 1000, repeat: 3, callback: () => {
            count--; if (count > 0) scene.countdownEl.innerText = count; else if (count === 0) { scene.countdownEl.innerText = "GOLF!"; scene.cameras.main.shake(500, 0.01); }
            else { scene.countdownEl.classList.add('hidden'); isMatchActive = true; }
        }
    });
}

function update() {
    const scene = this;
    if (isWaitingToStart) return;
    if (scene.sinkCooldownFrames > 0) scene.sinkCooldownFrames--;

    // Update hole arrow: place at screen edge pointing toward hole
    const cam = scene.cameras.main;
    const centerX = cam.scrollX + cam.width / 2;
    const centerY = cam.scrollY + cam.height / 2;
    const dx = hole.x - centerX;
    const dy = hole.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const margin = 70;
    const edgeDist = Math.min(cam.width, cam.height) / 2 - margin;
    const nx = dx / dist;
    const ny = dy / dist;
    holeArrow.setPosition(
        cam.width / 2 + nx * edgeDist,
        cam.height / 2 + ny * edgeDist
    );
    holeArrow.setRotation(Math.atan2(ny, nx) + Math.PI / 2);
    holeArrow.setVisible(dist > 80);

    players.forEach(p => {
        if (p.isAI) handleAIBehavior(scene, p); else handleHumanInput(scene, p);
        p.sprite.setPosition(p.body.position.x, p.body.position.y);
        p.ballSprite.setPosition(p.ball.position.x, p.ball.position.y);
        const bSpeed = Math.sqrt(p.ball.velocity.x ** 2 + p.ball.velocity.y ** 2);
        p.trail.emitting = bSpeed > 2;

        if (p.inventory.length < 2) {
            clubs.forEach(c => {
                if (c.sprite.visible && Phaser.Math.Distance.Between(p.body.position.x, p.body.position.y, c.x, c.y) < 60) {
                    p.inventory.push(c.type); if (!p.activeClub) p.activeClub = c.type;
                    c.sprite.visible = false; c.txt.visible = false; if (!p.isAI) updateClubUI(p);
                }
            });
        }

        // Club selection: 1 or 2 to switch active club
        if (!p.isAI && p.inventory.length >= 1) {
            if (Phaser.Input.Keyboard.JustDown(scene.keys.ONE) && p.inventory[0]) {
                p.activeClub = p.inventory[0];
                updateClubUI(p);
            } else if (Phaser.Input.Keyboard.JustDown(scene.keys.TWO) && p.inventory[1]) {
                p.activeClub = p.inventory[1];
                updateClubUI(p);
            }
        }

        // Golf Cart interaction check
        if (!p.isAI) {
            let nearCart = null;
            golfCarts.forEach(cart => {
                const dist = Phaser.Math.Distance.Between(p.body.position.x, p.body.position.y, cart.body.position.x, cart.body.position.y);
                if (dist < 80) nearCart = cart;
            });

            if (nearCart && !p.driving) {
                scene.interactionText.setPosition(p.body.position.x, p.body.position.y - 60).setText('Press E to Drive').setAlpha(1);
                if (Phaser.Input.Keyboard.JustDown(scene.keys.E)) {
                    enterCart(p, nearCart);
                }
            } else if (p.driving) {
                scene.interactionText.setPosition(p.body.position.x, p.body.position.y - 60).setText('Press E to Exit').setAlpha(1);
                if (Phaser.Input.Keyboard.JustDown(scene.keys.E)) {
                    exitCart(p);
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

        golfCarts.forEach(cart => {
            cart.sprite.setPosition(cart.body.position.x, cart.body.position.y);
            cart.sprite.setRotation(cart.body.angle);
        });
    });
}

function updateClubUI(p) {
    const scene = game.scene.scenes[0];
    p.inventory.forEach((club, i) => {
        const el = scene.clubSlots[i];
        el.innerText = club.name;
        el.classList.remove('empty', 'active');
        const isActive = p.activeClub === club;
        const colorHex = '#' + club.color.toString(16).padStart(6, '0');
        el.style.border = isActive ? `4px solid ${colorHex}` : `3px solid ${colorHex}`;
        el.style.boxShadow = isActive ? `0 0 12px ${colorHex}` : 'none';
        if (isActive) el.classList.add('active');
    });
}

function handleHumanInput(scene, p) {
    if (p.driving) {
        handleDriving(scene, p);
    } else {
        handlePlayerMovement(scene, p);
        handleAiming(scene, p);
    }
}

function handleAIBehavior(scene, p) {
    if (!isMatchActive) return; p.aiTimer++;
    const distToBall = Phaser.Math.Distance.Between(p.body.position.x, p.body.position.y, p.ball.position.x, p.ball.position.y);
    const distBallToHole = Phaser.Math.Distance.Between(p.ball.position.x, p.ball.position.y, hole.x, hole.y);
    if (!p.activeClub) p.activeClub = CLUB_TYPES.IRON;

    if (distToBall > 60) {
        const angle = Phaser.Math.Angle.Between(p.body.position.x, p.body.position.y, p.ball.position.x, p.ball.position.y);
        const force = 0.003; // Even slower AI movement
        scene.matter.body.applyForce(p.body, p.body.position, { x: Math.cos(angle) * force, y: Math.sin(angle) * force });
    } else {
        // Slow down when near ball
        const v = p.body.velocity;
        scene.matter.body.setVelocity(p.body, { x: v.x * 0.9, y: v.y * 0.9 });

        if (p.aiTimer % (150 + Math.random() * 100) === 0) {
            const angle = Phaser.Math.Angle.Between(p.ball.position.x, p.ball.position.y, hole.x, hole.y) + (Math.random() - 0.5) * 0.2;
            const club = p.activeClub;
            const forceMag = Phaser.Math.Clamp(distBallToHole / 8000 * club.power * 100, 0.003, club.power);
            scene.matter.body.applyForce(p.ball, p.ball.position, { x: Math.cos(angle) * forceMag, y: Math.sin(angle) * forceMag });
        }
    }
}

function handlePlayerMovement(scene, p) {
    let force = 0.004; // Significantly reduced for slower acceleration
    let speedCap = 3.5;

    if (p.isAiming) {
        force *= 0.25;  // Much slower when aiming
        speedCap *= 0.35;
    }

    const anyMove = scene.keys.W.isDown || scene.keys.S.isDown || scene.keys.A.isDown || scene.keys.D.isDown;
    if (p.isAiming && !anyMove) {
        // No inertia when aiming: stop immediately when keys released
        scene.matter.body.setVelocity(p.body, { x: 0, y: 0 });
    } else {
        if (scene.keys.W.isDown) scene.matter.body.applyForce(p.body, p.body.position, { x: 0, y: -force });
        if (scene.keys.S.isDown) scene.matter.body.applyForce(p.body, p.body.position, { x: 0, y: force });
        if (scene.keys.A.isDown) scene.matter.body.applyForce(p.body, p.body.position, { x: -force, y: 0 });
        if (scene.keys.D.isDown) scene.matter.body.applyForce(p.body, p.body.position, { x: force, y: 0 });

        // Speed Cap
        const speed = Math.sqrt(p.body.velocity.x ** 2 + p.body.velocity.y ** 2);
        if (speed > speedCap) {
            const ratio = speedCap / speed;
            scene.matter.body.setVelocity(p.body, { x: p.body.velocity.x * ratio, y: p.body.velocity.y * ratio });
        }
    }
}

function handleAiming(scene, p) {
    const MAX_HIT_DISTANCE = 300;
    const CONE_ANGLE = 60; // Degrees
    const isMouseDown = scene.input.activePointer.isDown;

    if (isMouseDown) {
        if (!p.isAiming) {
            p.isAiming = true;
            p.power = 0;
            p.powerDir = 1;
            scene.powerMeterContainer.classList.remove('hidden');
        }

        // Update power meter
        p.power += 2.5 * p.powerDir;
        if (p.power >= 100 || p.power <= 0) p.powerDir *= -1;
        scene.powerMeterFill.style.width = `${p.power}%`;

        // Calculate cone direction toward mouse
        const playerX = p.body.position.x;
        const playerY = p.body.position.y;
        const mouseAngle = Phaser.Math.Angle.Between(playerX, playerY, scene.input.activePointer.worldX, scene.input.activePointer.worldY);

        // Draw Hit Cone
        hitConeGraphics.clear();
        hitConeGraphics.fillStyle(0xffffff, 0.15);
        hitConeGraphics.beginPath();
        hitConeGraphics.moveTo(playerX, playerY);
        hitConeGraphics.arc(playerX, playerY, MAX_HIT_DISTANCE, mouseAngle - Phaser.Math.DegToRad(CONE_ANGLE / 2), mouseAngle + Phaser.Math.DegToRad(CONE_ANGLE / 2));
        hitConeGraphics.closePath();
        hitConeGraphics.fill();
        hitConeGraphics.lineStyle(2, 0xffffff, 0.3);
        hitConeGraphics.strokePath();

        // Check if ball is in cone
        const ballDist = Phaser.Math.Distance.Between(playerX, playerY, p.ball.position.x, p.ball.position.y);
        const ballAngle = Phaser.Math.Angle.Between(playerX, playerY, p.ball.position.x, p.ball.position.y);
        const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(ballAngle - mouseAngle));

        const isBallInCone = ballDist < MAX_HIT_DISTANCE && angleDiff < Phaser.Math.DegToRad(CONE_ANGLE / 2);

        aimLine.clear();
        if (isBallInCone) {
            const club = p.activeClub || CLUB_TYPES.IRON;
            const distFactor = ballDist / MAX_HIT_DISTANCE;
            const pwrMult = 1.0 - (distFactor * 0.5);

            aimLine.lineStyle(3, 0xffffff, 0.6);
            const shotAngle = Phaser.Math.Angle.Between(p.ball.position.x, p.ball.position.y, scene.input.activePointer.worldX, scene.input.activePointer.worldY);
            const len = (p.power / 100) * 800 * club.power * 100 * pwrMult;

            for (let i = 0; i < len; i += 25) {
                aimLine.lineBetween(
                    p.ball.position.x + Math.cos(shotAngle) * i,
                    p.ball.position.y + Math.sin(shotAngle) * i,
                    p.ball.position.x + Math.cos(shotAngle) * (i + 12),
                    p.ball.position.y + Math.sin(shotAngle) * (i + 12)
                );
            }
        }
    } else if (p.isAiming) {
        // Handle Release
        const playerX = p.body.position.x;
        const playerY = p.body.position.y;
        const mouseAngle = Phaser.Math.Angle.Between(playerX, playerY, scene.input.activePointer.worldX, scene.input.activePointer.worldY);
        const ballDist = Phaser.Math.Distance.Between(playerX, playerY, p.ball.position.x, p.ball.position.y);
        const ballAngle = Phaser.Math.Angle.Between(playerX, playerY, p.ball.position.x, p.ball.position.y);
        const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(ballAngle - mouseAngle));

        const isBallInCone = ballDist < MAX_HIT_DISTANCE && angleDiff < Phaser.Math.DegToRad(CONE_ANGLE / 2);

        if (isBallInCone) {
            const club = p.activeClub || CLUB_TYPES.IRON;
            const distFactor = ballDist / MAX_HIT_DISTANCE;

            // Statistics Calculation
            const pwrMult = 1.0 - (distFactor * 0.5);
            const accuracyDeviation = distFactor * Math.PI; // Up to 180 degrees
            const jitter = (Math.random() - 0.5) * accuracyDeviation;

            // SLICE! Popup for last 25% distance
            if (distFactor >= 0.75) {
                const sliceText = scene.add.text(playerX, playerY - 40, "SLICE!", {
                    family: 'Outfit', fontSize: '28px', fontStyle: '900', color: '#ff4757', stroke: '#ffffff', strokeThickness: 4
                }).setOrigin(0.5).setDepth(100);
                scene.tweens.add({
                    targets: sliceText,
                    y: playerY - 100,
                    alpha: 0,
                    duration: 1000,
                    onComplete: () => sliceText.destroy()
                });
            }

            const originalShotAngle = Phaser.Math.Angle.Between(p.ball.position.x, p.ball.position.y, scene.input.activePointer.worldX, scene.input.activePointer.worldY);
            const finalShotAngle = originalShotAngle + jitter;

            const finalForce = (p.power / 100) * club.power * pwrMult;

            scene.matter.body.applyForce(p.ball, p.ball.position, {
                x: Math.cos(finalShotAngle) * finalForce,
                y: Math.sin(finalShotAngle) * finalForce
            });

            scene.cameras.main.shake(200, 0.005);
        }

        // Cleanup
        p.isAiming = false;
        p.power = 0;
        scene.powerMeterContainer.classList.add('hidden');
        aimLine.clear();
        hitConeGraphics.clear();
    }
}

function createGolfCart(scene, x, y) {
    const body = scene.matter.add.rectangle(x, y, 60, 100, {
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

    const sprite = scene.add.container(x, y);
    const base = scene.add.rectangle(0, 0, 60, 100, 0xf1c40f).setStrokeStyle(4, 0x000000);
    const roof = scene.add.rectangle(0, -10, 56, 70, 0xffffff, 0.8).setStrokeStyle(2, 0x000000);
    const seat = scene.add.rectangle(0, 25, 50, 20, 0x34495e);
    const wheel1 = scene.add.rectangle(-32, -35, 12, 24, 0x2c3e50);
    const wheel2 = scene.add.rectangle(32, -35, 12, 24, 0x2c3e50);
    const wheel3 = scene.add.rectangle(-32, 35, 12, 24, 0x2c3e50);
    const wheel4 = scene.add.rectangle(32, 35, 12, 24, 0x2c3e50);

    sprite.add([wheel1, wheel2, wheel3, wheel4, base, seat, roof]);
    const cart = { body, sprite };
    golfCarts.push(cart);
    return cart;
}

function enterCart(p, cart) {
    p.driving = cart;
    p.sprite.setAlpha(0.7);
    p.ballSprite.setAlpha(0);
    if (!p.isAI) game.scene.scenes[0].speedometer.classList.remove('hidden');
}

function exitCart(p) {
    const cart = p.driving;
    p.driving = null;
    p.sprite.setAlpha(1);
    p.ballSprite.setAlpha(1);
    if (!p.isAI) game.scene.scenes[0].speedometer.classList.add('hidden');
    // Pop out slightly to the side
    const exitAngle = cart.body.angle + Math.PI / 2;
    game.scene.scenes[0].matter.body.setPosition(p.body, {
        x: cart.body.position.x + Math.cos(exitAngle) * 60,
        y: cart.body.position.y + Math.sin(exitAngle) * 60
    });
}

function handleDriving(scene, p) {
    const cart = p.driving;
    const isTurbo = scene.keys.SHIFT.isDown;

    // Initialize or update turbo ramp (0 to 1 over 1 second)
    if (!p.turboRamp) p.turboRamp = 0;
    if (isTurbo && scene.keys.W.isDown) {
        p.turboRamp = Math.min(1, p.turboRamp + 0.016); // ~60fps, 1 second to reach 1
    } else if (!isTurbo) {
        p.turboRamp = Math.max(0, p.turboRamp - 0.032); // Cools down twice as fast
    }

    // Speed 1: 6, Speed 2: 7.5 (25% increase from 6)
    const baseMax = 6;
    const turboBoost = 1.5; // 7.5 - 6
    const currentMax = baseMax + (turboBoost * p.turboRamp);

    // Further reduced forces for significant momentum time
    const baseForce = 0.012;
    const turboForceBoost = 0.008;
    const force = baseForce + (turboForceBoost * p.turboRamp);

    const torque = 1.6;
    const angle = cart.body.angle - Math.PI / 2;

    if (scene.keys.W.isDown) {
        scene.matter.body.applyForce(cart.body, cart.body.position, {
            x: Math.cos(angle) * force,
            y: Math.sin(angle) * force
        });
    }
    if (scene.keys.S.isDown) {
        // Very low braking force for long momentum stop
        scene.matter.body.applyForce(cart.body, cart.body.position, {
            x: -Math.cos(angle) * (force * 0.3),
            y: -Math.sin(angle) * (force * 0.3)
        });
    }

    const velocity = Math.sqrt(cart.body.velocity.x ** 2 + cart.body.velocity.y ** 2);
    if (velocity > 0.5) {
        const turnDir = scene.keys.S.isDown ? -1 : 1;
        if (scene.keys.A.isDown) cart.body.torque = -torque * turnDir;
        if (scene.keys.D.isDown) cart.body.torque = torque * turnDir;
    }

    // Dynamic Speed Cap
    if (velocity > currentMax) {
        const ratio = currentMax / velocity;
        scene.matter.body.setVelocity(cart.body, { x: cart.body.velocity.x * ratio, y: cart.body.velocity.y * ratio });
    }

    // Update Speedometer UI
    if (!p.isAI) {
        const displaySpeed = Math.floor(velocity * 10); // Scaled for better visual
        scene.speedValue.innerText = displaySpeed;
        if (isTurbo) scene.speedometer.classList.add('fast');
        else scene.speedometer.classList.remove('fast');
    }
}

function onBallSunk(scene, p) {
    if (p.isAI) { spawnHole(scene); return; }
    currentHoleIndex++; scene.holeDisplay.innerText = currentHoleIndex;
    scene.cameras.main.flash(500, 0, 255, 0);
    if (currentHoleIndex >= 10) { alert("ROUND OVER! You finished 10 holes!"); window.location.reload(); }
    else spawnHole(scene);
}

(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;
    var CAT_TERRAIN = Golf.CAT_TERRAIN;
    var CAT_PLAYER = Golf.CAT_PLAYER;
    var CAT_BALL = Golf.CAT_BALL;
    var TERRAIN_TYPES = Golf.TERRAIN_TYPES;

    function generateTerrainTextures(scene) {
        // Long Grass Texture
        var grassCanvas = scene.textures.createCanvas('long_grass', 64, 64);
        var grassCtx = grassCanvas.getContext();
        grassCtx.fillStyle = '#6B8E23'; // OliveDrab
        grassCtx.fillRect(0, 0, 64, 64);
        for (var i = 0; i < 20; i++) {
            grassCtx.strokeStyle = '#556B2F'; // DarkOliveGreen
            grassCtx.lineWidth = 2;
            var x = Math.random() * 64;
            var y = Math.random() * 64;
            grassCtx.beginPath();
            grassCtx.moveTo(x, y);
            grassCtx.lineTo(x + (Math.random() - 0.5) * 10, y - 10); // Vertical strokes
            grassCtx.stroke();
        }
        grassCanvas.update();

        // Water Texture
        var waterCanvas = scene.textures.createCanvas('water', 64, 64);
        var waterCtx = waterCanvas.getContext();
        waterCtx.fillStyle = '#0984e3'; // Vibrant Blue (Electron Blue)
        waterCtx.fillRect(0, 0, 64, 64);
        waterCtx.strokeStyle = '#74b9ff'; // Lighter Blue
        waterCtx.lineWidth = 3;
        for (var i = 0; i < 4; i++) {
            waterCtx.beginPath();
            waterCtx.moveTo(0, Math.random() * 64);
            waterCtx.bezierCurveTo(
                Math.random() * 32, Math.random() * 64,
                Math.random() * 32 + 32, Math.random() * 64,
                64, Math.random() * 64
            );
            waterCtx.stroke();
        }
        waterCanvas.update();
    }

    Golf.createTerrains = function (scene) {
        var WORLD_SIZE = 20000;

        // Generate Terrain Textures
        generateTerrainTextures(scene);

        // Add random patches of long grass and water
        for (var i = 0; i < 60; i++) {
            var type = Math.random() > 0.4 ? TERRAIN_TYPES.LONG_GRASS : TERRAIN_TYPES.WATER;
            var w = Phaser.Math.Between(600, 1500); // Slightly larger patches
            var h = Phaser.Math.Between(600, 1500);
            var x = Phaser.Math.Between(1000, WORLD_SIZE - 1000);
            var y = Phaser.Math.Between(1000, WORLD_SIZE - 1000);

            // Avoid spawning on center
            if (Phaser.Math.Distance.Between(x, y, 10000, 10000) < 1500) continue;

            var sensor = scene.matter.add.rectangle(x, y, w, h, {
                isStatic: true,
                isSensor: true,
                label: type.label,
                collisionFilter: {
                    category: CAT_TERRAIN,
                    mask: CAT_PLAYER | CAT_BALL
                }
            });

            // Use TileSprite for repeating pattern
            var rect = scene.add.tileSprite(x, y, w, h, type.label)
                .setAlpha(0.9) // More opaque
                .setDepth(-5); // Above grid (-10) but below everything else

            state.terrains.push({ sensor: sensor, graphics: rect, type: type });

            // Animate water
            if (type.label === 'water') {
                scene.tweens.add({
                    targets: rect,
                    tilePositionX: 64,
                    duration: 2000,
                    repeat: -1
                });
            }
        }

        scene.matter.world.on('collisionstart', function (event) {
            event.pairs.forEach(function (pair) {
                var bodyA = pair.bodyA;
                var bodyB = pair.bodyB;

                var terrainBody = bodyA.label === 'long_grass' || bodyA.label === 'water' ? bodyA :
                    (bodyB.label === 'long_grass' || bodyB.label === 'water' ? bodyB : null);
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

                var terrainBody = bodyA.label === 'long_grass' || bodyA.label === 'water' ? bodyA :
                    (bodyB.label === 'long_grass' || bodyB.label === 'water' ? bodyB : null);
                var otherBody = terrainBody === bodyA ? bodyB : bodyA;

                if (terrainBody && (otherBody.label === 'player' || otherBody.label === 'ball')) {
                    removeTerrainEffect(scene, otherBody);
                }
            });
        });
    };

    function applyTerrainEffect(scene, body, terrainLabel) {
        var type = terrainLabel === 'long_grass' ? TERRAIN_TYPES.LONG_GRASS : TERRAIN_TYPES.WATER;

        // Save base friction if not set
        if (body.baseFrictionAir === undefined) {
            body.baseFrictionAir = body.frictionAir;
        }

        body.frictionAir = type.frictionAir;

        if (body.label === 'ball' && terrainLabel === 'water') {
            handleWaterHazard(scene, body);
        }
    }

    function removeTerrainEffect(scene, body) {
        if (body.baseFrictionAir !== undefined) {
            body.frictionAir = body.baseFrictionAir;
        }
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

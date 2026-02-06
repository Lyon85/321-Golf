(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;
    var CAT_HOLE = Golf.CAT_HOLE;
    var CAT_BALL = Golf.CAT_BALL;

    var HOLE_RADIUS = 35;

    function createHoleArrow(scene) {
        var arrowSize = 24;
        var arrowG = scene.make.graphics({ x: 0, y: 0, add: false });
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
        state.holeArrow = scene.add.image(0, 0, 'holeArrow').setScrollFactor(0).setDepth(100);
    }

    Golf.createHole = function (scene) {
        state.hole = scene.add
            .circle(0, 0, HOLE_RADIUS, 0x000000)
            .setDepth(1)
            .setStrokeStyle(6, 0x2c2c2c);
        scene.tweens.add({
            targets: state.hole,
            scale: 1.2,
            duration: 800,
            yoyo: true,
            repeat: -1
        });
        Golf.spawnHole(scene);

        state.holeSensor = scene.matter.add.circle(state.hole.x, state.hole.y, HOLE_RADIUS, {
            isStatic: true,
            isSensor: true,
            label: 'hole',
            collisionFilter: {
                category: CAT_HOLE,
                mask: CAT_BALL
            }
        });

        scene.sinkCooldownFrames = 0;
        scene.matter.world.on('collisionactive', function (event) {
            if (!state.isMatchActive || scene.sinkCooldownFrames > 0) return;
            for (var i = 0; i < event.pairs.length; i++) {
                var pair = event.pairs[i];
                var a = pair.bodyA;
                var b = pair.bodyB;
                var holeBody = a.label === 'hole' ? a : b.label === 'hole' ? b : null;
                var ballBody = a.label === 'ball' ? a : b.label === 'ball' ? b : null;
                if (!holeBody || !ballBody) continue;
                var ballSpeed = Math.sqrt(ballBody.velocity.x * ballBody.velocity.x + ballBody.velocity.y * ballBody.velocity.y);
                if (ballSpeed > 6) continue;

                var player = state.players.find(function (p) { return p.ball === ballBody; });
                if (player && player.ballHeight < 5) {
                    scene.sinkCooldownFrames = 90;
                    Golf.onBallSunk(scene, player);
                }
                break;
            }
        });

        createHoleArrow(scene);
    };

    Golf.spawnHole = function (scene, forceX, forceY) {
        // If coordinates provided (from Server), use them directly
        if (forceX !== undefined && forceY !== undefined) {
            state.hole.setPosition(forceX, forceY);
            if (state.holeSensor) {
                scene.matter.body.setPosition(state.holeSensor, { x: forceX, y: forceY });
            }
            console.log("Hole synced to: " + forceX + ", " + forceY);
            Golf.updateHoleArrow(scene);
            return;
        }

        // Host-Authoritative Logic:
        // Only Host (myPlayerId === 0) or Singleplayer (myPlayerId === null) generates holes.
        // Guests do nothing but wait for 'holeUpdate'.
        var isHost = (state.myPlayerId === 0 || state.myPlayerId === null);

        if (!isHost) {
            console.log("Guest: Waiting for hole update from Host...");
            return;
        }

        var config = Golf.MAP_CONFIG;
        var worldWidth = config.cols * config.tileSize;
        var worldHeight = config.rows * config.tileSize;

        // Use player spawn as reference for minimum distance
        var refX = state.spawnPoint ? state.spawnPoint.x : worldWidth / 2;
        var refY = state.spawnPoint ? state.spawnPoint.y : worldHeight / 2;

        var hx, hy, dist;
        // Dynamic min distance: 30% of map width or at least 500px
        var minDistance = Math.max(500, worldWidth * 0.3);
        var margin = 50; // Keep away from the very edge of tiles

        var attempts = 0;
        do {
            hx = Phaser.Math.Between(margin, worldWidth - margin);
            hy = Phaser.Math.Between(margin, worldHeight - margin);
            dist = Phaser.Math.Distance.Between(refX, refY, hx, hy);

            // Check if this spot is on water
            var gridC = Math.floor(hx / config.tileSize);
            var gridR = Math.floor(hy / config.tileSize);
            var isWater = false;
            if (state.mapGrid && state.mapGrid[gridR] && state.mapGrid[gridR][gridC]) {
                isWater = state.mapGrid[gridR][gridC].type === 'water';
            }

            attempts++;
        } while ((dist < minDistance || isWater) && attempts < 100);

        state.hole.setPosition(hx, hy);
        if (state.holeSensor) {
            scene.matter.body.setPosition(state.holeSensor, { x: hx, y: hy });
        }
        console.log("Hole spawned at: " + hx + ", " + hy + " (dist from spawn: " + dist.toFixed(0) + ")");

        // Broadcast new position if Multiplayer
        if (Golf.Networking && Golf.Networking.sendHoleUpdate && state.myPlayerId !== null) {
            Golf.Networking.sendHoleUpdate(hx, hy);
        }
    };

    Golf.updateHoleArrow = function (scene) {
        var cam = scene.cameras.main;
        var dx = state.hole.x - (cam.scrollX + cam.width / 2);
        var dy = state.hole.y - (cam.scrollY + cam.height / 2);
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var margin = 70;
        var edgeDist = Math.min(cam.width, cam.height) / 2 - margin;
        var nx = dx / dist;
        var ny = dy / dist;
        state.holeArrow.setPosition(cam.width / 2 + nx * edgeDist, cam.height / 2 + ny * edgeDist);
        state.holeArrow.setRotation(Math.atan2(ny, nx) + Math.PI / 2);
        state.holeArrow.setVisible(dist > 80);
    };

    Golf.onBallSunk = function (scene, p) {
        if (p.isAI) {
            Golf.spawnHole(scene);
            return;
        }
        state.currentHoleIndex++;
        scene.holeDisplay.innerText = state.currentHoleIndex;
        scene.cameras.main.flash(500, 0, 255, 0);
        if (state.currentHoleIndex >= 10) {
            alert('ROUND OVER! You finished 10 holes!');
            window.location.reload();
        } else {
            // Updated Hole Generation Logic:
            var isHost = (state.myPlayerId === 0 || state.myPlayerId === null);
            if (isHost) {
                Golf.spawnHole(scene);
            } else {
                // Request Host to spawn new hole
                if (Golf.Networking && Golf.Networking.requestNewHole) {
                    Golf.Networking.requestNewHole();
                }
            }
        }
    };
})(typeof window !== 'undefined' ? window : this);

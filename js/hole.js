(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;
    var CAT_HOLE = Golf.CAT_HOLE;
    var CAT_BALL = Golf.CAT_BALL;

    var HOLE_RADIUS = 45;

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

        createHoleArrow(scene);

        state.holeSensor = scene.matter.add.circle(0, 0, HOLE_RADIUS, {
            isStatic: true,
            isSensor: true,
            label: 'hole',
            collisionFilter: {
                category: CAT_HOLE,
                mask: CAT_BALL
            }
        });

        // Now that sensor exists, spawn it at the right place
        Golf.spawnHole(scene);

        scene.sinkCooldownFrames = 0;
        scene.matter.world.on('collisionactive', function (event) {
            if (scene.sinkCooldownFrames > 0) return;

            for (var i = 0; i < event.pairs.length; i++) {
                var pair = event.pairs[i];
                var a = pair.bodyA;
                var b = pair.bodyB;

                var holeBody = a.label === 'hole' ? a : b.label === 'hole' ? b : null;
                var ballBody = a.label === 'ball' ? a : b.label === 'ball' ? b : null;

                if (holeBody && ballBody) {
                    if (!state.isMatchActive) {
                        // Suppress logs unless explicitly practicing, maybe add a hint
                        continue;
                    }

                    var bSpeed = Math.sqrt(ballBody.velocity.x * ballBody.velocity.x + ballBody.velocity.y * ballBody.velocity.y);
                    if (bSpeed > 10) continue;

                    var player = state.players.find(function (p) { return p.ball === ballBody; });
                    if (player && player.ballHeight < 5) {
                        // Debounce by checking if we already started sinking for this specific hole index
                        if (scene.lastSunkIndex === state.currentHoleIndex) return;
                        scene.lastSunkIndex = state.currentHoleIndex;

                        console.log("BALL SUNK! P" + player.playerIndex + " putted hole #" + state.currentHoleIndex);
                        scene.sinkCooldownFrames = 90;
                        Golf.onBallSunk(scene, player);
                    }
                    break;
                }
            }
        });
    };

    Golf.spawnHole = function (scene, forceX, forceY) {
        // Use predetermined hole positions from the map
        if (!state.holePositions || state.holePositions.length === 0) {
            console.warn('Map data not ready yet, retrying spawnHole in 100ms...');
            setTimeout(function () {
                Golf.spawnHole(scene, forceX, forceY);
            }, 100);
            return;
        }

        var hx, hy;

        // If coordinates provided (from Server), use them directly
        if (forceX !== undefined && forceY !== undefined) {
            hx = forceX;
            hy = forceY;
            console.log("Hole Sync (Forced): " + hx + ", " + hy);
        } else {
            // Host-Authoritative Logic:
            // Only Host (myPlayerId === 0) or Singleplayer (myPlayerId === null) generates holes.
            // Guests do nothing but wait for 'holeUpdate'.
            var isHost = (state.myPlayerId === 0 || state.myPlayerId === null);
            if (!isHost) {
                console.log("Guest: Waiting for hole update from Host...");
                return;
            }

            // Select a random hole position
            var randomIndex = Phaser.Math.Between(0, state.holePositions.length - 1);
            var holePos = state.holePositions[randomIndex];
            hx = holePos.x;
            hy = holePos.y;
            console.log("Hole Spawn (New Random): " + hx + ", " + hy + " (idx: " + randomIndex + ")");

            // Broadcast new position if Multiplayer
            if (Golf.Networking && Golf.Networking.sendHoleUpdate && state.myPlayerId !== null) {
                Golf.Networking.sendHoleUpdate(hx, hy);
            }
        }

        state.hole.setPosition(hx, hy);
        if (state.holeSensor) {
            scene.matter.body.setPosition(state.holeSensor, { x: hx, y: hy });
        }

        // Update UI if available
        if (scene.holeDisplay) {
            scene.holeDisplay.textContent = 'Hole: ' + state.currentHoleIndex;
        }

        Golf.updateHoleArrow(scene);
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

    Golf.syncHoleSunk = function (scene, newIndex) {
        console.log("Golf.syncHoleSunk called! New Index:", newIndex, "Current:", state.currentHoleIndex);

        state.currentHoleIndex = newIndex;
        if (scene.holeDisplay) {
            scene.holeDisplay.innerText = 'Hole: ' + state.currentHoleIndex;
        }

        // Green flash and camera shake for success
        scene.cameras.main.flash(500, 0, 255, 0);
        scene.cameras.main.shake(200, 0.005);

        if (state.currentHoleIndex > 10) {
            console.log("Match Complete! 10 holes reached.");
            setTimeout(function () {
                alert('ROUND OVER! 10 holes completed!');
                window.location.reload();
            }, 1000);
        } else {
            // When a hole is sunk, the host picks the next one.
            var isHost = (state.myPlayerId === 0 || state.myPlayerId === null);
            if (isHost) {
                console.log("Host: Spawning next hole for current index " + state.currentHoleIndex);
                Golf.spawnHole(scene);
            } else {
                console.log("Guest: Waiting for holeUpdate from Host...");
            }
        }
    };

    Golf.onBallSunk = function (scene, p) {
        if (p.isAI) {
            Golf.spawnHole(scene);
            return;
        }

        console.log("Golf.onBallSunk triggered for P" + p.playerIndex);

        // Multiplayer: Tell server someone sunk it.
        if (Golf.Networking && Golf.Networking.sendHoleSunk && state.myPlayerId !== null) {
            console.log("Multiplayer: Sending holeSunk to server...");
            Golf.Networking.sendHoleSunk();
        } else {
            console.log("Singleplayer: Advancing hole locally...");
            Golf.syncHoleSunk(scene, state.currentHoleIndex + 1);
        }
    };
})(typeof window !== 'undefined' ? window : this);

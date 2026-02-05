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
                if (player) {
                    scene.sinkCooldownFrames = 90;
                    Golf.onBallSunk(scene, player);
                }
                break;
            }
        });

        createHoleArrow(scene);
    };

    Golf.spawnHole = function (scene) {
        var HALF = 10000;
        var hx, hy, dist;
        var minDistance = 3000;

        do {
            hx = Phaser.Math.Between(1000, 19000);
            hy = Phaser.Math.Between(1000, 19000);
            dist = Phaser.Math.Distance.Between(HALF, HALF, hx, hy);
        } while (dist < minDistance);

        state.hole.setPosition(hx, hy);
        if (state.holeSensor) {
            scene.matter.body.setPosition(state.holeSensor, { x: hx, y: hy });
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
            Golf.spawnHole(scene);
        }
    };
})(typeof window !== 'undefined' ? window : this);

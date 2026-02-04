(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;
    var CLUB_TYPES = Golf.CLUB_TYPES;

    Golf.handleAiming = function (scene, p) {
        var MAX_HIT_DISTANCE = 300;
        var CONE_ANGLE = 60;
        var playerX, playerY, ballDist, ballAngle, mouseAngle, angleDiff, isBallInCone;
        var isMouseDown = scene.input.activePointer.isDown;

        if (isMouseDown) {
            if (!p.isAiming) {
                p.isAiming = true;
                p.power = 0;
                p.powerDir = 1;
                scene.powerMeterContainer.classList.remove('hidden');
            }

            p.power += 2.5 * p.powerDir;
            if (p.power >= 100 || p.power <= 0) p.powerDir *= -1;
            scene.powerMeterFill.style.width = p.power + '%';

            var playerX = p.body.position.x;
            var playerY = p.body.position.y;
            var mouseAngle = Phaser.Math.Angle.Between(
                playerX,
                playerY,
                scene.input.activePointer.worldX,
                scene.input.activePointer.worldY
            );

            state.hitConeGraphics.clear();
            state.hitConeGraphics.fillStyle(0xffffff, 0.15);
            state.hitConeGraphics.beginPath();
            state.hitConeGraphics.moveTo(playerX, playerY);
            state.hitConeGraphics.arc(
                playerX,
                playerY,
                MAX_HIT_DISTANCE,
                mouseAngle - Phaser.Math.DegToRad(CONE_ANGLE / 2),
                mouseAngle + Phaser.Math.DegToRad(CONE_ANGLE / 2)
            );
            state.hitConeGraphics.closePath();
            state.hitConeGraphics.fill();
            state.hitConeGraphics.lineStyle(2, 0xffffff, 0.3);
            state.hitConeGraphics.strokePath();

            var ballDist = Phaser.Math.Distance.Between(
                playerX, playerY,
                p.ball.position.x, p.ball.position.y
            );
            var ballAngle = Phaser.Math.Angle.Between(
                playerX, playerY,
                p.ball.position.x, p.ball.position.y
            );
            var angleDiff = Math.abs(Phaser.Math.Angle.Wrap(ballAngle - mouseAngle));
            var isBallInCone =
                ballDist < MAX_HIT_DISTANCE &&
                angleDiff < Phaser.Math.DegToRad(CONE_ANGLE / 2);

            state.aimLine.clear();
            if (isBallInCone) {
                var club = p.activeClub || CLUB_TYPES.IRON;
                var distFactor = ballDist / MAX_HIT_DISTANCE;
                var pwrMult = 1.0 - distFactor * 0.5;

                state.aimLine.lineStyle(3, 0xffffff, 0.6);
                var shotAngle = Phaser.Math.Angle.Between(
                    p.ball.position.x, p.ball.position.y,
                    scene.input.activePointer.worldX,
                    scene.input.activePointer.worldY
                );
                var len = (p.power / 100) * 800 * club.power * 100 * pwrMult;

                for (var i = 0; i < len; i += 25) {
                    state.aimLine.lineBetween(
                        p.ball.position.x + Math.cos(shotAngle) * i,
                        p.ball.position.y + Math.sin(shotAngle) * i,
                        p.ball.position.x + Math.cos(shotAngle) * (i + 12),
                        p.ball.position.y + Math.sin(shotAngle) * (i + 12)
                    );
                }
            }
        } else if (p.isAiming) {
            playerX = p.body.position.x;
            playerY = p.body.position.y;
            ballDist = Phaser.Math.Distance.Between(
                playerX, playerY,
                p.ball.position.x, p.ball.position.y
            );
            ballAngle = Phaser.Math.Angle.Between(
                playerX, playerY,
                p.ball.position.x, p.ball.position.y
            );
            mouseAngle = Phaser.Math.Angle.Between(
                playerX, playerY,
                scene.input.activePointer.worldX,
                scene.input.activePointer.worldY
            );
            angleDiff = Math.abs(Phaser.Math.Angle.Wrap(ballAngle - mouseAngle));
            isBallInCone =
                ballDist < MAX_HIT_DISTANCE &&
                angleDiff < Phaser.Math.DegToRad(CONE_ANGLE / 2);

            if (isBallInCone) {
                var club = p.activeClub || CLUB_TYPES.IRON;
                var distFactor = ballDist / MAX_HIT_DISTANCE;
                var pwrMult = 1.0 - distFactor * 0.5;
                var accuracyDeviation = distFactor * Math.PI;
                var jitter = (Math.random() - 0.5) * accuracyDeviation;

                if (distFactor >= 0.75) {
                    var sliceText = scene.add.text(playerX, playerY - 40, 'SLICE!', {
                        family: 'Outfit',
                        fontSize: '28px',
                        fontStyle: '900',
                        color: '#ff4757',
                        stroke: '#ffffff',
                        strokeThickness: 4
                    }).setOrigin(0.5).setDepth(100);
                    scene.tweens.add({
                        targets: sliceText,
                        y: playerY - 100,
                        alpha: 0,
                        duration: 1000,
                        onComplete: function () { sliceText.destroy(); }
                    });
                }

                var originalShotAngle = Phaser.Math.Angle.Between(
                    p.ball.position.x, p.ball.position.y,
                    scene.input.activePointer.worldX,
                    scene.input.activePointer.worldY
                );
                var finalShotAngle = originalShotAngle + jitter;
                var finalForce = (p.power / 100) * club.power * pwrMult;

                scene.matter.body.applyForce(p.ball, p.ball.position, {
                    x: Math.cos(finalShotAngle) * finalForce,
                    y: Math.sin(finalShotAngle) * finalForce
                });

                scene.cameras.main.shake(200, 0.005);
            }

            p.isAiming = false;
            p.power = 0;
            scene.powerMeterContainer.classList.add('hidden');
            state.aimLine.clear();
            state.hitConeGraphics.clear();
        }
    };
})(typeof window !== 'undefined' ? window : this);

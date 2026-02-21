(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;
    var CLUB_TYPES = Golf.CLUB_TYPES;

    Golf.handleAiming = function (scene, p, pointer) {
        var MAX_HIT_DISTANCE = 180;
        var CONE_ANGLE = 60;
        var playerX, playerY, ballDist, ballAngle, mouseAngle, angleDiff, isBallInCone;

        // Use provided pointer (remote) or scene active pointer (local)
        var activePointer = pointer || scene.input.activePointer;
        var isMouseDown = activePointer.leftButtonDown();
        var isRightDown = activePointer.rightButtonDown();
        var isLocal = !pointer;

        if (isLocal && isRightDown) {
            state.inspectPoint = Golf.fromIsometric(activePointer.worldX, activePointer.worldY);
        }

        if (isMouseDown) {
            if (!p.isAiming) {
                if (!p.activeClub) {
                    if (isLocal && (!scene.lastNoClubTime || scene.time.now - scene.lastNoClubTime > 1000)) {
                        var noClubText = scene.add.text(p.body.position.x, p.body.position.y - 40, 'NO CLUB!', {
                            family: 'Outfit',
                            fontSize: '24px',
                            fontStyle: '900',
                            color: '#ff4757',
                            stroke: '#ffffff',
                            strokeThickness: 4
                        }).setOrigin(0.5).setDepth(100);
                        scene.tweens.add({
                            targets: noClubText,
                            y: p.body.position.y - 80,
                            alpha: 0,
                            duration: 1000,
                            onComplete: function () { noClubText.destroy(); }
                        });
                        scene.lastNoClubTime = scene.time.now;
                    }
                    return;
                }
                p.isAiming = true;
                p.state = Golf.PLAYER_STATES.SWINGING;
                p.swingState = Golf.SWING_STATES.BACKSWING;
                p.power = 0;
                p.powerDir = 1;
                if (isLocal) scene.powerMeterContainer.classList.remove('hidden');
            }

            p.power += 1.25 * p.powerDir;
            if (p.power >= 100 || p.power <= 0) p.powerDir *= -1;
            if (isLocal) scene.powerMeterFill.style.width = p.power + '%';

            var playerX = p.body.position.x;
            var playerY = p.body.position.y;

            var worldMouse = Golf.fromIsometric(activePointer.worldX, activePointer.worldY);
            var mouseAngle = Phaser.Math.Angle.Between(
                playerX,
                playerY,
                worldMouse.x,
                worldMouse.y
            );
            p.aimAngle = mouseAngle; // Store for visuals

            // Update direction to face the ball/aim point
            var deg = Phaser.Math.RadToDeg(mouseAngle);
            if (deg > -45 && deg <= 45) p.direction = Golf.DIRECTIONS.E;
            else if (deg > 45 && deg <= 135) p.direction = Golf.DIRECTIONS.S;
            else if (deg > 135 || deg <= -135) p.direction = Golf.DIRECTIONS.W;
            else p.direction = Golf.DIRECTIONS.N;

            // Only draw cone for local player if left or right click is held
            if (isLocal) {
                state.hitConeGraphics.clear();
                if (isMouseDown || isRightDown) {
                    var elev = Golf.getElevationAt(playerX, playerY);
                    var pIso = Golf.toIsometric(playerX, playerY);

                    state.hitConeGraphics.fillStyle(0xffffff, 0.15);
                    state.hitConeGraphics.lineStyle(2, 0xffffff, 0.3);

                    // Drawing an isometric arc is complex with just .arc()
                    // We'll draw it manually with vertices to handle the isometric squish
                    state.hitConeGraphics.beginPath();
                    state.hitConeGraphics.moveTo(pIso.x, pIso.y - elev);

                    var startAngle = mouseAngle - Phaser.Math.DegToRad(CONE_ANGLE / 2);
                    var endAngle = mouseAngle + Phaser.Math.DegToRad(CONE_ANGLE / 2);
                    var steps = 10;

                    for (var i = 0; i <= steps; i++) {
                        var angle = startAngle + (endAngle - startAngle) * (i / steps);
                        var tx = playerX + Math.cos(angle) * MAX_HIT_DISTANCE;
                        var ty = playerY + Math.sin(angle) * MAX_HIT_DISTANCE;
                        var tIso = Golf.toIsometric(tx, ty);
                        var tElev = Golf.getElevationAt(tx, ty);
                        state.hitConeGraphics.lineTo(tIso.x, tIso.y - tElev);
                    }

                    state.hitConeGraphics.closePath();
                    state.hitConeGraphics.fill();
                    state.hitConeGraphics.strokePath();
                }
            }

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

            if (isLocal) {
                state.aimLine.clear();
                if (isBallInCone && isRightDown) {
                    var club = p.activeClub;
                    var distFactor = ballDist / MAX_HIT_DISTANCE;
                    var pwrMult = 1.0 - distFactor * 0.5;

                    state.aimLine.lineStyle(3, 0xffffff, 0.6);
                    var shotAngle = mouseAngle;
                    var len = (p.power / 100) * 800 * club.power * 100 * pwrMult;

                    for (var i = 0; i < len; i += 25) {
                        var x1 = p.ball.position.x + Math.cos(shotAngle) * i;
                        var y1 = p.ball.position.y + Math.sin(shotAngle) * i;
                        var x2 = p.ball.position.x + Math.cos(shotAngle) * (i + 12);
                        var y2 = p.ball.position.y + Math.sin(shotAngle) * (i + 12);

                        var iso1 = Golf.toIsometric(x1, y1);
                        var iso2 = Golf.toIsometric(x2, y2);
                        var elev1 = Golf.getElevationAt(x1, y1);
                        var elev2 = Golf.getElevationAt(x2, y2);

                        state.aimLine.lineBetween(
                            iso1.x, iso1.y - elev1,
                            iso2.x, iso2.y - elev2
                        );
                    }
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

            var worldMouse = Golf.fromIsometric(activePointer.worldX, activePointer.worldY);
            mouseAngle = Phaser.Math.Angle.Between(
                playerX, playerY,
                worldMouse.x,
                worldMouse.y
            );
            angleDiff = Math.abs(Phaser.Math.Angle.Wrap(ballAngle - mouseAngle));
            isBallInCone =
                ballDist < MAX_HIT_DISTANCE &&
                angleDiff < Phaser.Math.DegToRad(CONE_ANGLE / 2);

            if (isBallInCone) {
                var club = p.activeClub;
                var distFactor = ballDist / MAX_HIT_DISTANCE;
                var pwrMult = 1.0 - distFactor * 0.5;

                // Dynamic Terrain modifiers
                var tile = Golf.getTileAt(p.ball.position.x, p.ball.position.y);
                var terrain = Golf.TERRAIN_TYPES[tile.type.toUpperCase()] || { shotPowerMult: 1.0, shotAccuracyPenalty: 0 };

                var terrainPowerMult = terrain.shotPowerMult || 1.0;
                var terrainAccuracyPenalty = terrain.shotAccuracyPenalty || 0;

                var accuracyDeviation = (distFactor + terrainAccuracyPenalty) * Math.PI;

                var originalShotAngle = mouseAngle;

                // Deterministic jitter based on power and position to keep host/guest in sync
                var seed = (p.power * 1000) + p.body.position.x + p.body.position.y;
                var pseudoRandom = (Math.abs(Math.sin(seed)) + Math.abs(Math.cos(seed * 1.5))) / 2; // Stable pseudo-random 0-1
                var jitter = (pseudoRandom - 0.5) * accuracyDeviation;

                var finalShotAngle = originalShotAngle + jitter;

                if (isLocal) {
                    if (tile.type === 'rough' || tile.type === 'bunker') {
                        var label = tile.type === 'rough' ? 'ROUGH!' : 'BUNKER!';
                        var color = tile.type === 'rough' ? '#feca57' : '#ff9f43';
                        var txt = scene.add.text(playerX, playerY - 40, label, {
                            family: 'Outfit',
                            fontSize: '28px',
                            fontStyle: '900',
                            color: color,
                            stroke: '#ffffff',
                            strokeThickness: 4
                        }).setOrigin(0.5).setDepth(100);
                        scene.tweens.add({
                            targets: txt,
                            y: playerY - 100,
                            alpha: 0,
                            duration: 1000,
                            onComplete: function () { txt.destroy(); }
                        });
                    } else if (distFactor >= 0.75) {
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
                }
                var finalForce = (p.power / 100) * club.power * pwrMult * terrainPowerMult;

                scene.matter.body.applyForce(p.ball, p.ball.position, {
                    x: Math.cos(finalShotAngle) * finalForce,
                    y: Math.sin(finalShotAngle) * finalForce
                });
                p.lastSafePos = { x: p.ball.position.x, y: p.ball.position.y };
                p.swingState = Golf.SWING_STATES.HIT;

                // Ball flight animation (not for Putter)
                if (club.name !== 'Putter' && p.power > 50) {
                    var flightDuration = 800 + (p.power / 100) * 400;
                    var arc = club.arc !== undefined ? club.arc : 1.0;
                    if (arc > 0) {
                        var maxH = (p.power / 100) * 40 * arc;
                        p.ballInFlight = true;
                        scene.tweens.add({
                            targets: p,
                            ballHeight: maxH,
                            duration: flightDuration / 2,
                            ease: 'Quad.out',
                            yoyo: true,
                            onComplete: function () {
                                p.ballInFlight = false;
                                p.ballHeight = 0;
                                p.state = Golf.PLAYER_STATES.IDLE;
                                p.swingState = Golf.SWING_STATES.NONE;
                            }
                        });
                    }
                }

                if (isLocal) scene.cameras.main.shake(200, 0.005);
            }

            p.isAiming = false;
            // If not in flight (e.g. putter or low power), reset state now
            if (!p.ballInFlight) {
                p.state = Golf.PLAYER_STATES.IDLE;
                p.swingState = Golf.SWING_STATES.NONE;
            }
            p.power = 0;
            if (isLocal) {
                scene.powerMeterContainer.classList.add('hidden');
                state.aimLine.clear();
                state.hitConeGraphics.clear();
            }
        }
    };
})(typeof window !== 'undefined' ? window : this);

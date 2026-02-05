(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;
    var CLUB_TYPES = Golf.CLUB_TYPES;

    Golf.handleAIBehavior = function (scene, p) {
        if (!state.isMatchActive) return;
        p.aiTimer++;

        var distToBall = Phaser.Math.Distance.Between(
            p.body.position.x, p.body.position.y,
            p.ball.position.x, p.ball.position.y
        );
        var distBallToHole = Phaser.Math.Distance.Between(
            p.ball.position.x, p.ball.position.y,
            state.hole.x, state.hole.y
        );
        if (!p.activeClub) p.activeClub = CLUB_TYPES.IRON;

        if (distToBall > 60) {
            var angle = Phaser.Math.Angle.Between(
                p.body.position.x, p.body.position.y,
                p.ball.position.x, p.ball.position.y
            );
            var force = 0.003;
            scene.matter.body.applyForce(p.body, p.body.position, {
                x: Math.cos(angle) * force,
                y: Math.sin(angle) * force
            });
        } else {
            var v = p.body.velocity;
            scene.matter.body.setVelocity(p.body, { x: v.x * 0.9, y: v.y * 0.9 });

            if (p.aiTimer % (150 + Math.random() * 100) === 0) {
                var angle =
                    Phaser.Math.Angle.Between(
                        p.ball.position.x, p.ball.position.y,
                        state.hole.x, state.hole.y
                    ) + (Math.random() - 0.5) * 0.2;
                var club = p.activeClub;
                var forceMag = Phaser.Math.Clamp(
                    (distBallToHole / 8000) * club.power * 100,
                    0.003,
                    club.power
                );
                scene.matter.body.applyForce(p.ball, p.ball.position, {
                    x: Math.cos(angle) * forceMag,
                    y: Math.sin(angle) * forceMag
                });
            }
        }
    };
})(typeof window !== 'undefined' ? window : this);

(function (global) {
    var Golf = global.Golf;

    Golf.handlePlayerMovement = function (scene, p) {
        var force = 0.004;
        var speedCap = 3.5;

        if (p.isAiming) {
            force *= 0.25;
            speedCap *= 0.35;
        }

        var anyMove =
            scene.keys.W.isDown ||
            scene.keys.S.isDown ||
            scene.keys.A.isDown ||
            scene.keys.D.isDown;

        if (p.isAiming && !anyMove) {
            scene.matter.body.setVelocity(p.body, { x: 0, y: 0 });
        } else {
            if (scene.keys.W.isDown)
                scene.matter.body.applyForce(p.body, p.body.position, { x: 0, y: -force });
            if (scene.keys.S.isDown)
                scene.matter.body.applyForce(p.body, p.body.position, { x: 0, y: force });
            if (scene.keys.A.isDown)
                scene.matter.body.applyForce(p.body, p.body.position, { x: -force, y: 0 });
            if (scene.keys.D.isDown)
                scene.matter.body.applyForce(p.body, p.body.position, { x: force, y: 0 });

            var speed = Math.sqrt(p.body.velocity.x * p.body.velocity.x + p.body.velocity.y * p.body.velocity.y);
            if (speed > speedCap) {
                var ratio = speedCap / speed;
                scene.matter.body.setVelocity(p.body, {
                    x: p.body.velocity.x * ratio,
                    y: p.body.velocity.y * ratio
                });
            }
        }
    };
})(typeof window !== 'undefined' ? window : this);

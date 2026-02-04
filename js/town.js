(function (global) {
    var Golf = global.Golf;
    var CAT_BUILDING = Golf.CAT_BUILDING;
    var CAT_PLAYER = Golf.CAT_PLAYER;
    var CAT_BALL = Golf.CAT_BALL;
    var CAT_DEFAULT = Golf.CAT_DEFAULT;

    Golf.createTown = function (scene) {
        for (var i = 0; i < 400; i++) {
            var x = Phaser.Math.Between(500, 19500);
            var y = Phaser.Math.Between(500, 19500);
            if (Phaser.Math.Distance.Between(x, y, 10000, 10000) < 1000) continue;
            var w = Phaser.Math.Between(150, 500);
            var h = Phaser.Math.Between(150, 500);
            scene.matter.add.rectangle(x, y, w, h, {
                isStatic: true,
                collisionFilter: {
                    category: CAT_BUILDING,
                    mask: CAT_PLAYER | CAT_BALL | CAT_DEFAULT
                }
            });
            scene.add.rectangle(x, y, w, h, 0x353b48).setStrokeStyle(6, 0x2f3640);
            for (var j = 0; j < 4; j++) {
                scene.add.rectangle(
                    x - w / 3 + (j % 2) * (w / 1.5),
                    y - h / 3 + Math.floor(j / 2) * (h / 1.5),
                    30, 30, 0xfeca57, 0.6
                );
            }
            if (Math.random() > 0.5) {
                scene.add.circle(x + w / 2 + 50, y, 40, 0x2ed573).setStrokeStyle(4, 0x01a3a4);
            }
        }
    };
})(typeof window !== 'undefined' ? window : this);

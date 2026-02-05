(function (global) {
    var Golf = global.Golf;
    var CLUB_TYPES = Golf.CLUB_TYPES;
    var state = Golf.state;

    Golf.spawnClubs = function (scene) {
        var config = Golf.MAP_CONFIG;
        var worldWidth = config.cols * config.tileSize;
        var worldHeight = config.rows * config.tileSize;
        var margin = 50;

        var types = Object.keys(CLUB_TYPES);
        for (var i = 0; i < 120; i++) {
            var type = CLUB_TYPES[types[Phaser.Math.Between(0, types.length - 1)]];
            var x = Phaser.Math.Between(margin, worldWidth - margin);
            var y = Phaser.Math.Between(margin, worldHeight - margin);
            var sprite = scene.add.rectangle(x, y, 34, 34, type.color).setStrokeStyle(2, 0xffffff);
            var txt = scene.add.text(x, y, type.name.charAt(0), {
                family: 'Outfit',
                fontSize: '16px',
                fontStyle: 'bold',
                color: '#000'
            }).setOrigin(0.5);
            state.clubs.push({ sprite: sprite, txt: txt, type: type, x: x, y: y });
            scene.tweens.add({
                targets: [sprite, txt],
                y: y - 10,
                duration: 1000 + Math.random() * 500,
                yoyo: true,
                repeat: -1
            });
        }
    };

    Golf.updateClubUI = function (p) {
        var scene = state.game.scene.scenes[0];
        p.inventory.forEach(function (club, i) {
            var el = scene.clubSlots[i];
            el.innerText = club.name;
            el.classList.remove('empty', 'active');
            var isActive = p.activeClub === club;
            var colorHex = '#' + club.color.toString(16).padStart(6, '0');
            el.style.border = isActive ? '4px solid ' + colorHex : '3px solid ' + colorHex;
            el.style.boxShadow = isActive ? '0 0 12px ' + colorHex : 'none';
            if (isActive) el.classList.add('active');
        });
    };
})(typeof window !== 'undefined' ? window : this);

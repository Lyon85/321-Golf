(function (global) {
    var Golf = global.Golf;
    var CLUB_TYPES = Golf.CLUB_TYPES;
    var state = Golf.state;

    Golf.spawnClubs = function (scene, data) {
        var config = Golf.MAP_CONFIG;
        var worldWidth = config.cols * config.tileSize;
        var worldHeight = config.rows * config.tileSize;
        var margin = 50;

        // Clear existing clubs if any
        if (state.clubs.length > 0) {
            console.log(`[Clubs] Clearing ${state.clubs.length} existing clubs.`);
            state.clubs.forEach(c => {
                if (c.sprite) c.sprite.destroy();
                if (c.txt) c.txt.destroy();
            });
            state.clubs = [];
        }

        var clubList = [];

        if (data) {
            console.log(`[Clubs] Spawning ${data.length} clubs from server data.`);
            // Multiplayer Mode: Spawn from server data
            data.forEach(function (d) {
                var typeNameUppercase = d.type.name.toUpperCase();
                console.log(`[Clubs] Processing club ID: ${d.id}, Type: ${d.type.name} (Key: ${typeNameUppercase})`);

                var type = CLUB_TYPES[typeNameUppercase];
                if (!type) {
                    console.warn(`[Clubs] Type '${typeNameUppercase}' not found in local definitions. Using server fallback.`);
                    type = d.type;
                } else {
                    console.log(`[Clubs] Successfully matched local type:`, type);
                }

                if (type) {
                    createClub(scene, d.x, d.y, type, d.id);
                } else {
                    console.error(`[Clubs] Failed to resolve type for club ${d.id}`);
                }
            });
        } else {
            console.log('[Clubs] Generating 120 random clubs (single-player mode).');

            // Single-player Mode: Generate Random
            var types = Object.keys(CLUB_TYPES);
            for (var i = 0; i < 120; i++) {
                var typeKey = types[Phaser.Math.Between(0, types.length - 1)];
                var type = CLUB_TYPES[typeKey];
                var x = Phaser.Math.Between(margin, worldWidth - margin);
                var y = Phaser.Math.Between(margin, worldHeight - margin);

                createClub(scene, x, y, type);

                clubList.push({
                    x: x,
                    y: y,
                    typeIndex: typeKey
                });
            }
        }

        return clubList;
    };

    function createClub(scene, x, y, type, id) {
        var sprite = scene.add.rectangle(x, y, 34, 34, type.color).setStrokeStyle(2, 0xffffff);
        var txt = scene.add.text(x, y, type.name.charAt(0), {
            family: 'Outfit',
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#000'
        }).setOrigin(0.5);

        // Store ID for networking
        state.clubs.push({ id: id, sprite: sprite, txt: txt, type: type, x: x, y: y });

        scene.tweens.add({
            targets: [sprite, txt],
            y: y - 10,
            duration: 1000 + Math.random() * 500,
            yoyo: true,
            repeat: -1
        });
    }

    Golf.removeClub = function (id) {
        var index = state.clubs.findIndex(function (c) { return c.id === id; });
        if (index !== -1) {
            var c = state.clubs[index];
            if (c.sprite) c.sprite.destroy();
            if (c.txt) c.txt.destroy();
            state.clubs.splice(index, 1);
            console.log('[Clubs] Club removed:', id);
            return c.type; // Return type so we can add to inventory if needed
        }
        return null;
    };

    Golf.updateClubUI = function (p) {
        console.log(`[UI] Updating Club UI for Player ${p.playerIndex}. Items: ${p.inventory.length}`);
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

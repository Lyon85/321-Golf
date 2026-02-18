(function (global) {
    var Golf = global.Golf;
    var CLUB_TYPES = Golf.CLUB_TYPES;
    var state = Golf.state;

    Golf.spawnClubs = function (scene, data) {
        var config = Golf.MAP_CONFIG;
        var worldWidth = config.cols * config.tileSize;
        var worldHeight = config.rows * config.tileSize;
        var margin = 50;

        if (!state.mapGrid || state.mapGrid.length === 0) {
            console.warn('[Clubs] Map grid not ready yet, retrying spawnClubs in 500ms...');
            scene.time.delayedCall(500, function () {
                Golf.spawnClubs(scene, data);
            });
            return;
        }

        // Clear existing clubs
        if (state.clubs.length > 0) {
            console.log(`[Clubs] Clearing ${state.clubs.length} existing clubs.`);
            state.clubs.forEach(c => {
                if (c.sprite) c.sprite.destroy();
                if (c.txt) c.txt.destroy();
            });
            state.clubs = [];
        }

        var clubList = [];

        if (data && data.length > 0) {
            console.log(`[Clubs] Spawning ${data.length} clubs from server data.`);
            // Multiplayer Mode: spawn from server
            data.forEach(d => {
                var typeKey = d.type.name.toUpperCase();
                var type = Golf.CLUB_TYPES[typeKey] || d.type;
                Golf.createClub(scene, d.x, d.y, type, d.id);
            });
        } else {
            console.log('[Clubs] Generating 100 random clubs (single-player mode).');

            var types = Object.keys(Golf.CLUB_TYPES);
            var playableTypes = ['grass', 'water', 'bunker', 'mountain'];

            var clubsToSpawn = 100;
            var spawned = 0;

            while (spawned < clubsToSpawn) {
                var typeKey = types[Phaser.Math.Between(0, types.length - 1)];
                var type = Golf.CLUB_TYPES[typeKey];

                var x = Phaser.Math.Between(margin, worldWidth - margin);
                var y = Phaser.Math.Between(margin, worldHeight - margin);

                var tile = Golf.getTileAt(x, y);

                // Always allow spawn if tile missing or not playable
                if (!tile || !playableTypes.includes(tile.type)) {
                    tile = { type: 'grass' }; // Force a valid type
                }

                // Assign a unique id for single-player clubs
                var id = 'sp_' + spawned;

                Golf.createClub(scene, x, y, type, id);

                clubList.push({ x: x, y: y, typeIndex: typeKey, id: id });
                spawned++;
            }
        }

        console.log(`[Clubs] Spawned ${state.clubs.length} clubs.`);
        return clubList;
    };

    Golf.createClub = function (scene, x, y, type, id) {
        var sprite = scene.add.rectangle(x, y, 34, 34, type.color).setStrokeStyle(2, 0xffffff);
        var txt = scene.add.text(x, y, type.name.charAt(0), {
            family: 'Outfit',
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#000'
        }).setOrigin(0.5);

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
        // Use loose equality == to handle string/number ID mismatch
        var index = state.clubs.findIndex(function (c) { return c.id == id; });
        if (index !== -1) {
            var c = state.clubs[index];
            if (c.sprite) c.sprite.destroy();
            if (c.txt) c.txt.destroy();
            state.clubs.splice(index, 1);
            console.log('[Clubs] Club removed:', id);
            return c.type; // Return type so we can add to inventory if needed
        }
        console.warn('[Clubs] Club NOT found for removal:', id);
        return null;
    };

    Golf.updateClubUI = function (p) {
        var scene = state.game.scene.scenes[0];
        // Clear slots first
        if (scene.clubSlots) {
            scene.clubSlots.forEach(el => {
                if (!el) return;
                el.innerText = '-';
                el.classList.add('empty');
                el.classList.remove('active');
                el.style.border = '1px solid #444';
                el.style.boxShadow = 'none';
            });
        }

        p.inventory.forEach(function (club, i) {
            var el = scene.clubSlots[i];
            if (!el) return;
            el.innerText = club.name;
            el.classList.remove('empty');
            var isActive = p.activeClub === club;
            var colorHex = '#' + (club.color !== undefined ? club.color.toString(16).padStart(6, '0') : 'ffffff');
            el.style.border = isActive ? '4px solid ' + colorHex : '3px solid ' + colorHex;
            el.style.boxShadow = isActive ? '0 0 12px ' + colorHex : 'none';
            if (isActive) el.classList.add('active');
        });
    };
})(typeof window !== 'undefined' ? window : this);

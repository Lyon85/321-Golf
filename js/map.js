(function (global) {
    var Golf = global.Golf || (global.Golf = {});

    Golf.MAP_CONFIG = {
        rows: 0,
        cols: 0,
        tileSize: 100
    };

    Golf.MAP_DATA = [];

    // Load map from external file
    Golf.loadMap = function (url) {
        return fetch(url)
            .then(response => {
                if (!response.ok) throw new Error("Failed to load map file: " + response.statusText);
                return response.text();
            })
            .then(text => {
                const lines = text.trim().split("\n");

                // Join into one string so replace works
                Golf.MAP_DATA = lines.join(",");  // <-- key change

                Golf.MAP_CONFIG.rows = lines.length;
                Golf.MAP_CONFIG.cols = lines[0].split(/,(?![^\[]*\])/).length;

                // --- Slope Physics Tuning ---
                Golf.SLOPE_FORCE_MULT = 0.00004;      // Overall slope strength
                Golf.STATIC_SPEED_THRESHOLD = 0.12;   // Below this speed we consider ball "almost stopped"
                Golf.STATIC_FORCE_THRESHOLD = 0.00012; // If slope force weaker than this, ball will stick
                Golf.LOW_SPEED_FRICTION = 0.08;       // Extra rolling resistance when nearly stopped


                return Golf.MAP_DATA;
            })
            .catch(err => console.error(err));
    };


    // Now call it
    Golf.loadMap("maps/map.txt").then(() => {
        console.log("Map loaded:", Golf.MAP_DATA);
        console.log("Map config:", Golf.MAP_CONFIG);
    });

})(typeof window !== 'undefined' ? window : this);

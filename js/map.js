(function (global) {
    var Golf = global.Golf || (global.Golf = {});

    Golf.MAP_CONFIG = {
        rows: 0,
        cols: 0,
        tileSize: 60
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

                Golf.MAP_DATA = lines;

                Golf.MAP_CONFIG.rows = lines.length;
                Golf.MAP_CONFIG.cols = lines[0].split(",").length;

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

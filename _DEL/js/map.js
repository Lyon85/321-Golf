(function (global) {
    var Golf = global.Golf || (global.Golf = {});

    Golf.MAP_CONFIG = {
        cols: 20,
        rows: 6, // <-- now matches your data
        tileSize: 250
    };

    var mapLines = [
        "s,i45,g,g,g,g,r,r,r,r,g,g,g,g,g,g,g,g,g,g",
        "g,g,g,g,g,g,g,g,g,g,r,g,g,g,g,g,g,g,g,g",
        "g,g,w,w,w,g,b,b,b,b,b,b,g,g,g,w,w,w,g,g",
        "g,g,w,w,w,g,g,g,g,g,b,b,g,g,g,w,w,w,g,g",
        "g,g,i90,i90,i90,g,g,g,g,g,g,g,g,g,g,i270,i270,i270,g,g",
        "g,g,i90,i90,i90,g,g,g,g,g,g,g,g,g,g,i270,i270,i270,g,g"
    ];

    Golf.MAP_DATA = mapLines.join(",\n");

})(typeof window !== 'undefined' ? window : this);

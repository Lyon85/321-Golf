// Collision categories and club types (load first)
(function (global) {
    var Golf = (global.Golf = global.Golf || {});

    Golf.CAT_DEFAULT = 0x0001;
    Golf.CAT_PLAYER = 0x0002;
    Golf.CAT_BALL = 0x0004;
    Golf.CAT_BUILDING = 0x0010;
    Golf.CAT_CAR = 0x0020;
    Golf.CAT_HOLE = 0x0040;

    Golf.CLUB_TYPES = {
        DRIVER: { name: 'Driver', power: 0.015, accuracy: 0.7, color: 0xffd32a },
        IRON: { name: 'Iron', power: 0.009, accuracy: 0.95, color: 0xff3f34 },
        PUTTER: { name: 'Putter', power: 0.005, accuracy: 1.0, color: 0x0fbcf9 }
    };
})(typeof window !== 'undefined' ? window : this);

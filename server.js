const express = require('express');
const app = express();
const http = require('http').createServer(app);

const { Server } = require("socket.io"); // <-- make sure to require Server
const io = new Server(http, {
    path: "/321/socket.io" // must match the URL base
});

const path = require('path');

// Serve static files
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rooms State
// Dictionary of roomCode -> { players: {}, carts: [], started: false }
const rooms = {};

const CLUB_TYPES = [
    { name: 'Driver', color: 0xff4757 },
    { name: 'Iron', color: 0x2ed573 },
    { name: 'Putter', color: 0x1e90ff },
    { name: 'Wedge', color: 0xffa502 }
];

function generateFixedClubs(width, height) {
    console.log(`[Server] Generating clubs for map size: ${width}x${height}`);
    const clubs = [];
    const margin = 100; // Keep away from extreme edges
    let idCounter = 0;

    const definitions = [
        { type: 'Driver', count: 3 },
        { type: 'Iron', count: 3 },
        { type: 'Putter', count: 3 }
    ];

    definitions.forEach(def => {
        // Find the matching type object from constants
        const typeObj = CLUB_TYPES.find(ct => ct.name === def.type);
        if (!typeObj) {
            console.error(`[Server] Club type '${def.type}' not found in server constants!`);
            return;
        }

        for (let i = 0; i < def.count; i++) {
            clubs.push({
                id: idCounter++,
                x: Math.floor(Math.random() * (width - margin * 2)) + margin,
                y: Math.floor(Math.random() * (height - margin * 2)) + margin,
                type: typeObj,
                taken: false
            });
        }
    });

    console.log(`[Server] Generated ${clubs.length} clubs.`);
    return clubs;
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('createRoom', () => {
        try {
            const code = generateRoomCode();
            console.log(`[Server] Creating room ${code} for host ${socket.id}`);

            const clubs = generateFixedClubs(5000, 1500);

            rooms[code] = {
                players: {},
                carts: [],
                clubs: clubs,
                started: false,
                spawnPoint: null,
                currentHoleIndex: 1
            };

            socket.roomCode = code;
            socket.join(code);

            // Host is Player 0
            rooms[code].players[socket.id] = {
                id: socket.id,
                playerIndex: 0,
                x: 0, y: 0,
                flipX: false, anim: 'idle',
                driving: null
            };

            socket.emit('roomCreated', code);
            socket.emit('assignPlayer', 0);
            socket.emit('currentClubs', rooms[code].clubs);

            console.log(`Room ${code} created by ${socket.id}`);
        } catch (err) {
            console.error('[Server] Error in createRoom:', err);
            socket.emit('errorMsg', 'Server error creating room: ' + err.message);
        }
    });

    socket.on('joinRoom', (code) => {
        const room = rooms[code];
        if (room) {
            const existingCount = Object.keys(room.players).length;
            if (existingCount >= 4) {
                socket.emit('errorMsg', 'Room is full');
                return;
            }

            socket.roomCode = code;
            socket.join(code);

            let assignedIndex = -1;
            const usedIndices = Object.values(room.players).map(p => p.playerIndex);
            for (let i = 0; i < 4; i++) {
                if (!usedIndices.includes(i)) { assignedIndex = i; break; }
            }

            room.players[socket.id] = {
                id: socket.id,
                playerIndex: assignedIndex,
                x: 0, y: 0,
                flipX: false, anim: 'idle',
                driving: null
            };

            socket.emit('assignPlayer', assignedIndex);
            socket.emit('currentPlayers', room.players);
            io.to(code).emit('newPlayer', room.players[socket.id]);
            socket.emit('currentClubs', room.clubs.filter(c => !c.taken));

            console.log(`Player ${socket.id} joined room ${code}`);

            if (Object.keys(room.players).length === 2 && !room.started) {
                room.started = true;
                io.to(code).emit('gameStart');
                console.log(`Room ${code} Game Started`);
            }

            if (room.holePosition) {
                socket.emit('holeUpdate', room.holePosition);
            }

            // Sync current hole index
            socket.emit('holeSunk', { index: room.currentHoleIndex });

            if (room.spawnPoint) {
                socket.emit('spawnPointUpdate', room.spawnPoint);
            }

        } else {
            socket.emit('errorMsg', 'Room not found');
        }
    });

    socket.on('requestPickup', (clubId) => {
        const code = socket.roomCode;
        if (code && rooms[code]) {
            const room = rooms[code];
            const club = room.clubs.find(c => c.id === clubId);
            if (club && !club.taken) {
                club.taken = true;
                io.to(code).emit('clubTaken', { clubId: clubId, playerId: socket.id });
            }
        }
    });

    socket.on('playerInput', (inputData) => {
        const code = socket.roomCode;
        if (code && rooms[code] && rooms[code].players[socket.id]) {
            const p = rooms[code].players[socket.id];
            p.x = inputData.x;
            p.y = inputData.y;
            p.flipX = inputData.flipX;
            p.anim = inputData.anim;
            p.driving = inputData.driving;

            socket.to(code).emit('playerMoved', {
                id: socket.id,
                playerIndex: p.playerIndex,
                ...inputData
            });
        }
    });

    socket.on('cartUpdate', (cartData) => {
        const code = socket.roomCode;
        if (code) {
            socket.to(code).emit('cartUpdate', cartData);
        }
    });

    socket.on('holeUpdate', (pos) => {
        const code = socket.roomCode;
        if (code && rooms[code]) {
            rooms[code].holePosition = pos;
            socket.to(code).emit('holeUpdate', pos);
        }
    });

    socket.on('requestNewHole', () => {
        const code = socket.roomCode;
        if (code && rooms[code]) {
            const hostId = Object.keys(rooms[code].players).find(id => rooms[code].players[id].playerIndex === 0);
            if (hostId) {
                io.to(hostId).emit('forceSpawnHole');
            }
        }
    });

    socket.on('holeSunk', () => {
        const code = socket.roomCode;
        if (code && rooms[code]) {
            const room = rooms[code];
            room.currentHoleIndex++;
            console.log(`[Server] Room ${code} hole sunk by ${socket.id}! Index is now ${room.currentHoleIndex}`);
            io.to(code).emit('holeSunk', { index: room.currentHoleIndex });
        } else {
            console.warn(`[Server] holeSunk received from ${socket.id} but room not found! RoomCode: ${code}`);
        }
    });

    socket.on('setSpawnPoint', (pos) => {
        const code = socket.roomCode;
        if (code && rooms[code]) {
            rooms[code].spawnPoint = pos;
            io.to(code).emit('spawnPointUpdate', pos);
        }
    });

    socket.on('disconnect', () => {
        const code = socket.roomCode;
        if (code && rooms[code]) {
            delete rooms[code].players[socket.id];
            io.to(code).emit('playerDisconnected', socket.id);
            if (Object.keys(rooms[code].players).length === 0) {
                delete rooms[code];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
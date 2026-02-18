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
    { name: 'Driver', power: 0.015, accuracy: 0.7, color: 0xffd32a, arc: 1.5 },
    { name: 'Iron', power: 0.009, accuracy: 0.95, color: 0xff3f34, arc: 1.0 },
    { name: 'Putter', power: 0.005, accuracy: 1.0, color: 0x0fbcf9, arc: 0 },
    { name: 'Wedge', power: 0.007, accuracy: 1.0, color: 0xffa502, arc: 1.0 } // Wedge added for future
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
            const club = room.clubs.find(c => c.id == clubId);
            if (club && !club.taken) {
                club.taken = true;
                io.to(code).emit('clubTaken', { clubId: clubId, playerId: socket.id });
                socket.emit('debugMsg', `Pickup Success: ID ${clubId}`);
            } else {
                socket.emit('debugMsg', `Pickup Rejected: ID=${clubId}, Found=${!!club}, Taken=${club ? club.taken : 'N/A'}`);
            }
        }
    });

    socket.on('requestSwap', (data) => {
        try {
            const code = socket.roomCode;
            if (code && rooms[code]) {
                const room = rooms[code];
                socket.emit('debugMsg', `Swap Start: PickupID=${data.pickupClubId}, DropName=${data.droppedClubName}`);

                const club = room.clubs.find(c => c.id == data.pickupClubId);

                if (club && !club.taken) {
                    club.taken = true;
                    const type = CLUB_TYPES.find(t => t.name.toLowerCase() === (data.droppedClubName || 'iron').toLowerCase()) || CLUB_TYPES[1];
                    const droppedId = 'd_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
                    const newClub = { id: droppedId, x: data.x, y: data.y, type: type, taken: false };
                    room.clubs.push(newClub);

                    io.to(code).emit('clubSpawned', newClub);
                    io.to(code).emit('clubTaken', {
                        clubId: data.pickupClubId,
                        playerId: socket.id,
                        swap: true,
                        droppedType: type
                    });
                    socket.emit('debugMsg', `Swap Success: Dropped ${data.droppedClubName}, Picked ID ${data.pickupClubId}`);
                } else {
                    socket.emit('debugMsg', `Swap Rejected: ID=${data.pickupClubId}, Found=${!!club}, Taken=${club ? club.taken : 'N/A'}`);
                }
            } else {
                socket.emit('debugMsg', `Swap Error: RoomCode=${code}, RoomExists=${!!rooms[code]}`);
            }
        } catch (e) {
            console.error('[Server] CRASH in requestSwap:', e);
            socket.emit('debugMsg', `Swap CRASH: ${e.message}`);
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
    console.log(`[Server] VERSION 1.2 (Swap Fix + Power/Accuracy + DebugMsg) started on port ${PORT}`);
    console.log(`[Server] Current Time: ${new Date().toISOString()}`);
});

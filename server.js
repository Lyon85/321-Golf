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

// your existing Socket.IO logic goes here...
// e.g., io.on('connection', socket => { ... });


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
            console.log(`[Server] Clubs generated: ${clubs ? clubs.length : 'NULL'}`);
            // Verify serializability
            try {
                JSON.stringify(clubs);
            } catch (jsonErr) {
                console.error('[Server] Club data is not serializable!', jsonErr);
            }

            rooms[code] = {
                players: {},
                carts: [],
                // Map Config matched to client (20 cols * 250 tile = 5000, 6 rows * 250 = 1500)
                clubs: clubs,
                started: false
            };
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
            console.log(`[Server] Emitted roomCreated to ${socket.id}`);

            socket.emit('assignPlayer', 0); // Host is P0
            console.log(`[Server] Emitted assignPlayer to ${socket.id}`);

            socket.emit('currentClubs', rooms[code].clubs); // Send clubs to host
            console.log(`[Server] Emitted currentClubs (${rooms[code].clubs.length} items) to ${socket.id}`);

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

            if (room.started) {
                // Option: Allow spectating or mid-game join? 
                // For now, let's treat it as standard join but they might need full state
            }

            socket.join(code);

            // Assign next index (simple auto-increment for now, or find gap)
            // Simple: 0 is host, 1 is guest.
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
            socket.emit('currentPlayers', room.players); // Send existing state

            // Notify room
            io.to(code).emit('newPlayer', room.players[socket.id]);

            socket.emit('currentClubs', room.clubs.filter(c => !c.taken));

            console.log(`Player ${socket.id} joined room ${code}`);

            // Check Start Condition (2 Players)
            if (Object.keys(room.players).length === 2 && !room.started) {
                room.started = true;
                io.to(code).emit('gameStart');
                console.log(`Room ${code} Game Started`);
            }

            // Sync Hole if exists
            if (room.holePosition) {
                socket.emit('holeUpdate', room.holePosition);
            }

        } else {
            socket.emit('errorMsg', 'Room not found');
        }
    });

    // Handle Club Pickup Request
    socket.on('requestPickup', (clubId) => {
        const code = Array.from(socket.rooms).find(r => r !== socket.id);
        if (code && rooms[code]) {
            const room = rooms[code];
            const club = room.clubs.find(c => c.id === clubId);
            if (club && !club.taken) {
                club.taken = true;
                // Broadcast to room so everyone removes it
                // Tell the specific player they got it
                io.to(code).emit('clubTaken', { clubId: clubId, playerId: socket.id });
                // We could send a specific 'youGotClub' to the requester if needed, 
                // but checking playerId in 'clubTaken' is sufficient.
            }
        }
    });

    // Handle Player Input (scoping to room)
    socket.on('playerInput', (inputData) => {
        // We need to know which room the socket is in. 
        // Iterate rooms or store mapping.
        // `socket.rooms` contains room code.
        const code = Array.from(socket.rooms).find(r => r !== socket.id);
        if (code && rooms[code] && rooms[code].players[socket.id]) {
            const p = rooms[code].players[socket.id];
            p.x = inputData.x;
            p.y = inputData.y;
            p.flipX = inputData.flipX;
            p.anim = inputData.anim;
            p.driving = inputData.driving;

            socket.to(code).emit('playerMoved', {
                id: socket.id,
                playerIndex: p.playerIndex, // Send index so client knows who moved
                ...inputData
            });
        }
    });

    socket.on('cartUpdate', (cartData) => {
        const code = Array.from(socket.rooms).find(r => r !== socket.id);
        if (code) {
            socket.to(code).emit('cartUpdate', cartData);
        }
    });

    // Handle Hole Sync
    socket.on('holeUpdate', (pos) => {
        const code = Array.from(socket.rooms).find(r => r !== socket.id);
        if (code && rooms[code]) {
            rooms[code].holePosition = pos; // Persist for new joiners
            socket.to(code).emit('holeUpdate', pos); // Broadcast to others
        }
    });

    socket.on('requestNewHole', () => {
        const code = Array.from(socket.rooms).find(r => r !== socket.id);
        if (code && rooms[code]) {
            // Forward to Host (Player 0)
            const hostId = Object.keys(rooms[code].players).find(id => rooms[code].players[id].playerIndex === 0);
            if (hostId) {
                io.to(hostId).emit('forceSpawnHole');
            }
        }
    });

    socket.on('disconnect', () => {
        // Find room
        let foundCode = null;
        for (const code in rooms) {
            if (rooms[code].players[socket.id]) {
                delete rooms[code].players[socket.id];
                foundCode = code;
                break;
            }
        }

        if (foundCode) {
            io.to(foundCode).emit('playerDisconnected', socket.id);
            // If room empty, delete?
            if (Object.keys(rooms[foundCode].players).length === 0) {
                delete rooms[foundCode];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
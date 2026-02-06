const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

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

function generateClubs(count, width, height) {
    const clubs = [];
    const margin = 50;
    for (let i = 0; i < count; i++) {
        const typeIndex = Math.floor(Math.random() * CLUB_TYPES.length);
        clubs.push({
            id: i,
            x: Math.floor(Math.random() * (width - margin * 2)) + margin,
            y: Math.floor(Math.random() * (height - margin * 2)) + margin,
            type: CLUB_TYPES[typeIndex],
            taken: false
        });
    }
    return clubs;
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('createRoom', () => {
        const code = generateRoomCode();
        rooms[code] = {
            players: {},
            carts: [],
            clubs: generateClubs(60, 4000, 4000), // Default map size assumptions
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
        socket.emit('assignPlayer', 0); // Host is P0

        console.log(`Room ${code} created by ${socket.id}`);
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

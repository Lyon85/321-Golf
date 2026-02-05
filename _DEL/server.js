const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room: ${roomId}`);

        if (!rooms[roomId]) {
            rooms[roomId] = { host: socket.id, guests: [] };
            socket.emit('joined', { role: 'host', roomId });
        } else {
            rooms[roomId].guests.push(socket.id);
            socket.emit('joined', { role: 'guest', roomId });
            // Notify the host that a guest joined
            io.to(rooms[roomId].host).emit('participant-joined', { id: socket.id });
        }
    });

    socket.on('host-update', (data) => {
        // Host broadcasts state to everyone in the room
        socket.to(data.roomId).emit('state-update', data.state);
    });

    socket.on('guest-input', (data) => {
        // Guest sends input to the host
        const room = rooms[data.roomId];
        if (room && room.host) {
            io.to(room.host).emit('guest-input', { id: socket.id, input: data.input });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Clean up rooms
        for (const roomId in rooms) {
            if (rooms[roomId].host === socket.id) {
                console.log(`Host left room: ${roomId}`);
                socket.to(roomId).emit('host-disconnected');
                delete rooms[roomId];
            } else {
                const index = rooms[roomId].guests.indexOf(socket.id);
                if (index !== -1) {
                    rooms[roomId].guests.splice(index, 1);
                    io.to(rooms[roomId].host).emit('participant-left', { id: socket.id });
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`321 Golf Server running on http://localhost:${PORT}`);
});

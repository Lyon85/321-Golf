(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;
    var socket = null;
    var myRoomId = null;

    function updateLobbyUI(text) {
        var el = document.getElementById('lobby-status');
        if (el) el.innerText = text;
    }

    Golf.initMatchmaking = function () {
        // Connect to the local Node.js server
        socket = io();
        state.socket = socket;

        setupUI();

        socket.on('connect', function () {
            console.log("Connected to relay server!");
            updateLobbyUI("Connected! Enter a Room ID or use the default.");

            // Generate a random room ID or allow joining one
            myRoomId = "GOLF-" + Math.random().toString(36).substring(2, 6).toUpperCase();
            var el = document.getElementById('my-id');
            if (el) el.innerText = myRoomId;
        });

        socket.on('joined', function (data) {
            state.isHost = (data.role === 'host');
            console.log("Joined as " + data.role + " in room " + data.roomId);
            updateLobbyUI(data.role === 'host' ? "Waiting for Friend..." : "Joined Friend's Game!");

            if (!state.isHost) {
                if (state.players[1]) state.players[1].isAI = false;
                var scene = state.game.scene.scenes[0];
                if (scene && state.players[1]) {
                    scene.cameras.main.startFollow(state.players[1].sprite, true, 0.1, 0.1);
                }
                // Notify the host we are ready
                socket.emit('guest-input', { roomId: data.roomId, input: { type: 'GUEST_JOINED' } });
            }
        });

        socket.on('participant-joined', function (data) {
            console.log("Friend joined!");
            updateLobbyUI("Friend Joined! Match Starting...");
            if (state.players[1]) state.players[1].isAI = false;

            var scene = state.game.scene.scenes[0];
            if (scene) {
                Golf.triggerStart(scene);
                // Sync starting state to guest
                Golf.broadcastState();
            }
        });

        socket.on('state-update', function (data) {
            if (!state.isHost) {
                handleHostStateUpdate(data);
            }
        });

        socket.on('guest-input', function (data) {
            if (state.isHost) {
                handleGuestInput(data.input);
            }
        });

        socket.on('host-disconnected', function () {
            alert("Host disconnected. Returning to lobby.");
            location.reload();
        });

        socket.on('participant-left', function (data) {
            updateLobbyUI("Friend Left. Waiting...");
            if (state.players[1]) state.players[1].isAI = true;
        });
    };

    function setupUI() {
        var joinBtn = document.getElementById('join-btn');
        var copyBtn = document.getElementById('copy-id-btn');
        var friendInput = document.getElementById('friend-id-input');

        if (joinBtn) {
            joinBtn.onclick = function () {
                var targetId = friendInput.value.trim().toUpperCase();
                if (targetId) {
                    myRoomId = targetId;
                    socket.emit('join-room', targetId);
                }
            };
        }

        // Default: Host your own random ID if you don't join
        // For this simple version, we'll auto-join our own ID as host
        setTimeout(function () {
            if (myRoomId && !state.isHost && !state.connection) {
                socket.emit('join-room', myRoomId);
            }
        }, 1000);

        if (copyBtn) {
            copyBtn.onclick = function () {
                navigator.clipboard.writeText(myRoomId);
                copyBtn.innerText = "COPIED!";
                setTimeout(function () { copyBtn.innerText = "COPY"; }, 2000);
            };
        }
    }

    function handleGuestInput(data) {
        if (data.type === 'GUEST_INPUT') {
            var guest = state.players[1];
            if (guest) {
                guest.remoteKeys = data.keys;
                guest.remotePointer = data.pointer;
            }
        }
    }

    function handleHostStateUpdate(data) {
        var scene = state.game.scene.scenes[0];
        if (!scene) return;
        state.isMatchActive = data.matchActive;
        data.players.forEach(function (pData) {
            var p = state.players[pData.id];
            if (p) {
                scene.matter.body.setPosition(p.body, { x: pData.x, y: pData.y });
                scene.matter.body.setAngle(p.body, pData.angle);
                scene.matter.body.setVelocity(p.body, { x: 0, y: 0 });
                scene.matter.body.setPosition(p.ball, { x: pData.ballX, y: pData.ballY });
                scene.matter.body.setVelocity(p.ball, pData.ballVel || { x: 0, y: 0 });
            }
        });
        data.carts.forEach(function (cData) {
            var cart = state.golfCarts[cData.id];
            if (cart) {
                scene.matter.body.setPosition(cart.body, { x: cData.x, y: cData.y });
                scene.matter.body.setAngle(cart.body, cData.angle);
                scene.matter.body.setVelocity(cart.body, { x: 0, y: 0 });
            }
        });
        if (state.hole) {
            state.hole.setPosition(data.hole.x, data.hole.y);
            if (state.holeSensor) scene.matter.body.setPosition(state.holeSensor, { x: data.hole.x, y: data.hole.y });
        }
    }

    Golf.broadcastState = function () {
        if (!socket || !state.isHost) return;
        socket.emit('host-update', {
            roomId: myRoomId,
            state: {
                players: state.players.map(function (p, index) {
                    return {
                        id: index, x: p.body.position.x, y: p.body.position.y, angle: p.body.angle,
                        ballX: p.ball.position.x, ballY: p.ball.position.y, ballVel: p.ball.velocity
                    };
                }),
                carts: state.golfCarts.map(function (c, index) {
                    return { id: index, x: c.body.position.x, y: c.body.position.y, angle: c.body.angle };
                }),
                hole: { x: state.hole.x, y: state.hole.y },
                matchActive: state.isMatchActive
            }
        });
    };

    Golf.sendGuestInput = function (scene) {
        if (socket && !state.isHost) {
            var keys = scene.keys;
            var pointer = scene.input.activePointer;
            socket.emit('guest-input', {
                roomId: myRoomId,
                input: {
                    type: 'GUEST_INPUT',
                    keys: {
                        W: keys.W.isDown, A: keys.A.isDown, S: keys.S.isDown, D: keys.D.isDown,
                        SPACE: keys.SPACE.isDown, SHIFT: keys.SHIFT.isDown, E: keys.E.isDown
                    },
                    pointer: { worldX: pointer.worldX, worldY: pointer.worldY, isDown: pointer.isDown }
                }
            });
        }
    };

    window.addEventListener('load', function () { Golf.initMatchmaking(); });
})(typeof window !== 'undefined' ? window : this);

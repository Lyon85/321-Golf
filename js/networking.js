(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;
    var PREFIX = Golf.LOBBY_ROOM_PREFIX;

    var currentRoomIndex = 1;

    function updateLobbyUI(text) {
        var el = document.getElementById('lobby-status');
        if (el) el.innerText = text;
    }

    Golf.initMatchmaking = function () {
        currentRoomIndex = 1;
        tryJoinOrCreateRoom(currentRoomIndex);
    };

    function tryJoinOrCreateRoom(index) {
        var roomId = PREFIX + index;
        updateLobbyUI("Searching for Match...");

        var peer = new Peer(roomId);
        state.peer = peer;

        peer.on('open', function (id) {
            console.log("Started as HOST for: " + id);
            state.isHost = true;
            state.myId = id;
            updateLobbyUI("Waiting for Players (1/2)");

            peer.on('connection', function (conn) {
                if (state.connection) {
                    console.log("Room full! Rejecting guest.");
                    conn.on('open', function () {
                        conn.send({ type: 'ROOM_FULL' });
                        setTimeout(function () { conn.close(); }, 500);
                    });
                    return;
                }

                console.log("Guest joined!");
                state.connection = conn;
                setupConnectionListeners(conn);

                if (state.players[1]) state.players[1].isAI = false;
                updateLobbyUI("Waiting for Players (2/2)");

                var scene = state.game.scene.scenes[0];
                if (scene) {
                    state.connection.send({ type: 'START_GAME' });
                    setTimeout(function () { Golf.triggerStart(scene); }, 1000);
                }
            });
        });

        peer.on('error', function (err) {
            if (err.type === 'unavailable-id') {
                console.log("Room " + index + " occupied, attempting to join...");
                attemptJoinRoom(index);
            } else {
                console.error("Peer error:", err);
            }
        });
    }

    function attemptJoinRoom(index) {
        var roomId = PREFIX + index;
        var peer = new Peer(); // Anonymous peer to connect
        state.peer = peer;

        peer.on('open', function (id) {
            var conn = peer.connect(roomId);
            state.connection = conn;
            state.isHost = false;

            var timeout = setTimeout(function () {
                console.warn("Connection timeout for room " + index);
                peer.destroy();
                tryJoinOrCreateRoom(index + 1);
            }, 5000);

            conn.on('open', function () {
                clearTimeout(timeout);
                console.log("Connected to room " + index);
                setupConnectionListeners(conn);
                conn.send({ type: 'GUEST_JOINED' });

                if (state.players[1]) state.players[1].isAI = false;
                var scene = state.game.scene.scenes[0];
                if (scene && state.players[1]) {
                    scene.cameras.main.startFollow(state.players[1].sprite, true, 0.1, 0.1);
                }
            });

            conn.on('data', function (data) {
                if (data.type === 'ROOM_FULL') {
                    console.log("Room " + index + " is full, trying next...");
                    peer.destroy();
                    tryJoinOrCreateRoom(index + 1);
                } else {
                    handleHostStateUpdate(data);
                }
            });

            conn.on('close', function () {
                console.log("Host closed connection.");
                location.reload();
            });
        });
    }

    function setupConnectionListeners(conn) {
        conn.on('data', function (data) {
            if (state.isHost) {
                handleGuestInput(data);
            } else {
                handleHostStateUpdate(data);
            }
        });

        conn.on('close', function () {
            console.log("Connection closed.");
            location.reload();
        });
    }

    function handleGuestInput(data) {
        if (data.type === 'GUEST_INPUT') {
            var guest = state.players[1];
            if (guest) guest.remoteKeys = data.keys;
        }
    }

    function handleHostStateUpdate(data) {
        if (data.type === 'START_GAME') {
            updateLobbyUI("Waiting for Players (2/2)");
            var scene = state.game.scene.scenes[0];
            if (scene) {
                setTimeout(function () { Golf.triggerStart(scene); }, 1000);
            }
        } else if (data.type === 'STATE_UPDATE') {
            state.isMatchActive = data.matchActive;
            data.players.forEach(function (pData) {
                var p = state.players[pData.id];
                if (p) {
                    var scene = state.game.scene.scenes[0];
                    if (!scene) return;
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
                    var scene = state.game.scene.scenes[0];
                    scene.matter.body.setPosition(cart.body, { x: cData.x, y: cData.y });
                    scene.matter.body.setAngle(cart.body, cData.angle);
                    scene.matter.body.setVelocity(cart.body, { x: 0, y: 0 });
                }
            });
            if (state.hole) {
                state.hole.setPosition(data.hole.x, data.hole.y);
                if (state.holeSensor) {
                    Matter.Body.setPosition(state.holeSensor, { x: data.hole.x, y: data.hole.y });
                }
            }
        }
    }

    Golf.broadcastState = function () {
        if (!state.connection || !state.isHost) return;
        var gameData = {
            type: 'STATE_UPDATE',
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
        };
        state.connection.send(gameData);
    };

    Golf.sendGuestInput = function (keys) {
        if (!state.connection || state.isHost) return;
        state.connection.send({
            type: 'GUEST_INPUT',
            keys: {
                W: keys.W.isDown, A: keys.A.isDown, S: keys.S.isDown, D: keys.D.isDown,
                SPACE: keys.SPACE.isDown, SHIFT: keys.SHIFT.isDown, E: keys.E.isDown
            }
        });
    };

    window.addEventListener('load', function () {
        Golf.initMatchmaking();
    });

})(typeof window !== 'undefined' ? window : this);

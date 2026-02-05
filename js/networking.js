(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;
    var myPersistentId = null;

    function updateLobbyUI(text) {
        var el = document.getElementById('lobby-status');
        if (el) el.innerText = text;
    }

    Golf.initMatchmaking = function () {
        // 1. Assign once per session
        myPersistentId = "GOLF-" + Math.random().toString(36).substring(2, 6).toUpperCase();

        setupUI();
        startHosting(myPersistentId);
    };

    function startHosting(id) {
        if (state.peer) state.peer.destroy();
        state.connection = null;
        state.isHost = true;
        state.myId = id;

        var p = new Peer(id);
        state.peer = p;

        p.on('open', function () {
            var el = document.getElementById('my-id');
            if (el) el.innerText = id;
            updateLobbyUI("Sharing ID: " + id + " | Waiting for Friend...");
        });

        p.on('connection', function (conn) {
            // Safety check
            if (state.connection) {
                conn.on('open', function () {
                    conn.send({ type: 'ROOM_FULL' });
                    setTimeout(function () { conn.close(); }, 500);
                });
                return;
            }

            console.log("Friend connected!");
            state.connection = conn;
            setupConnectionListeners(conn);
            if (state.players[1]) state.players[1].isAI = false;

            updateLobbyUI("Friend Joined! Match Starting...");
            conn.send({ type: 'START_GAME' });

            var scene = state.game.scene.scenes[0];
            if (scene) Golf.triggerStart(scene);
        });

        p.on('error', function (err) {
            if (err.type === 'unavailable-id') {
                // Might happen if we refresh really fast, just generate a new one
                myPersistentId = "GOLF-" + Math.random().toString(36).substring(2, 6).toUpperCase();
                startHosting(myPersistentId);
            }
        });
    }

    function setupUI() {
        var joinBtn = document.getElementById('join-btn');
        var copyBtn = document.getElementById('copy-id-btn');
        var friendInput = document.getElementById('friend-id-input');

        if (joinBtn) {
            joinBtn.onclick = function () {
                var targetId = friendInput.value.trim().toUpperCase();
                if (targetId) attemptJoin(targetId);
            };
        }

        if (copyBtn) {
            copyBtn.onclick = function () {
                navigator.clipboard.writeText(myPersistentId);
                copyBtn.innerText = "COPIED!";
                setTimeout(function () { copyBtn.innerText = "COPY"; }, 2000);
            };
        }
    }

    function attemptJoin(targetId) {
        updateLobbyUI("Connecting to " + targetId + "...");

        // CRITICAL: Stop hosting while we try to join as a guest
        // This prevents the "Dual Peer" confusion
        if (state.peer) state.peer.destroy();
        state.peer = null;
        state.connection = null;

        var guestPeer = new Peer();
        state.peer = guestPeer;

        guestPeer.on('open', function () {
            var conn = guestPeer.connect(targetId);

            var timeout = setTimeout(function () {
                updateLobbyUI("Join failed (Timeout). Returning to lobby...");
                guestPeer.destroy();
                startHosting(myPersistentId); // Return to our own lobby
            }, 4000);

            conn.on('open', function () {
                clearTimeout(timeout);
                console.log("Success! Connected to " + targetId);
                state.connection = conn;
                state.isHost = false;
                setupConnectionListeners(conn);
                conn.send({ type: 'GUEST_JOINED' });

                if (state.players[1]) state.players[1].isAI = false;
                updateLobbyUI("Joined! Match Starting...");

                var scene = state.game.scene.scenes[0];
                if (scene && state.players[1]) {
                    scene.cameras.main.startFollow(state.players[1].sprite, true, 0.1, 0.1);
                }
            });

            conn.on('error', function (err) {
                clearTimeout(timeout);
                updateLobbyUI("ID not found or busy. Returning to your lobby...");
                guestPeer.destroy();
                setTimeout(function () { startHosting(myPersistentId); }, 1000);
            });
        });
    }

    function setupConnectionListeners(conn) {
        conn.on('data', function (data) {
            // Global handlers
            if (data.type === 'ROOM_FULL') {
                updateLobbyUI("That game is already full!");
                if (!state.isHost) {
                    if (state.peer) state.peer.destroy();
                    startHosting(myPersistentId);
                }
            } else if (data.type === 'START_GAME') {
                var scene = state.game.scene.scenes[0];
                if (scene) Golf.triggerStart(scene);
            } else {
                if (state.isHost) handleGuestInput(data);
                else handleHostStateUpdate(data);
            }
        });

        conn.on('close', function () {
            if (!state.isWaitingToStart) {
                location.reload();
            } else {
                updateLobbyUI("Friend Left. Waiting...");
                state.connection = null;
                if (state.players[1]) state.players[1].isAI = true;
                if (!state.isHost) {
                    // If we were guest and host left, become host of our own ID again
                    if (state.peer) state.peer.destroy();
                    startHosting(myPersistentId);
                }
            }
        });
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
        if (data.type === 'STATE_UPDATE') {
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
    }

    Golf.broadcastState = function () {
        if (!state.connection || !state.isHost) return;
        state.connection.send({
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
        });
    };

    Golf.sendGuestInput = function (scene) {
        if (state.connection && !state.isHost) {
            var keys = scene.keys;
            var pointer = scene.input.activePointer;
            state.connection.send({
                type: 'GUEST_INPUT',
                keys: {
                    W: keys.W.isDown, A: keys.A.isDown, S: keys.S.isDown, D: keys.D.isDown,
                    SPACE: keys.SPACE.isDown, SHIFT: keys.SHIFT.isDown, E: keys.E.isDown
                },
                pointer: { worldX: pointer.worldX, worldY: pointer.worldY, isDown: pointer.isDown }
            });
        }
    };

    window.addEventListener('load', function () { Golf.initMatchmaking(); });
})(typeof window !== 'undefined' ? window : this);

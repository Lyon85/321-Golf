(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;

    var peer = new Peer();
    state.peer = peer;

    peer.on('open', function (id) {
        state.myId = id;
        document.getElementById('my-id').innerText = id;
    });

    peer.on('connection', function (conn) {
        console.log("Incoming connection from: " + conn.peer);
        state.isHost = true;
        state.connection = conn;
        setupConnectionListeners(conn);

        // Disable AI for the second player when a human joins
        if (state.players[1]) {
            state.players[1].isAI = false;
        }

        // Hide UI when connected
        document.getElementById('multiplayer-controls').style.display = 'none';
        document.getElementById('my-id').innerText = "Friend Joined!";
    });

    Golf.joinGame = function (friendId) {
        if (!friendId) return;
        console.log("Joining game: " + friendId);
        var conn = peer.connect(friendId);
        state.isHost = false;
        state.connection = conn;
        setupConnectionListeners(conn);

        // Set guest player (player 1) to not be AI
        if (state.players[1]) {
            state.players[1].isAI = false;
        }

        // Guest follows their own player (index 1)
        var scene = state.game.scene.scenes[0];
        if (scene && state.players[1]) {
            scene.cameras.main.startFollow(state.players[1].sprite, true, 0.1, 0.1);
        }

        document.getElementById('multiplayer-controls').style.display = 'none';
        document.getElementById('my-id').innerText = "Connected!";
    };

    function setupConnectionListeners(conn) {
        conn.on('open', function () {
            console.log("Connection established!");
            if (!state.isHost) {
                // If guest, tell the host we are here
                conn.send({ type: 'GUEST_JOINED' });
            }
        });

        conn.on('data', function (data) {
            if (state.isHost) {
                handleGuestInput(data);
            } else {
                handleHostStateUpdate(data);
            }
        });

        conn.on('close', function () {
            console.log("Connection closed.");
            state.connection = null;
            location.reload(); // Simplest way to reset
        });
    }

    // --- HOST LOGIC ---
    function handleGuestInput(data) {
        if (data.type === 'GUEST_INPUT') {
            // Find the guest player (player 2 for now simplified)
            var guest = state.players[1];
            if (guest) {
                guest.remoteKeys = data.keys;
            }
        }
    }

    Golf.broadcastState = function () {
        if (!state.connection || !state.isHost) return;

        var gameData = {
            type: 'STATE_UPDATE',
            players: state.players.map(function (p, index) {
                return {
                    id: index,
                    x: p.body.position.x,
                    y: p.body.position.y,
                    angle: p.body.angle,
                    ballX: p.ball.position.x,
                    ballY: p.ball.position.y,
                    ballVel: p.ball.velocity
                };
            }),
            carts: state.golfCarts.map(function (c, index) {
                return {
                    id: index,
                    x: c.body.position.x,
                    y: c.body.position.y,
                    angle: c.body.angle
                };
            }),
            hole: {
                x: state.hole.x,
                y: state.hole.y
            },
            matchActive: state.isMatchActive
        };

        state.connection.send(gameData);
    };

    // --- GUEST LOGIC ---
    function handleHostStateUpdate(data) {
        if (data.type === 'STATE_UPDATE') {
            state.isMatchActive = data.matchActive;

            // Sync Players & Balls
            data.players.forEach(function (pData) {
                var p = state.players[pData.id];
                if (p) {
                    // Force position for remote players/balls
                    // In a more advanced version, we'd use interpolation
                    Matter.Body.setPosition(p.body, { x: pData.x, y: pData.y });
                    Matter.Body.setAngle(p.body, pData.angle);
                    Matter.Body.setPosition(p.ball, { x: pData.ballX, y: pData.ballY });
                    Matter.Body.setVelocity(p.ball, pData.ballVel);
                }
            });

            // Sync Carts
            data.carts.forEach(function (cData) {
                var cart = state.golfCarts[cData.id];
                if (cart) {
                    Matter.Body.setPosition(cart.body, { x: cData.x, y: cData.y });
                    Matter.Body.setAngle(cart.body, cData.angle);
                }
            });

            // Sync Hole
            if (state.hole) {
                state.hole.setPosition(data.hole.x, data.hole.y);
                if (state.holeSensor) {
                    Matter.Body.setPosition(state.holeSensor, { x: data.hole.x, y: data.hole.y });
                }
            }
        }
    }

    Golf.sendGuestInput = function (keys) {
        if (!state.connection || state.isHost) return;

        state.connection.send({
            type: 'GUEST_INPUT',
            keys: {
                W: keys.W.isDown,
                A: keys.A.isDown,
                S: keys.S.isDown,
                D: keys.D.isDown,
                SPACE: keys.SPACE.isDown,
                SHIFT: keys.SHIFT.isDown,
                E: keys.E.isDown
            }
        });
    };

    // UI Wire-up
    window.addEventListener('load', function () {
        document.getElementById('join-btn').addEventListener('click', function () {
            var id = document.getElementById('friend-id-input').value;
            Golf.joinGame(id);
        });

        document.getElementById('copy-id-btn').addEventListener('click', function () {
            if (state.myId) {
                navigator.clipboard.writeText(state.myId);
                var btn = document.getElementById('copy-id-btn');
                btn.innerText = "Copied!";
                setTimeout(function () { btn.innerText = "Copy"; }, 2000);
            }
        });
    });

})(typeof window !== 'undefined' ? window : this);

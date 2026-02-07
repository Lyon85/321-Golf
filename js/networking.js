(function (global) {
    var Golf = global.Golf || {};
    var socket;
    var sceneRef;

    Golf.Networking = {
        init: function (scene) {
            sceneRef = scene;
            console.log('Networking: Initializing... (Client v3 with Debug Logs)');
            socket = io({ path: '/321/socket.io' });


            this.setupUI();

            socket.on('connect', function () {
                console.log('Networking: Connected to server. ID:', socket.id);
            });

            // Receive my assigned player index
            socket.on('assignPlayer', function (index) {
                console.log('Networking: Assigned Player Index:', index);
                Golf.state.myPlayerId = index;

                // FORCE Camera Update immediately
                if (Golf.state.players[index]) {
                    scene.cameras.main.startFollow(Golf.state.players[index].sprite, true, 0.1, 0.1);
                    console.log('Networking: Camera attached to P' + index);
                }
            });

            // Initial Load of existing players
            socket.on('currentPlayers', function (serverPlayers) {
                Object.keys(serverPlayers).forEach(function (id) {
                    if (id === socket.id) return; // Skip self
                    var pData = serverPlayers[id];
                    // Golf.Networking.addRemotePlayer(scene, pData); 
                    // No valid spawns yet, just logging
                });
            });

            // New Player Joined Room
            socket.on('newPlayer', function (pData) {
                console.log('Networking: New Player Joined:', pData);
                // Update lobby status if specific UI existed, but gameStart handles the transition
            });

            // GAME START - Triggered when 2 players are in room
            socket.on('gameStart', function () {
                console.log('Networking: Game Start Event Received!');
                document.getElementById('lobby-status').innerText = "Starting Game!";
                // Hide Lobby UI ? Or Overlay handled by countdown
                if (Golf.startCountdown) {
                    // Force start ignoring manual trigger
                    Golf.state.isWaitingToStart = false; // Bypass manual check
                    if (scene.overlay) scene.overlay.style.display = 'none';
                    Golf.startCountdown(scene);
                }
            });

            socket.on('roomCreated', function (code) {
                console.log('Room Created:', code);
                document.getElementById('room-code').innerText = code;
                document.getElementById('lobby-status').innerText = "Waiting for Player 2...";

                // DIAGNOSTIC CHECK: If clubs don't arrive in 2 seconds, warn user
                setTimeout(function () {
                    var hasClubs = Golf.state.clubs && Golf.state.clubs.length > 0;
                    if (!hasClubs) {
                        console.error("DIAGNOSTIC: Club data NOT received from server.");
                        alert("CRITICAL ERROR: Server did not send club data.\n\nIt is highly likely your SERVER is outdated.\n\nPlease STOP and RESTART 'node server.js' to apply the fixes.");
                    }
                }, 2000);
            });

            socket.on('errorMsg', function (msg) {
                alert(msg);
            });

            // Player Moved
            socket.on('playerMoved', function (data) {
                var targetIndex = data.playerIndex;
                var localP = Golf.state.players[targetIndex];
                if (localP) {
                    // Sync Position
                    scene.matter.body.setPosition(localP.body, { x: data.x, y: data.y });
                    localP.flipX = data.flipX;

                    // Sync Ball Position
                    if (data.ballX !== undefined && data.ballY !== undefined) {
                        if (localP.ball) {
                            scene.matter.body.setPosition(localP.ball, { x: data.ballX, y: data.ballY });
                        }
                    }

                    // Sync Visibility (Driving)
                    localP.remoteDriving = data.driving; // Store state for main loop
                    if (data.driving) {
                        localP.sprite.setAlpha(0);
                        localP.ballSprite.setAlpha(0);
                    } else {
                        localP.sprite.setAlpha(1);
                        localP.ballSprite.setAlpha(1);
                    }
                }
            });

            // Player Disconnected
            socket.on('playerDisconnected', function (id) {
                console.log('Networking: Player Disconnected:', id);
            });

            // Initial Clubs
            socket.on('currentClubs', function (clubs) {
                console.log('Networking: Received Clubs event from server.');
                console.log('Networking: Data payload:', JSON.stringify(clubs, null, 2));
                if (clubs && clubs.length > 0) {
                    Golf.spawnClubs(scene, clubs);
                } else {
                    console.warn('Networking: Received empty clubs array!');
                }
            });

            // Cart Update
            socket.on('cartUpdate', function (data) {
                // data = { index, x, y, angle }
                var cart = Golf.state.golfCarts[data.index];
                if (cart) {
                    // Sync Physics
                    scene.matter.body.setPosition(cart.body, { x: data.x, y: data.y });
                    scene.matter.body.setAngle(cart.body, data.angle);

                    // Sync Visuals immediately (don't wait for main loop)
                    cart.sprite.setPosition(data.x, data.y);
                    cart.sprite.setRotation(data.angle);
                }
            });

            // Club Taken
            socket.on('clubTaken', function (data) {
                console.log('Networking: Club Taken', data);
                var type = Golf.removeClub(data.clubId); // Remove visual

                // If I am the one who took it, add to my inventory
                if (data.playerId === socket.id && type) {
                    var myP = Golf.state.players[Golf.state.myPlayerId];
                    if (myP) {
                        myP.inventory.push(type);
                        if (!myP.activeClub) myP.activeClub = type;
                        Golf.updateClubUI(myP);
                    }
                }
            });

            // Hole Sync
            socket.on('holeUpdate', function (pos) {
                console.log('Networking: Hole Update received', pos);
                // Call spawnHole with explicit position
                // We need to ensure spawnHole handles this assignment
                if (Golf.spawnHole) {
                    Golf.spawnHole(sceneRef, pos.x, pos.y);
                }
            });

            socket.on('forceSpawnHole', function () {
                console.log('Networking: Host requested to spawn new hole');
                // Initiate a new random hole (Host only receives this)
                Golf.spawnHole(sceneRef);
            });

            // Spawn Sync
            socket.on('spawnUpdate', function (pos) {
                console.log('Networking: Spawn Update received', pos);
                Golf.state.selectedSpawn = pos;
                // If players already exist, we might need to teleport them, 
                // but usually this arrives during init.
                Golf.state.players.forEach(function (p) {
                    sceneRef.matter.body.setPosition(p.body, { x: pos.x, y: pos.y });
                    if (p.ball) sceneRef.matter.body.setPosition(p.ball, { x: pos.x, y: pos.y });
                });
            });
        },

        setupUI: function () {
            var createBtn = document.getElementById('create-room-btn');
            var joinBtn = document.getElementById('join-room-btn');
            var codeInput = document.getElementById('room-code-input');
            var copyBtn = document.getElementById('copy-code-btn');

            if (codeInput) {
                // Prevent ALL clicks/keys in input from bubbling effectively
                codeInput.addEventListener('click', function (e) { e.stopPropagation(); });
                codeInput.addEventListener('keydown', function (e) { e.stopPropagation(); });
            }

            if (copyBtn) {
                copyBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var code = document.getElementById('room-code').innerText;
                    navigator.clipboard.writeText(code).then(function () {
                        copyBtn.innerText = "Copied!";
                        setTimeout(function () { copyBtn.innerText = "Copy"; }, 2000);
                    });
                });
            }

            if (createBtn) {
                createBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    console.log('Networking: Create Room Clicked');
                    if (socket) {
                        socket.emit('createRoom');
                    } else {
                        console.error('Networking: Socket not initialized');
                    }
                });
            }

            if (joinBtn) {
                joinBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var code = codeInput.value.toUpperCase();
                    if (code.length === 4) {
                        socket.emit('joinRoom', code);
                    } else {
                        alert("Please enter a 4-letter code");
                    }
                });
            }
        },

        sendPlayerInput: function (p) {
            if (!socket || !p) return;
            var data = {
                x: p.body.position.x,
                y: p.body.position.y,
                ballX: p.ball ? p.ball.position.x : 0,
                ballY: p.ball ? p.ball.position.y : 0,
                anim: p.state,
                driving: p.driving ? true : null // Simplify
            };
            socket.emit('playerInput', data);
        },

        sendCartUpdate: function (index, cart) {
            if (!socket) return;
            socket.emit('cartUpdate', {
                index: index,
                x: cart.body.position.x,
                y: cart.body.position.y,
                angle: cart.body.angle
            });
        },

        sendHoleUpdate: function (x, y) {
            if (!socket) return;
            socket.emit('holeUpdate', { x: x, y: y });
        },

        requestNewHole: function () {
            if (!socket) return;
            socket.emit('requestNewHole');
        },

        requestPickup: function (clubId) {
            if (!socket) return;
            socket.emit('requestPickup', clubId);
        },

        sendSpawnUpdate: function (pos) {
            if (!socket) return;
            socket.emit('spawnUpdate', pos);
        }
    };

    // Add listeners outside init for cleaner structure, or inside init. 
    // Ideally inside init. But the 'Networking' object is defined here.
    // I will append the listeners to the existing init function in a separate edit if needed, 
    // or just add them here if I could, but `socket` is local to closure.
    // Wait, I am replacing `requestPickup` and closing brace. 
    // I need to add listeners inside `init` separately. 
    // Let's just add the methods here first.

    global.Golf = Golf;
})(typeof window !== 'undefined' ? window : this);

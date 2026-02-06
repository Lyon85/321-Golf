(function (global) {
    var Golf = global.Golf || {};
    var socket;
    var sceneRef;

    Golf.Networking = {
        init: function (scene) {
            sceneRef = scene;
            console.log('Networking: Initializing...');
            socket = io();

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

                    // Sync Visibility (Driving)
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
                console.log('Networking: Received Clubs', clubs);
                Golf.spawnClubs(scene, clubs);
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

        requestPickup: function (clubId) {
            if (!socket) return;
            socket.emit('requestPickup', clubId);
        }
    };

    global.Golf = Golf;
})(typeof window !== 'undefined' ? window : this);

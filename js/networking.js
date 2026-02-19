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

                // Host Logic: Pick Random Tee
                if (index === 0 && Golf.state.teePositions && Golf.state.teePositions.length > 0) {
                    var tees = Golf.state.teePositions;
                    var randomTee = tees[Math.floor(Math.random() * tees.length)];
                    console.log('Networking: Host selected tee:', randomTee);

                    // Optimistically set local
                    Golf.state.spawnPoint = randomTee;

                    // Tell server to sync everyone
                    if (socket) socket.emit('setSpawnPoint', randomTee);
                }

                // FORCE Camera Update immediately
                if (Golf.state.players[index]) {
                    scene.cameras.main.startFollow(Golf.state.players[index].sprite, true, 0.1, 0.1);
                    console.log('Networking: Camera attached to P' + index);
                }

                // Host: Pick First Hole and broadcast
                if (index === 0) {
                    if (Golf.spawnHole) {
                        console.log('Networking: Host assigned, spawning first hole...');
                        Golf.spawnHole(scene);
                    }
                }
            });

            socket.on('spawnPointUpdate', function (pos) {
                console.log('Networking: Received Spawn Point Update:', pos);
                Golf.state.spawnPoint = pos;

                var offsets = [0, 100, -100]; // Defined in main.js creation

                // Teleport existing players if they exist
                if (Golf.state.players && Golf.state.players.length > 0) {
                    Golf.state.players.forEach(function (p, i) {
                        var offX = offsets[i] !== undefined ? offsets[i] : 0;
                        var newX = pos.x + offX;
                        var newY = pos.y;

                        scene.matter.body.setPosition(p.body, { x: newX, y: newY });
                        p.sprite.setPosition(newX, newY);
                        if (p.ball) {
                            scene.matter.body.setPosition(p.ball, { x: newX + 60, y: newY });
                            p.ballSprite.setPosition(newX + 60, newY);
                        }
                    });
                }

                // Teleport existing golf carts
                if (Golf.state.golfCarts && Golf.state.golfCarts.length > 0) {
                    Golf.state.golfCarts.forEach(function (cart, i) {
                        var offX = offsets[i] !== undefined ? offsets[i] : 0;
                        var newX = pos.x + offX + 60; // Offset cart from player
                        var newY = pos.y;
                        scene.matter.body.setPosition(cart.body, { x: newX, y: newY });
                        cart.sprite.setPosition(newX, newY);
                    });
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
                    if (data.direction) localP.direction = data.direction; // Sync direction
                    if (data.z !== undefined) localP.z = data.z; // Sync jump height

                    // Sync Ball Position
                    if (data.ballX !== undefined && data.ballY !== undefined) {
                        if (localP.ball) {
                            scene.matter.body.setPosition(localP.ball, { x: data.ballX, y: data.ballY });
                        }
                    }

                    // Sync Driving State (Enforce Physics/Sensor state)
                    if (data.driving) {
                        var targetCartIdx = (data.drivingCartIndex !== undefined && data.drivingCartIndex !== -1)
                            ? data.drivingCartIndex
                            : localP.playerIndex;

                        var targetCart = Golf.state.golfCarts[targetCartIdx];

                        if (localP.driving && localP.driving !== targetCart) {
                            // Player is driving the WRONG cart (e.g. from fallback or previous state)
                            // Force exit old cart to clear occupancy
                            console.log('[Networking] Correcting cart occupancy. Switching from',
                                Golf.state.golfCarts.indexOf(localP.driving), 'to', targetCartIdx);
                            Golf.exitCart(localP);
                        }

                        if (!localP.driving) {
                            // Player should be in cart but isn't. Force enter.
                            if (targetCart) {
                                // Double-check occupancy before forcing (though Authoritative client won't send if blocked)
                                // But here we just mirror visual state.
                                console.log('[Networking] Remote player entering cart:', targetCartIdx);
                                Golf.enterCart(localP, targetCart);
                            }
                        }
                    } else {
                        if (localP.driving) {
                            // Player should not be in cart but is. Force exit.
                            console.log('[Networking] Remote player exiting cart');
                            Golf.exitCart(localP);
                        }
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
                    // Store target for interpolation in main loop
                    cart.netTarget = {
                        x: data.x,
                        y: data.y,
                        angle: data.angle,
                        vx: data.vx || 0,
                        vy: data.vy || 0,
                        timestamp: Date.now() // Track freshness
                    };
                }
            });

            // Club Taken
            socket.on('clubTaken', function (data) {
                console.log('[Networking] clubTaken event received:', data);
                var type = Golf.removeClub(data.clubId); // Remove visual from map

                // If I am the one who took it, add to my inventory
                if (data.playerId === socket.id) {
                    if (!type) {
                        console.error('[Networking] clubTaken: Could not find club locally with ID:', data.clubId);
                        return;
                    }

                    var myIdx = (Golf.state.myPlayerId !== null) ? Golf.state.myPlayerId : 0;
                    var myP = Golf.state.players[myIdx];

                    if (myP) {
                        if (data.swap && data.droppedType) {
                            console.log('[Networking] Processing SWAP. Dropped type name:', data.droppedType.name);
                            // Find and replace the dropped club in inventory
                            var idx = myP.inventory.findIndex(function (c) {
                                return c.name.toLowerCase() === data.droppedType.name.toLowerCase();
                            });

                            if (idx !== -1) {
                                console.log('[Networking] Swapping inventory slot:', idx);
                                myP.inventory[idx] = type;
                                myP.activeClub = type;
                            } else {
                                console.warn('[Networking] Could not find dropped club in inventory by name, fallback to activeClub or slot 0');
                                var activeIdx = myP.inventory.indexOf(myP.activeClub);
                                if (activeIdx !== -1) {
                                    myP.inventory[activeIdx] = type;
                                } else {
                                    myP.inventory[0] = type;
                                }
                                myP.activeClub = type;
                            }
                        } else {
                            console.log('[Networking] Processing regular PICKUP');
                            if (myP.inventory.length < 2) {
                                myP.inventory.push(type);
                                myP.activeClub = type; // Auto-equip on pickup
                            } else {
                                console.warn('[Networking] Inventory full, pickup ignored.');
                            }
                        }
                        Golf.updateClubUI(myP);
                    }
                }
            });

            // Club Spawned (from swap)
            socket.on('clubSpawned', function (club) {
                console.log('[Networking] clubSpawned received:', club);
                if (Golf.createClub) {
                    Golf.createClub(sceneRef, club.x, club.y, club.type, club.id);
                }
            });

            socket.on('debugMsg', function (msg) {
                console.log('[Server Debug]', msg);
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

            socket.on('holeSunk', function (data) {
                console.log('Networking: Hole Sunk event received from server!', data);
                if (Golf.syncHoleSunk) {
                    Golf.syncHoleSunk(sceneRef, data.index);
                } else {
                    console.error('Networking: Golf.syncHoleSunk is NOT defined!');
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
                z: p.z || 0, // Sync jump height
                ballX: p.ball ? p.ball.position.x : 0,
                ballY: p.ball ? p.ball.position.y : 0,
                ballY: p.ball ? p.ball.position.y : 0,
                anim: p.state,
                direction: p.direction, // Send direction for 3D facing
                driving: p.driving ? true : null, // Simplify
                drivingCartIndex: (p.driving && Golf.state.golfCarts) ? Golf.state.golfCarts.indexOf(p.driving) : -1
            };
            socket.emit('playerInput', data);
        },

        sendCartUpdate: function (index, cart) {
            if (!socket) return;
            socket.emit('cartUpdate', {
                index: index,
                x: cart.body.position.x,
                y: cart.body.position.y,
                angle: cart.body.angle,
                vx: cart.body.velocity.x,
                vy: cart.body.velocity.y
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

        sendHoleSunk: function () {
            if (!socket) return;
            socket.emit('holeSunk');
        },

        requestPickup: function (clubId) {
            if (!socket) {
                console.error('[Networking] requestPickup: Socket not connected');
                return;
            }
            console.log('[Networking] Emitting requestPickup for club:', clubId);
            socket.emit('requestPickup', clubId);
        },

        requestSwap: function (pickupClubId, droppedClubType, x, y) {
            if (!socket) {
                console.error('[Networking] requestSwap: Socket not connected');
                return;
            }
            var name = droppedClubType && droppedClubType.name ? droppedClubType.name : 'Iron';
            console.log('[Networking] Emitting requestSwap. Pickup:', pickupClubId, 'DropName:', name);
            socket.emit('requestSwap', {
                pickupClubId: pickupClubId,
                droppedClubName: name, // Send name only for robustness
                x: x,
                y: y
            });
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

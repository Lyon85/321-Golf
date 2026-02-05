(function (global) {
    var Golf = global.Golf;
    var state = Golf.state;

    Golf.startCountdown = function (scene) {
        var count = 3;
        scene.countdownEl.classList.remove('hidden');
        scene.countdownEl.innerText = count;
        state.isMatchActive = false;
        scene.time.addEvent({
            delay: 1000,
            repeat: 3,
            callback: function () {
                count--;
                if (count > 0) {
                    scene.countdownEl.innerText = count;
                } else if (count === 0) {
                    scene.countdownEl.innerText = 'GOLF!';
                    scene.cameras.main.shake(500, 0.01);
                } else {
                    scene.countdownEl.classList.add('hidden');
                    state.isMatchActive = true;
                }
            }
        });
    };

    Golf.triggerStart = function (scene) {
        if (state.isWaitingToStart) {
            state.isWaitingToStart = false;
            if (scene.overlay) scene.overlay.style.display = 'none';
            Golf.startCountdown(scene);
        }
    };

    Golf.setupStartTrigger = function (scene) {
        var startTrigger = function () {
            if (state.isWaitingToStart) {
                // In single player, just trigger start. 
                // Multiplayer auto-starts on connection now.
                Golf.triggerStart(scene);
            }
        };
        window.addEventListener('keydown', function (e) {
            if (e.code === 'Space') {
                if (document.activeElement.tagName === 'INPUT') return;
                startTrigger();
            }
        });
        if (scene.overlay) {
            scene.overlay.addEventListener('click', function (e) {
                var controls = document.getElementById('multiplayer-controls');
                if (controls && controls.contains(e.target)) return;
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
                startTrigger();
            });
        }
    };
})(typeof window !== 'undefined' ? window : this);

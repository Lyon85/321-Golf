(function (global) {
    var Golf = global.Golf;
    var CAT_PLAYER = Golf.CAT_PLAYER;
    var CAT_BALL = Golf.CAT_BALL;
    var CAT_BUILDING = Golf.CAT_BUILDING;
    var CAT_DEFAULT = Golf.CAT_DEFAULT;
    var CAT_HOLE = Golf.CAT_HOLE;

    Golf.createPlayer = function (scene, x, y, color, isAI, playerIndex) {
        var pBody = scene.matter.add.rectangle(x, y, 32, 40, {
            friction: 0.005,
            frictionAir: 0.01,
            label: 'player',
            height: 12,
            collisionFilter: {
                category: CAT_PLAYER,
                mask: CAT_BUILDING | CAT_DEFAULT | Golf.CAT_TERRAIN | CAT_BALL | Golf.CAT_CAR
            }
        });
        pBody.baseFrictionAir = 0.03;

        // CSS 3D Character Construction
        var div = document.createElement('div');
        div.className = 'player-container';
        div.style.setProperty('--player-color', '#' + color.toString(16).padStart(6, '0'));

        div.innerHTML = `
<div class="minecraft">
  <div id="golfer">
    <div class="cube head">
      <div class="face front">
        <div class="eyes"></div>
        <div class="nose"></div>
      </div>
      <div class="face back"></div>
      <div class="face left"></div>
      <div class="face right"></div>
      <div class="face top"></div>
      <div class="face bottom"></div>
      <div class="cap">
        <div class="brim"></div>
      </div>
    </div>

    <div class="cube torso">
      <div class="face front"><div class="vest-pattern"></div></div>
      <div class="face back"></div>
      <div class="face left"></div>
      <div class="face right"></div>
      <div class="face top"></div>
      <div class="face bottom"></div>
    </div>

    <div class="cube arm left">
      <div class="face front"></div><div class="face back"></div>
      <div class="face left"></div><div class="face right"></div>
      <div class="face top"></div><div class="face bottom"></div>
      <div class="club">
        <div class="shaft"></div>
        <div class="head-iron"></div>
      </div>
    </div>

    <div class="cube arm right">
      <div class="face front"></div><div class="face back"></div>
      <div class="face left"></div><div class="face right"></div>
      <div class="face top"></div><div class="face bottom"></div>
    </div>

    <div class="cube leg left">
      <div class="face front"></div><div class="face back"></div>
      <div class="face left"></div><div class="face right"></div>
      <div class="face top"></div><div class="face bottom"></div>
    </div>
    
    <div class="cube leg right">
      <div class="face front"></div><div class="face back"></div>
      <div class="face left"></div><div class="face right"></div>
      <div class="face top"></div><div class="face bottom"></div>
    </div>
    
    <div class="player-shadow"></div>
  </div>
</div>
        `;

        var pSprite = scene.add.dom(0, 0, div);
        // No setDisplaySize for DOM elements, size is controlled by CSS 

        var bBody = scene.matter.add.circle(x + 60, y, 8, {
            friction: 0.005,
            frictionAir: 0.01,
            restitution: 0.2,
            label: 'ball',
            collisionFilter: {
                category: CAT_BALL,
                mask: CAT_BUILDING | CAT_DEFAULT | CAT_HOLE | Golf.CAT_TERRAIN | CAT_PLAYER | Golf.CAT_CAR
            }
        });
        bBody.baseFrictionAir = 0.01;
        var bSprite = scene.add.circle(0, 0, 8, 0xffffff).setStrokeStyle(1, 0x000000).setDepth(5);
        var bShadow = scene.add.circle(0, 0, 8, 0x000000, 0.3).setDepth(4).setVisible(false);
        var trail = scene.add.particles(0, 0, 'white', {
            follow: bSprite,
            scale: { start: 0.5, end: 0 },
            alpha: { start: 0.3, end: 0 },
            lifespan: 300,
            tint: color,
            frequency: 50
        });

        return {
            body: pBody,
            sprite: pSprite,
            ball: bBody,
            ballSprite: bSprite,
            ballShadow: bShadow,
            ballHeight: 0,
            ballInFlight: false,
            isAI: isAI,
            color: color,
            isAiming: false,
            power: 0,
            powerDir: 1,
            aiTimer: 0,
            inventory: [],
            activeClub: null,
            trail: trail,
            lastSafePos: { x: x + 60, y: y },
            state: Golf.PLAYER_STATES.IDLE,
            direction: Golf.DIRECTIONS.S,
            swingState: Golf.SWING_STATES.NONE,
            playerIndex: playerIndex || 0,
            z: 0,
            vz: 0
        };
    };


})(typeof window !== 'undefined' ? window : this);

'use strict';
/* ==== Сенсорное управление + клавиатура ==== */

const input = {
  joyX: 0, joyY: 0,        // -1..1, joyY>0 = вниз экрана
  moveX: 0, moveY: 0,
  sprint: false,
  shootHeld: false,
  shootCharge: 0,          // 0..1
  shootLatch: false,
  passLatch: false,
  tackleLatch: false,
};

function initControls() {
  /* --- Джойстик (левая половина, динамическая позиция базы) --- */
  const zone = document.getElementById('joyZone');
  const base = document.getElementById('joyBase');
  const stick = document.getElementById('joyStick');
  const MAXR = 52;
  let joyId = null, cx = 0, cy = 0;

  zone.addEventListener('pointerdown', (e) => {
    Snd.init(); Snd.resume();
    if (joyId !== null) return;
    joyId = e.pointerId;
    cx = e.clientX; cy = e.clientY;
    base.style.display = 'block';
    base.style.left = (cx - 64) + 'px';
    base.style.top = (cy - 64) + 'px';
    zone.setPointerCapture(e.pointerId);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > MAXR) { dx = dx / len * MAXR; dy = dy / len * MAXR; }
    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    input.joyX = dx / MAXR;
    input.joyY = dy / MAXR;
  });
  const joyEnd = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    input.joyX = 0; input.joyY = 0;
    stick.style.transform = 'translate(-50%,-50%)';
    base.style.display = 'none';
  };
  zone.addEventListener('pointerup', joyEnd);
  zone.addEventListener('pointercancel', joyEnd);

  /* --- Кнопки --- */
  const bind = (id, down, up) => {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); Snd.init(); Snd.resume();
      el.classList.add('pressed');
      if (down) down();
    });
    const end = (e) => {
      el.classList.remove('pressed');
      if (up) up();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);
  };

  bind('btnPass', () => { input.passLatch = true; });
  bind('btnTackle', () => { input.tackleLatch = true; });
  bind('btnSprint', () => { input.sprint = true; }, () => { input.sprint = false; });
  bind('btnShoot', () => {
    input.shootHeld = true;
  }, () => {
    if (input.shootHeld) input.shootLatch = true;
    input.shootHeld = false;
  });

  /* --- Клавиатура (для отладки и десктопа) --- */
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (keys[e.code]) return;
    keys[e.code] = true;
    if (e.code === 'KeyJ') input.passLatch = true;
    if (keys['KeyK']) { input.shootHeld = true; }
    if (e.code === 'Space') input.tackleLatch = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'KeyK' && input.shootHeld) input.shootLatch = true;
    if (input.shootHeld && !keys['KeyK']) { input.shootHeld = false; }
  });

  window.addEventListener('pointerdown', () => { Snd.init(); Snd.resume(); }, { once: true });

  /* Обновление каждый кадр */
  return function poll(dt) {
    let kx = 0, ky = 0;
    if (keys['KeyA'] || keys['ArrowLeft']) kx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) kx += 1;
    if (keys['KeyW'] || keys['ArrowUp']) ky -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) ky += 1;
    const mag = Math.sqrt(input.joyX ** 2 + input.joyY ** 2);
    if (mag > 0.02) { input.moveX = input.joyX; input.moveY = input.joyY; }
    else if (kx || ky) {
      const l = Math.sqrt(kx * kx + ky * ky);
      input.moveX = kx / l; input.moveY = ky / l;
    } else if (input.shootHeld) { /* стоим при замахе */ }
    else { input.moveX = 0; input.moveY = 0; }

    input.sprint = input.sprint || !!keys['KeyL'];
    if (input.shootHeld) input.shootCharge = Math.min(1, input.shootCharge + dt * 1.4);
    if (!input.shootHeld && !input.shootLatch) input.shootCharge = 0;
  };
}

/* Разовая очистка защёлок — вызывает game.js после обработки */
function flushLatches() {
  input.passLatch = false;
  input.tackleLatch = false;
  input.shootLatch = false;
}

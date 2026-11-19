'use strict';
/* ==== Управление v2: P1 + P2 (один экран), кнопки камеры/смены, клавиатура ==== */

const input = mkInput();
const input2 = mkInput();

function mkInput() {
  return {
    joyX: 0, joyY: 0,
    moveX: 0, moveY: 0,
    sprint: false,
    shootHeld: false,
    shootCharge: 0,
    shootLatch: false,
    passLatch: false,
    tackleLatch: false,
    switchLatch: false,
    camLatch: false,
    active: true,
  };
}

function initControls() {
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

  /* --- P2 джойстик (верхняя зона, только в 2P) --- */
  const zone2 = document.getElementById('joyZone2');
  const base2 = document.getElementById('joyBase2');
  const stick2 = document.getElementById('joyStick2');
  let joyId2 = null, cx2 = 0, cy2 = 0;
  if (zone2) {
    zone2.addEventListener('pointerdown', (e) => {
      if (!input2.active) return;
      if (joyId2 !== null) return;
      joyId2 = e.pointerId;
      cx2 = e.clientX; cy2 = e.clientY;
      base2.style.display = 'block';
      base2.style.left = (cx2 - 64) + 'px';
      base2.style.top = (cy2 - 64) + 'px';
      zone2.setPointerCapture(e.pointerId);
    });
    zone2.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId2) return;
      let dx = e.clientX - cx2, dy = e.clientY - cy2;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > MAXR) { dx = dx / len * MAXR; dy = dy / len * MAXR; }
      stick2.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      input2.joyX = dx / MAXR;
      input2.joyY = dy / MAXR;
    });
    const joyEnd2 = (e) => {
      if (e.pointerId !== joyId2) return;
      joyId2 = null;
      input2.joyX = 0; input2.joyY = 0;
      stick2.style.transform = 'translate(-50%,-50%)';
      base2.style.display = 'none';
    };
    zone2.addEventListener('pointerup', joyEnd2);
    zone2.addEventListener('pointercancel', joyEnd2);
  }

  /* --- кнопки --- */
  const bind = (id, down, up) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); Snd.init(); Snd.resume();
      el.classList.add('pressed');
      if (down) down();
    });
    const end = () => {
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
  bind('btnShoot', () => { input.shootHeld = true; },
    () => { if (input.shootHeld) input.shootLatch = true; input.shootHeld = false; });
  bind('btnSwitch', () => { input.switchLatch = true; });
  bind('btnCam', () => { input.camLatch = true; });

  /* P2 кнопки */
  bind('btnPass2', () => { input2.passLatch = true; });
  bind('btnTackle2', () => { input2.tackleLatch = true; });
  bind('btnSprint2', () => { input2.sprint = true; }, () => { input2.sprint = false; });
  bind('btnShoot2', () => { input2.shootHeld = true; },
    () => { if (input2.shootHeld) input2.shootLatch = true; input2.shootHeld = false; });

  /* --- клавиатура --- */
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (keys[e.code]) return;
    keys[e.code] = true;
    if (e.code === 'KeyJ') input.passLatch = true;
    if (e.code === 'KeyC') input.camLatch = true;
    if (e.code === 'KeyQ') input.switchLatch = true;
    if (e.code === 'Space') input.tackleLatch = true;
    if (e.code === 'Numpad1') input2.passLatch = true;
    if (e.code === 'Numpad0') input2.tackleLatch = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'KeyK' && input.shootHeld) input.shootLatch = true;
    if (input.shootHeld && !keys['KeyK']) input.shootHeld = false;
    if (e.code === 'Numpad2' && input2.shootHeld) input2.shootLatch = true;
    if (input2.shootHeld && !keys['Numpad2']) input2.shootHeld = false;
  });

  window.addEventListener('pointerdown', () => { Snd.init(); Snd.resume(); }, { once: true });

  return function poll(dt) {
    /* P1 */
    pollOne(input, keys, dt, false);
    /* P2: стрелки + Numpad */
    pollOne(input2, keys, dt, true);
  };
}

function pollOne(inp, keys, dt, isTwo) {
  if (!inp.active) { inp.moveX = 0; inp.moveY = 0; inp.shootCharge = 0; return; }
  let kx = 0, ky = 0;
  if (!isTwo) {
    if (keys['KeyA'] || keys['ArrowLeft']) kx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) kx += 1;
    if (keys['KeyW'] || keys['ArrowUp']) ky -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) ky += 1;
  } else {
    if (keys['KeyF'] || keys['ArrowLeft2']) kx -= 1;
    if (keys['KeyH'] || keys['ArrowRight2']) kx += 1;
    if (keys['KeyT'] || keys['ArrowUp2']) ky -= 1;
    if (keys['KeyG'] || keys['ArrowDown2']) ky += 1;
  }
  const mag = Math.sqrt(inp.joyX * inp.joyX + inp.joyY * inp.joyY);
  if (mag > 0.02) { inp.moveX = inp.joyX; inp.moveY = inp.joyY; }
  else if (kx || ky) {
    const l = Math.sqrt(kx * kx + ky * ky);
    inp.moveX = kx / l; inp.moveY = ky / l;
  } else if (!inp.shootHeld) { inp.moveX = 0; inp.moveY = 0; }

  if (isTwo && inp.sprint && keys['Numpad3'] !== undefined) inp.sprint = true;
  if (inp.shootHeld) inp.shootCharge = Math.min(1, inp.shootCharge + dt * 1.4);
  if (!inp.shootHeld && !inp.shootLatch) inp.shootCharge = 0;
}

function flushLatches() {
  for (const inp of [input, input2]) {
    inp.passLatch = false;
    inp.tackleLatch = false;
    inp.shootLatch = false;
    inp.switchLatch = false;
    inp.camLatch = false;
  }
}

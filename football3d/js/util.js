'use strict';
/* ==== Глобальная конфигурация и математика ==== */

const CFG = {
  FIELD_L: 105, FIELD_W: 68,
  GOAL_W: 7.32, GOAL_H: 2.44,
  BALL_R: 0.36,
  GRAVITY: 13.5,
  PLAYER_SPEED: 7.6,
  SPRINT_MULT: 1.36,
  KEEPER_SPEED: 7.2,
  CONTROL_DIST: 1.35,
  KICK_COOLDOWN: 0.32,
};

const DIFF = {
  easy:   { speed: 0.84, skill: 0.55, passRate: 0.55, shotRates: 0.55 },
  normal: { speed: 0.94, skill: 0.75, passRate: 0.75, shotRate: 0.7 },
  hard:   { speed: 1.02, skill: 0.92, passRate: 0.9,  shotRate: 0.85 },
};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };

function angLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function makeCanvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

/* Простая очередь конечных автоматов времени */
class Timer {
  constructor() { this.t = 0; this.cb = null; }
  start(sec, cb) { this.t = sec; this.cb = cb; }
  update(dt) {
    if (this.t <= 0) return;
    this.t -= dt;
    if (this.t <= 0 && this.cb) { const cb = this.cb; this.cb = null; cb(); }
  }
  clear() { this.t = 0; this.cb = null; }
}

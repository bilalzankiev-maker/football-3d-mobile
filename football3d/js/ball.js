'use strict';
/* ==== Мяч: физика, отскоки, вращение, владение ==== */

class Ball {
  constructor(scene) {
    this.r = CFG.BALL_R;
    const tex = makeCanvasTexture(256, 128, (g, w, h) => {
      g.fillStyle = '#f5f5f5'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#111';
      for (let i = 0; i < 12; i++) {
        const cx = (i % 6) * (w / 6) + (i < 6 ? 0 : w / 12) + w / 12;
        const cy = i < 6 ? h * 0.3 : h * 0.7;
        g.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = -Math.PI / 2 + k * (Math.PI * 2 / 5);
          const x = cx + Math.cos(a) * 16, y = cy + Math.sin(a) * 16;
          k === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.closePath(); g.fill();
      }
    });
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(this.r, 20, 14),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(this.r * 1.15, 14),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.pos = new THREE.Vector3(0, this.r, 0);
    this.vel = new THREE.Vector3();
    this.spinAxis = new THREE.Vector3(0, 1, 0);
    this.spinRate = 0;
    this.owner = null;          // текущий владелец (Player) или null
    this.lastTouchTeam = 0;
    this.claimCooldown = 0;     // после удара нельзя мгновенно подобрать
    this.ownerHoldT = 0;        // сколько владелец ведёт мяч (для ИИ)
    scene.add(this.mesh, this.shadow);
  }

  reset(x, z) {
    this.pos.set(x, this.r, z);
    this.vel.set(0, 0, 0);
    this.owner = null;
    this.claimCooldown = 0;
  }

  kick(vx, vy, vz, team, player) {
    this.owner = null;
    this.vel.set(vx, vy, vz);
    this.claimCooldown = CFG.KICK_COOLDOWN;
    if (team !== undefined) this.lastTouchTeam = team;
    this.lastPlayer = player || null;
    this.kickPower = Math.min(1, Math.sqrt(vx * vx + vz * vz) / 26);
    Snd.kick(this.kickPower || 0.5);
  }

  takeBy(player) {
    if (this.owner === player) return;
    this.owner = player;
    this.ownerHoldT = 0;
    this.lastPlayer = player;
    this.vel.set(0, 0, 0);
    this.claimCooldown = 0;
    this.lastTouchTeam = player.team;
    this.spinRate = 0;
    player.takeBall();
  }

  update(dt, players) {
    this.claimCooldown = Math.max(0, this.claimCooldown - dt);

    if (this.owner) {
      const p = this.owner;
      const spd = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
      const lead = 0.72 + spd * 0.05;
      const jitter = spd > 6 ? Math.sin(performance.now() * 0.02) * 0.08 : 0;
      const tx = p.pos.x + Math.sin(p.heading) * lead + Math.cos(p.heading) * jitter;
      const tz = p.pos.z + Math.cos(p.heading) * lead - Math.sin(p.heading) * jitter;
      this.pos.set(tx, this.r, tz);
      this.vel.set(p.vel.x, 0, p.vel.z);
      this.ownerHoldT += dt;
      return;
    }

    // воздух / гравитация
    this.vel.y -= CFG.GRAVITY * dt;
    if (this.pos.y > this.r + 0.01) this.vel.multiplyScalar(1 - 0.12 * dt);
    else {
      // трение качения
      const hv = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
      if (hv > 0.01) {
        const dec = Math.min(4.5 * dt, hv);
        this.vel.x -= this.vel.x / hv * dec;
        this.vel.z -= this.vel.z / hv * dec;
      } else { this.vel.x = 0; this.vel.z = 0; }
    }
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // земля
    if (this.pos.y < this.r) {
      this.pos.y = this.r;
      if (this.vel.y < 0) {
        this.vel.y = -this.vel.y * 0.52;
        if (this.vel.y < 0.9) this.vel.y = 0;
        this.vel.x *= 0.88; this.vel.z *= 0.88;
        if (Math.abs(this.vel.y) > 1) Snd.kick(Math.min(0.5, this.vel.y * 0.04));
      }
    }

    // штанги и перекладина (упрощённо: отскок от вертикали ворот)
    const gl = FL(), gw = CFG.GOAL_W / 2;
    for (const s of [-1, 1]) {
      if (Math.abs(this.pos.x - gl * s) < 0.35 && Math.abs(this.pos.y - CFG.GOAL_H) < 0.3
          && Math.abs(this.pos.z) < gw) this.vel.y = -Math.abs(this.vel.y) * 0.5;
      for (const t of [-1, 1]) {
        if (Math.abs(this.pos.x - gl * s) < 0.3 && Math.abs(this.pos.z - gw * t) < 0.32
            && this.pos.y < CFG.GOAL_H) {
          this.pos.x = gl * s - s * 0.35;
          this.vel.x *= -0.55; this.vel.z *= 0.8;
        }
      }
    }

    // вращение
    const hv = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
    if (hv > 0.05) {
      this.spinAxis.set(this.vel.z, 0, -this.vel.x).normalize();
      this.spinRate = hv / this.r;
      this.mesh.rotateOnWorldAxis(this.spinAxis, this.spinRate * dt);
    }
  }

  syncMesh() {
    this.mesh.position.copy(this.pos);
    this.shadow.position.set(this.pos.x, 0.02, this.pos.z);
    const k = clamp(1 - (this.pos.y - this.r) / 6, 0.25, 1);
    this.shadow.material.opacity = 0.32 * k;
    this.shadow.scale.setScalar(1 / k * 0.98);
  }
}

/* Подбор мяча: ближайший подходящий игрок забирает, если нет владения */
function findClaimant(ball, players, controlled) {
  if (ball.claimCooldown > 0 || ball.pos.y > ball.r + 1.15) return null;
  let best = null, bd = 1e9;
  for (const p of players) {
    if (p.koTimer > 0) continue;
    const d = dist2(p.pos.x, p.pos.z, ball.pos.x, ball.pos.z);
    const reach = p === controlled || p.isKeeper ? CFG.CONTROL_DIST + 0.15 : CFG.CONTROL_DIST;
    const heightOk = p.isKeeper ? ball.pos.y < 3 : ball.pos.y < 1.6;
    if (d < reach && heightOk && d < bd) { bd = d; best = p; }
  }
  return best;
}

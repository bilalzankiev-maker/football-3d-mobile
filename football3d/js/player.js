'use strict';
/* ==== Футболист: сборной меш из примитивов + процедурные анимации ==== */

const TEAM_KITS = [
  { shirt: 0x1d5fd6, shorts: 0x10265e, socks: 0x1d5fd6, name: 'СИНИЕ' },
  { shirt: 0xd63a2a, shorts: 0x5e1610, socks: 0xd63a2a, name: 'КРАСНЫЕ' },
];

function buildPlayerMesh(kit, skin) {
  const g = new THREE.Group();
  const matShirt = new THREE.MeshLambertMaterial({ color: kit.shirt });
  const matShorts = new THREE.MeshLambertMaterial({ color: kit.shorts });
  const matSkin = new THREE.MeshLambertMaterial({ color: skin });
  const matDark = new THREE.MeshLambertMaterial({ color: 0x151518 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.34), matShirt);
  torso.position.y = 1.12;
  g.add(torso);

  const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.28, 0.36), matShorts);
  shorts.position.y = 0.68;
  g.add(shorts);

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), matSkin);
  neck.position.y = 1.5;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), matSkin);
  head.position.y = 1.68;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), matDark);
  hair.position.y = 1.7;
  g.add(hair);

  // ноги: pivot у бедра
  function limb(w, len, mat, px, py) {
    const geo = new THREE.BoxGeometry(w, len, w);
    geo.translate(0, -len / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, 0);
    return m;
  }
  const legL = limb(0.17, 0.56, matSkin, -0.14, 0.56);
  const legR = limb(0.17, 0.56, matSkin, 0.14, 0.56);
  const sockL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.18), new THREE.MeshLambertMaterial({ color: kit.socks }));
  sockL.position.set(0, -0.4, 0); legL.add(sockL);
  const sockR = sockL.clone(); legR.add(sockR);
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.3), matDark);
  bootL.position.set(0, -0.56, 0.06); legL.add(bootL);
  const bootR = bootL.clone(); legR.add(bootR);
  const armL = limb(0.13, 0.52, matShirt, -0.37, 1.42);
  const armR = limb(0.13, 0.52, matShirt, 0.37, 1.42);
  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), matSkin);
  handL.position.set(0, -0.55, 0); armL.add(handL);
  const handR = handL.clone(); armR.add(handR);

  g.add(legL, legR, armL, armR);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;

  return { group: g, legL, legR, armL, armR, torso, head, shadow };
}

class Player {
  constructor(team, role, fx, fz, scene) {
    this.team = team;        // 0 | 1
    this.role = role;        // 'GK' | 'DF' | 'MF' | 'FW'
    this.fx = fx; this.fz = fz; // доля поля: fx∈[-1,1] вдоль атаки, fz∈[-1,1] поперёк
    this.isKeeper = role === 'GK';
    this.kit = TEAM_KITS[team];

    const skins = [0xf1c8a0, 0xd9a06b, 0x8a5a34, 0x5c3520];
    const skin = skins[(Math.random() * skins.length) | 0];
    const m = buildPlayerMesh(this.kit, skin);
    this.mesh = m.group; this.parts = m;
    scene.add(m.group, m.shadow);

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.animPhase = Math.random() * 6;
    this.moveTarget = new THREE.Vector3();
    this.maxSpeed = PLAYER_BASE_SPEED * (this.isKeeper ? CFG.KEEPER_SPEED / CFG.PLAYER_SPEED
                      : role === 'FW' ? 1.04 : role === 'MF' ? 1.0 : 0.97);
    this.stamina = 100;
    this.sprinting = false;
    this.aiTarget = new THREE.Vector3();
    this.aiSpeedScale = 1;
    this.decideT = rand(0, 0.3);

    // анимационные таймеры
    this.kickAnimT = 0;
    this.tackleAnimT = 0;
    this.celebrateT = 0;
    this.diveT = 0; this.diveDir = 0;
    this.stumbleT = 0;
    this.koTimer = 0;   // не может подобрать мяч (после паса)
    this.tackleCd = 0;
    this.holdWait = 0;  // вратарь держит мяч
  }

  takeBall() { this.holdBallT = 0; }

  speedNow() {
    let s = this.maxSpeed;
    if (this.sprinting && this.stamina > 1) s *= CFG.SPRINT_MULT;
    else if (this.sprinting) s *= 1.05;
    if (this.hasBall()) s *= 0.92;
    if (this.stumbleT > 0) s *= 0.45;
    return s * this.aiSpeedScale;
  }
  hasBall() { return typeof ball !== 'undefined' && ball.owner === this; }

  setMoveTarget(x, z) { this.moveTarget.set(x, 0, z); }

  update(dt) {
    // движение к цели
    const dx = this.moveTarget.x - this.pos.x;
    const dz = this.moveTarget.z - this.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    let vx = 0, vz = 0;
    if (d > 0.12) {
      const sp = this.speedNow();
      const scale = Math.min(1, d / (sp * dt + 0.001));
      vx = dx / d * sp * scale;
      vz = dz / d * sp * scale;
    }
    const smooth = 1 - Math.exp(-9 * dt);
    this.vel.x += (vx - this.vel.x) * smooth;
    this.vel.z += (vz - this.vel.z) * smooth;
    this.pos.x = clamp(this.pos.x + this.vel.x * dt, -FL() - 3, FL() + 3);
    this.pos.z = clamp(this.pos.z + this.vel.z * dt, -FW() - 3, FW() + 3);

    const spd = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
    if (spd > 0.4) {
      this.heading = angLerp(this.heading, Math.atan2(this.vel.x, this.vel.z), Math.min(1, 10 * dt));
    }

    // выносливость
    if (this.sprinting && spd > 4) this.stamina = Math.max(0, this.stamina - 17 * dt);
    else this.stamina = Math.min(100, this.stamina + (spd < 1 ? 12 : 7) * dt);

    // таймеры
    if (this.kickAnimT > 0) this.kickAnimT -= dt;
    if (this.tackleAnimT > 0) this.tackleAnimT -= dt;
    if (this.celebrateT > 0) this.celebrateT -= dt;
    if (this.stumbleT > 0) this.stumbleT -= dt;
    if (this.koTimer > 0) this.koTimer -= dt;
    if (this.tackleCd > 0) this.tackleCd -= dt;
    if (this.diveT > 0) this.diveT -= dt;

    this.animate(dt, spd);
  }

  animate(dt, spd) {
    const P = this.parts;
    if (this.celebrateT > 0) {
      // праздник: прыжки, руки вверх
      const jump = Math.abs(Math.sin(this.celebrateT * Math.PI * 2.2));
      this.mesh.position.y = jump * 0.5;
      this.mesh.rotation.z = 0;
      P.armL.rotation.x = -2.6; P.armR.rotation.x = -2.6;
      P.armL.rotation.z = -0.5; P.armR.rotation.z = 0.5;
      P.legL.rotation.x = 0.3; P.legR.rotation.x = -0.3;
      return;
    }
    this.mesh.position.y = 0;
    P.armL.rotation.z = 0; P.armR.rotation.z = 0;

    if (this.diveT > 0) {
      // прыжок вратаря
      const k = 1 - this.diveT / 0.6;
      this.mesh.rotation.z = this.diveDir * 1.25 * Math.sin(k * Math.PI);
      this.mesh.position.y = Math.sin(k * Math.PI) * 0.7;
      P.armL.rotation.x = -2.8; P.armR.rotation.x = -2.8;
      return;
    }
    this.mesh.rotation.z = 0;

    const runAmp = clamp(spd / 7, 0.15, 1.15) * 0.85;
    this.animPhase += spd * dt * 1.6 + dt * 0.5;
    const s = Math.sin(this.animPhase * 6);

    P.legL.rotation.x = s * runAmp;
    P.legR.rotation.x = -s * runAmp;
    P.armL.rotation.x = -s * runAmp * 0.8;
    P.armR.rotation.x = s * runAmp * 0.8;

    if (this.kickAnimT > 0) {
      const k = 1 - this.kickAnimT / 0.32; // 0→1
      P.legR.rotation.x = k < 0.4 ? -1.5 * (k / 0.4) : (1.4 * ((k - 0.4) / 0.6)) - 0.2;
      P.armL.rotation.x = 0.9;
    } else if (this.tackleAnimT > 0) {
      // подкат: наклон корпуса и выпад
      const k = 1 - this.tackleAnimT / 0.45;
      this.mesh.rotation.z = Math.sin(k * Math.PI) * 0.9;
      this.mesh.position.y = -0.35 * Math.sin(k * Math.PI);
      P.legR.rotation.x = -1.6 * Math.sin(k * Math.PI);
      P.legL.rotation.x = 0.4;
    } else if (this.stumbleT > 0) {
      this.mesh.rotation.z = Math.sin(this.stumbleT * 9) * 0.25;
    }

    this.mesh.position.x = this.pos.x;
    this.mesh.position.z = this.pos.z;
    this.mesh.rotation.y = this.heading;
    this.parts.shadow.position.set(this.pos.x, 0.025, this.pos.z);
  }

  playKick() { this.kickAnimT = 0.32; }
  playTackle() { this.tackleAnimT = 0.45; }
  playCelebrate() { this.celebrateT = 2.6; }
  playDive(dir) { this.diveT = 0.6; this.diveDir = dir; }
}

const PLAYER_BASE_SPEED = CFG.PLAYER_SPEED;

'use strict';
/* ==== Футболист v2: меш из примитивов, номера, наклон корпуса, отзывчивое движение ==== */

const TEAM_KITS = [
  { shirt: 0x1d5fd6, shorts: 0x10265e, socks: 0x1d5fd6, name: 'СИНИЕ', gk: 0x12a35a },
  { shirt: 0xd63a2a, shorts: 0x5e1610, socks: 0xd63a2a, name: 'КРАСНЫЕ', gk: 0xe8a41f },
];

/* текстура номера на спине */
function makeNumberTex(num, fg, bg) {
  return makeCanvasTexture(128, 128, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
    g.fillStyle = fg;
    g.font = 'bold 92px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(num), 64, 70);
  });
}

function buildPlayerMesh(kit, skin, isKeeper, number) {
  const g = new THREE.Group();
  const shirtColor = isKeeper ? kit.gk : kit.shirt;
  const matShirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const matShorts = new THREE.MeshLambertMaterial({ color: isKeeper ? 0x1c1c22 : kit.shorts });
  const matSkin = new THREE.MeshLambertMaterial({ color: skin });
  const matDark = new THREE.MeshLambertMaterial({ color: 0x151518 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.34), matShirt);
  torso.position.y = 1.12;
  g.add(torso);

  /* номер на спине */
  const numTex = makeNumberTex(number, isKeeper ? '#111' : '#ffffff',
    '#' + shirtColor.toString(16).padStart(6, '0'));
  const numPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ map: numTex, transparent: true })
  );
  numPlane.position.set(0, 1.16, -0.176);
  numPlane.rotation.y = Math.PI;
  g.add(numPlane);

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

  function limb(w, len, mat, px, py) {
    const geo = new THREE.BoxGeometry(w, len, w);
    geo.translate(0, -len / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, 0);
    return m;
  }
  const legL = limb(0.17, 0.56, matSkin, -0.14, 0.56);
  const legR = limb(0.17, 0.56, matSkin, 0.14, 0.56);
  const sockL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.18), new THREE.MeshLambertMaterial({ color: isKeeper ? 0x1c1c22 : kit.socks }));
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
  constructor(team, role, fx, fz, scene, number) {
    this.team = team;        // 0 | 1
    this.role = role;        // 'GK' | 'DF' | 'MF' | 'FW'
    this.fx = fx; this.fz = fz;
    this.isKeeper = role === 'GK';
    this.kit = TEAM_KITS[team];
    this.number = number || 1;

    const skins = [0xf1c8a0, 0xd9a06b, 0x8a5a34, 0x5c3520];
    const skin = skins[(Math.random() * skins.length) | 0];
    const m = buildPlayerMesh(this.kit, skin, this.isKeeper, this.number);
    this.mesh = m.group; this.parts = m;
    scene.add(m.group, m.shadow);

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.animPhase = Math.random() * 6;
    this.moveTarget = new THREE.Vector3();
    this.maxSpeed = PLAYER_BASE_SPEED * (this.isKeeper ? CFG.KEEPER_SPEED / CFG.PLAYER_SPEED
                      : role === 'FW' ? 1.06 : role === 'MF' ? 1.0 : 0.96);
    this.stamina = 100;
    this.sprinting = false;
    this.aiTarget = new THREE.Vector3();
    this.aiSpeedScale = 1;
    this.decideT = rand(0, 0.3);
    this.leanT = 0;          // боковой наклон корпуса (в повороте)
    this.markTarget = null;  // персональная опека (ИИ)

    this.kickAnimT = 0;
    this.tackleAnimT = 0;
    this.celebrateT = 0;
    this.diveT = 0; this.diveDir = 0;
    this.stumbleT = 0;
    this.koTimer = 0;
    this.tackleCd = 0;
    this.holdWait = 0;
  }

  takeBall() { this.holdBallT = 0; }

  speedNow() {
    let s = this.maxSpeed;
    if (this.sprinting && this.stamina > 1) s *= CFG.SPRINT_MULT;
    else if (this.sprinting) s *= 1.05;
    if (this.hasBall()) s *= 0.93;
    if (this.stumbleT > 0) s *= 0.45;
    return s * this.aiSpeedScale;
  }
  hasBall() { return typeof ball !== 'undefined' && ball.owner === this; }

  setMoveTarget(x, z) { this.moveTarget.set(x, 0, z); }

  update(dt) {
    const dx = this.moveTarget.x - this.pos.x;
    const dz = this.moveTarget.z - this.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    let vx = 0, vz = 0;
    if (d > 0.1) {
      const sp = this.speedNow();
      const scale = clamp(d / 0.55, 0, 1);
      vx = dx / d * sp * scale;
      vz = dz / d * sp * scale;
    }
    /* ускорение резвое, торможение ещё резче */
    const spd2 = vx * vx + vz * vz;
    const cur2 = this.vel.x * this.vel.x + this.vel.z * this.vel.z;
    const braking = spd2 < cur2;
    const smooth = 1 - Math.exp(-(braking ? 16 : 10.5) * dt);
    this.vel.x += (vx - this.vel.x) * smooth;
    this.vel.z += (vz - this.vel.z) * smooth;
    this.pos.x = clamp(this.pos.x + this.vel.x * dt, -FL() - 3, FL() + 3);
    this.pos.z = clamp(this.pos.z + this.vel.z * dt, -FW() - 3, FW() + 3);

    const spd = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
    if (spd > 0.4) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      const prev = this.heading;
      const turnRate = lerp(13, 7.5, clamp(spd / 10, 0, 1));
      this.heading = angLerp(this.heading, want, Math.min(1, turnRate * dt));
      let dd = (this.heading - prev) % (Math.PI * 2);
      if (dd > Math.PI) dd -= Math.PI * 2;
      if (dd < -Math.PI) dd += Math.PI * 2;
      const targetLean = clamp(dd / Math.max(dt, 0.001) / 12, -0.35, 0.35);
      this.leanT += (targetLean - this.leanT) * (1 - Math.exp(-8 * dt));
    } else {
      this.leanT *= Math.max(0, 1 - 6 * dt);
    }

    if (this.sprinting && spd > 4) this.stamina = Math.max(0, this.stamina - 16 * dt);
    else this.stamina = Math.min(100, this.stamina + (spd < 1 ? 13 : 7.5) * dt);

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
      const jump = Math.abs(Math.sin(this.celebrateT * Math.PI * 2.2));
      this.mesh.position.y = jump * 0.5;
      this.mesh.rotation.z = 0;
      P.torso.rotation.x = -0.25;
      P.armL.rotation.x = -2.6; P.armR.rotation.x = -2.6;
      P.armL.rotation.z = -0.5; P.armR.rotation.z = 0.5;
      P.legL.rotation.x = 0.3; P.legR.rotation.x = -0.3;
      this.finishPose();
      return;
    }
    P.torso.rotation.x = clamp(spd / 10, 0, 1) * 0.22;
    P.torso.rotation.z = -this.leanT * 0.8;
    if (this.diveT <= 0) { this.mesh.rotation.z = 0; }
    P.armL.rotation.z = 0; P.armR.rotation.z = 0;

    if (this.diveT > 0) {
      const k = 1 - this.diveT / 0.6;
      this.mesh.rotation.z = this.diveDir * 1.25 * Math.sin(k * Math.PI);
      this.mesh.position.y = Math.sin(k * Math.PI) * 0.7;
      P.armL.rotation.x = -2.8; P.armR.rotation.x = -2.8;
      this.finishPose();
      return;
    }

    const runAmp = clamp(spd / 7, 0.15, 1.15) * 0.85;
    this.animPhase += spd * dt * 1.6 + dt * 0.5;
    const s = Math.sin(this.animPhase * 6);

    P.legL.rotation.x = s * runAmp;
    P.legR.rotation.x = -s * runAmp;
    P.armL.rotation.x = -s * runAmp * 0.8;
    P.armR.rotation.x = s * runAmp * 0.8;

    if (this.kickAnimT > 0) {
      const k = 1 - this.kickAnimT / 0.32;
      P.legR.rotation.x = k < 0.4 ? -1.5 * (k / 0.4) : (1.4 * ((k - 0.4) / 0.6)) - 0.2;
      P.armL.rotation.x = 0.9;
    } else if (this.tackleAnimT > 0) {
      const k = 1 - this.tackleAnimT / 0.45;
      this.mesh.rotation.z = Math.sin(k * Math.PI) * 0.9;
      this.mesh.position.y = -0.35 * Math.sin(k * Math.PI);
      P.legR.rotation.x = -1.6 * Math.sin(k * Math.PI);
      P.legL.rotation.x = 0.4;
    } else if (this.stumbleT > 0) {
      this.mesh.rotation.z = Math.sin(this.stumbleT * 9) * 0.25;
    }

    this.finishPose();
  }

  finishPose() {
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

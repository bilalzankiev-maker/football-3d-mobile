'use strict';
/* ==== Стадион: газон, разметка, ворота, трибуны, болельщики ==== */

const FL = () => CFG.FIELD_L / 2; // 52.5
const FW = () => CFG.FIELD_W / 2; // 34

function buildStadium(scene) {
  const group = new THREE.Group();
  scene.add(group);

  /* --- Внешний газон --- */
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 170),
    new THREE.MeshLambertMaterial({ color: 0x27692f })
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  group.add(outer);

  /* --- Поле с разметкой (canvas-текстура) --- */
  const PX = 14; // пикселей на метр
  const pitchTex = makeCanvasTexture(FL() * 2 * PX, FW() * 2 * PX, (g, w, h) => {
    const mx = (x) => (x + FL()) * PX;
    const mz = (z) => (z + FW()) * PX;
    g.fillStyle = '#2f7233'; g.fillRect(0, 0, w, h);
    const stripe = 5.25 * PX;
    for (let x = 0; x < w; x += stripe * 2) {
      g.fillStyle = 'rgba(255,255,255,0.045)';
      g.fillRect(x, 0, stripe, h);
    }
    // шум травы
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${rand(10,60)|0},${rand(80,140)|0},${rand(20,60)|0},0.08)`;
      g.fillRect(rand(0, w), rand(0, h), 2, 2);
    }
    // линии
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 0.13 * PX;
    g.strokeRect(mx(-FL() + 0.07), mz(-FW() + 0.07), (CFG.FIELD_L - 0.14) * PX, (CFG.FIELD_W - 0.14) * PX);
    g.beginPath(); g.moveTo(mx(0), mz(-FW())); g.lineTo(mx(0), mz(FW())); g.stroke();
    g.beginPath(); g.arc(mx(0), mz(0), 9.15 * PX, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(mx(0), mz(0), 0.25 * PX, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    for (const s of [-1, 1]) {
      const gl = FL() * s;
      // штрафная
      g.strokeRect(mx(gl - s * 16.5), mz(-20.16), 16.5 * PX, 40.32 * PX);
      // вратарская
      g.strokeRect(mx(gl - s * 5.5), mz(-9.16), 5.5 * PX, 18.32 * PX);
      // точка пенальти
      g.beginPath(); g.arc(mx(gl - s * 11), mz(0), 0.22 * PX, 0, Math.PI * 2); g.fill();
      // дуга штрафной
      g.beginPath();
      const a = Math.acos((16.5 - 11) / 9.15);
      g.arc(mx(gl - s * 11), mz(0), 9.15 * PX, s > 0 ? Math.PI - a : -a, s > 0 ? Math.PI + a : a, false);
      g.stroke();
      // угловые
      for (const t of [-1, 1]) {
        g.beginPath();
        g.arc(mx(gl - s * 0.07), mz(FW() * t - t * 0.07), 1 * PX, 0, Math.PI * 2);
        g.stroke();
      }
    }
  });
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.FIELD_L + 4, CFG.FIELD_W + 4),
    new THREE.MeshLambertMaterial({ map: pitchTex })
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  group.add(pitch);

  /* --- Ворота --- */
  const postMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
  const netTex = makeCanvasTexture(128, 128, (g) => {
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      g.moveTo(i * 16, 0); g.lineTo(i * 16, 128);
      g.moveTo(0, i * 16); g.lineTo(128, i * 16);
    }
    g.stroke();
  });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, opacity: 0.55, side: THREE.DoubleSide });

  for (const s of [-1, 1]) {
    const gx = FL() * s;
    const goal = new THREE.Group();
    const gw = CFG.GOAL_W, gh = CFG.GOAL_H, gd = 2.0;
    for (const t of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, gh, 10), postMat);
      post.position.set(gx, gh / 2, s * t * gw / 2);
      goal.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, gw + 0.14, 10), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(gx, gh, 0);
    goal.add(bar);
    // сетка
    const back = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), netMat);
    back.position.set(gx + s * gd, gh / 2, 0);
    back.rotation.y = Math.PI / 2;
    goal.add(back);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(gd, gw), netMat);
    top.rotation.z = Math.PI / 2; top.rotation.y = Math.PI / 2;
    top.position.set(gx + s * gd / 2, gh, 0);
    goal.add(top);
    for (const t of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(gd, gh), netMat);
      side.rotation.y = 0;
      side.position.set(gx + s * gd / 2, gh / 2, gw / 2 * t);
      goal.add(side);
    }
    group.add(goal);
  }

  /* --- Рекламные щиты --- */
  const adTex = makeCanvasTexture(1024, 64, (g, w, h) => {
    const ads = ['VIBE SPORT', '⌘ THREE.JS ARENA', 'MISTRAL FC', 'GOL! GOL! GOL!', 'TOUCHPLAY 3D'];
    const cols = ['#12336b', '#7a1010', '#0d4d22', '#7a6410', '#3a1455'];
    const seg = w / ads.length;
    for (let i = 0; i < ads.length; i++) {
      g.fillStyle = cols[i]; g.fillRect(i * seg, 0, seg, h);
      g.fillStyle = '#fff';
      g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ads[i], i * seg + seg / 2, h / 2 + 2);
    }
  });
  adTex.wrapS = THREE.RepeatWrapping;
  const adMat = new THREE.MeshBasicMaterial({ map: adTex });
  const mkBoard = (len, x, z, ry) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.95, 0.15), adMat.clone());
    b.material.map = adTex.clone();
    b.material.map.repeat.x = len / 24;
    b.material.map.needsUpdate = true;
    b.position.set(x, 0.48, z);
    b.rotation.y = ry;
    group.add(b);
  };
  mkBoard(CFG.FIELD_L + 6, 0, FW() + 1.4, 0);
  mkBoard(CFG.FIELD_L + 6, 0, -(FW() + 1.4), Math.PI);
  mkBoard(CFG.FIELD_W + 4, FL() + 2.4, 0, -Math.PI / 2);
  mkBoard(CFG.FIELD_W + 4, -(FL() + 2.4), 0, Math.PI / 2);

  /* --- Трибуны (ступени + болельщики) --- */
  const fans = { list: [], mesh: null, cheer: 0 };
  const stepGeo = new THREE.BoxGeometry(1, 1, 1);
  const stepMat = new THREE.MeshLambertMaterial({ color: 0x555a63 });
  const stepsDefs = [];
  const fanDefs = [];

  function addStand(axis, sign) {
    // axis: 'x' — длинная сторона (вдоль поля), 'z' — за воротами
    const rows = 14;
    const start = axis === 'x' ? FW() + 3.2 : FL() + 3.4;
    const rowStep = 1.05;
    const along = axis === 'x' ? CFG.FIELD_L + 14 : CFG.FIELD_W + 10;
    for (let r = 0; r < rows; r++) {
      const d = start + r * rowStep + 2.5;
      const y = 1.0 + r * 0.82;
      if (axis === 'x') stepsDefs.push([along, 0.85, 1.2, 0, y, sign * d]);
      else stepsDefs.push([1.2, 0.85, along, sign * d, y, 0]);
      const seats = Math.floor(along / 1.9);
      for (let i = 0; i < seats; i++) {
        const t = -along / 2 + (i + 0.5) * (along / seats) + rand(-0.2, 0.2);
        if (Math.random() < 0.12) continue; // пустые места
        let px, pz;
        if (axis === 'x') { px = t; pz = sign * d; } else { px = sign * d; pz = t; }
        fanDefs.push([px, y + 0.42, pz, rand(0, Math.PI * 2)]);
      }
    }
  }
  addStand('x', 1); addStand('x', -1); addStand('z', 1); addStand('z', -1);

  const steps = new THREE.InstancedMesh(stepGeo, stepMat, stepsDefs.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  stepsDefs.forEach((d, i) => {
    S.set(d[0], d[1], d[2]); P.set(d[3], d[4], d[5]);
    M.compose(P, Q, S);
    steps.setMatrixAt(i, M);
  });
  group.add(steps);

  // Болельщики — InstancedMesh с разноцветными фанатами
  const fanGeo = new THREE.BoxGeometry(0.5, 0.85, 0.4);
  fanGeo.translate(0, -0.42, 0);
  const fanMesh = new THREE.InstancedMesh(fanGeo,
    new THREE.MeshLambertMaterial({ color: 0xffffff }), fanDefs.length);
  const color = new THREE.Color();
  const paletteHome = [0x2050c8, 0x3a6ad8, 0x1a3a9a, 0xffffff, 0x88bbff];
  const paletteAway = [0xc82020, 0xd84a3a, 0x8a1a1a, 0xffffff, 0x303030];
  fanDefs.forEach((d, i) => {
    S.set(1, 1, 1); P.set(d[0], d[1], d[2]); Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d[3]);
    M.compose(P, Q, S);
    fanMesh.setMatrixAt(i, M);
    const side1 = d[2] > 0 === (Math.abs(d[2]) > Math.abs(d[0]));
    const pal = i % 2 === 0 ? paletteHome : paletteAway;
    if (side1) color.setHex(pal[(Math.random() * pal.length) | 0]);
    else color.setHex(0x777777);
    fanMesh.setColorAt(i, color);
  });
  if (fanMesh.instanceColor) fanMesh.instanceColor.needsUpdate = true;
  group.add(fanMesh);
  fans.mesh = fanMesh;
  fans.list = fanDefs;

  const dummy = new THREE.Object3D();
  let fanTick = 0;
  fans.update = function (dt, excite) {
    this.cheer = lerp(this.cheer, excite ? 1 : 0, dt * (excite ? 4 : 1.2));
    fanTick++;
    if (fanTick % 2) return;
    const t = performance.now() * 0.001;
    for (let i = 0; i < fanDefs.length; i++) {
      const d = fanDefs[i];
      const w = (i % 7) * 0.37 + 0.4;
      const amp = 0.06 + this.cheer * 0.5 * (0.6 + 0.4 * Math.sin(w * 3 + i));
      dummy.position.set(d[0], d[1] + Math.abs(Math.sin(t * (2 + this.cheer * 4) * w)) * amp, d[2]);
      dummy.rotation.y = d[3] + Math.sin(t * 2 + i) * 0.15 * (1 + this.cheer * 2);
      dummy.updateMatrix();
      fanMesh.setMatrixAt(i, dummy.matrix);
    }
    fanMesh.instanceMatrix.needsUpdate = true;
  };

  /* --- Крыша и опоры --- */
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a2f38, side: THREE.DoubleSide });
  const roofTex = null;
  for (const s of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(CFG.FIELD_L + 16, 0.5, 12), roofMat);
    roof.position.set(0, 1.0 + 14 * 0.82 + 3.4, s * (FW() + 3.2 + 9));
    roof.rotation.x = s * -0.12;
    group.add(roof);
    const roof2 = new THREE.Mesh(new THREE.BoxGeometry(CFG.FIELD_W + 11, 0.5, 11), roofMat);
    roof2.position.set(s * (FL() + 3.4 + 8.5), 1.0 + 14 * 0.82 + 3.4, 0);
    roof2.rotation.z = s * 0.12;
    group.add(roof2);
  }

  /* --- Прожекторы --- */
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x8a929c });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfdf6c8 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const tower = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 30, 8), poleMat);
    pole.position.y = 15;
    tower.add(pole);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 0.8), lampMat);
    panel.position.y = 31;
    panel.lookAt(new THREE.Vector3(sx * -10, 0, sz * -10).sub(new THREE.Vector3(0, 31, 0)));
    tower.add(panel);
    tower.position.set(sx * (FL() + 12), 0, sz * (FW() + 12));
    group.add(tower);
  }

  /* --- Угловые флаги --- */
  const flagMat = new THREE.MeshBasicMaterial({ color: 0xffd400, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), poleMat);
    pole.position.set(sx * FL(), 0.8, sz * FW());
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.35), flagMat);
    flag.position.set(sx * FL() - sx * 0.3, 1.4, sz * FW());
    group.add(pole, flag);
  }

  /* --- Небо --- */
  const skyTex = makeCanvasTexture(16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#1d4e8f');
    gr.addColorStop(0.55, '#6fa3d8');
    gr.addColorStop(0.82, '#bcd6ea');
    gr.addColorStop(1, '#e8edd8');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(320, 24, 14),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  /* --- Облака --- */
  const cloudTex = makeCanvasTexture(128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      const cx = 20 + rand(0, w - 40), cy = 22 + rand(-8, 8), r = 14 + rand(0, 10);
      const gr = g.createRadialGradient(cx, cy, 2, cx, cy, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.85)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    }
  });
  const clouds = { list: [], update(dt) {} };
  for (let i = 0; i < 7; i++) {
    const cm = new THREE.Mesh(
      new THREE.PlaneGeometry(rand(30, 60), rand(14, 26)),
      new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.75, depthWrite: false, fog: false })
    );
    cm.position.set(rand(-160, 160), rand(38, 60), rand(-160, 160));
    cm.rotation.x = -0.35;
    cm.userData.speed = rand(0.6, 1.6);
    cm.userData.wrap = 190;
    scene.add(cm);
    clouds.list.push(cm);
  }
  clouds.update = function (dt) {
    for (const c of this.list) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > c.userData.wrap) c.position.x = -c.userData.wrap;
    }
  };

  return { group, fans, clouds };
}

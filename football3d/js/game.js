'use strict';
/* ==== Главный модуль v2: камеры, прицельный пас, правила, 2P, комментарии ==== */

let ball = null;
let renderer, scene, camera;
let stadium = null;
let pollInput = null;
let markerMesh = null, marker2Mesh = null;
let reticleMesh = null, reticleMesh2 = null;
let confetti = null, tracer = null;

const G = {
  state: 'menu',
  prevState: 'play',
  teams: [],
  userTeam: 0,
  controlled: null,
  p2controlled: null,
  twoPlayers: false,
  receiver: null,
  minute: 0, half: 1,
  matchHalfSeconds: 180,
  stateT: 0,
  kickoffTeam: 0,
  claimLockTeam: -1,
  cheer: false,
  msg: new Timer(),
  commMsg: new Timer(),
  commCd: 0,
  cameraMode: 'tv',          // tv | close | player
  aimMate: {},               // наведенный игрок для паса (по команде)
  offsideOn: true,
  quality: 'fancy',
};

/* ---------- localStorage (безопасно для Node) ---------- */
const Store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null || v === undefined ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} },
};

/* ---------- Инициализация сцены ---------- */
function initEngine() {
  const canvas = document.getElementById('scene');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbcd6ea, 180, 340);

  camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.5, 500);
  camera.position.set(0, 16, 40);
  camera.lookAt(0, 0, 0);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x2b4d2e, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.0);
  sun.position.set(60, 90, 40);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xd8e6ff, 0.35);
  fill.position.set(-50, 60, -40);
  scene.add(fill);

  stadium = buildStadium(scene);
  ball = new Ball(scene);

  markerMesh = mkRing(0xffe22a);
  marker2Mesh = mkRing(0xff8c1a);
  reticleMesh = mkReticle(0xffffff);
  reticleMesh2 = mkReticle(0xffffff);

  initConfetti();
  initTracer();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function mkRing(color) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.8, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.05;
  m.visible = true;
  scene.add(m);
  return m;
}

function mkReticle(color) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.95, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  m.visible = false;
  scene.add(m);
  return m;
}

/* ---------- Конфетти ---------- */
function initConfetti() {
  const cols = [0xffe22a, 0xff5a2a, 0x35e06a, 0x2a8cff, 0xff4ad8, 0x25f5da];
  confetti = { list: [] };
  for (let i = 0; i < 44; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.3),
      new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true, opacity: 0.95, side: THREE.DoubleSide })
    );
    m.visible = false;
    scene.add(m);
    confetti.list.push({ m, vel: new THREE.Vector3(), t: 0 });
  }
}
function burstConfetti(x, y, z) {
  if (!confetti) return;
  for (const it of confetti.list) {
    it.t = rand(1.6, 2.7);
    it.m.visible = true;
    it.m.position.set(x + rand(-2, 2), y + rand(0.5, 2.5), z + rand(-2, 2));
    it.vel.set(rand(-4.5, 4.5), rand(4, 9.5), rand(-4.5, 4.5));
  }
}
function updateConfetti(dt) {
  if (!confetti) return;
  for (const it of confetti.list) {
    if (it.t <= 0) continue;
    it.t -= dt;
    if (it.t <= 0) { it.m.visible = false; continue; }
    it.vel.y -= 9 * dt;
    it.vel.x *= 1 - 1.4 * dt; it.vel.z *= 1 - 1.4 * dt;
    it.m.position.x += it.vel.x * dt;
    it.m.position.y += it.vel.y * dt;
    it.m.position.z += it.vel.z * dt;
    if (it.m.position.y < 0.1) it.m.position.y = 0.1;
    it.m.rotation.x += 6 * dt;
    it.m.rotation.y += 4 * dt;
  }
}

/* ---------- Трассер паса ---------- */
function initTracer() {
  const geo = new THREE.BufferGeometry();
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  tracer = { t: 0, mesh: new THREE.Line(geo, mat) };
  tracer.mesh.visible = false;
  scene.add(tracer.mesh);
}
function showTracer(x1, y1, z1, x2, y2, z2) {
  if (!tracer) return;
  tracer.mesh.geometry.setFromPoints([
    new THREE.Vector3(x1, y1, z1),
    new THREE.Vector3(x2, Math.max(0.4, y2), z2),
  ]);
  tracer.mesh.visible = true;
  tracer.t = 0.4;
}
function updateTracer(dt) {
  if (tracer && tracer.t > 0) {
    tracer.t -= dt;
    if (tracer.t <= 0) tracer.mesh.visible = false;
  }
}

/* ---------- Команды ---------- */
function createTeams() {
  G.teams = [];
  for (let i = 0; i < 2; i++) {
    const team = {
      idx: i,
      name: TEAM_KITS[i].name,
      attackDir: i === 0 ? 1 : -1,
      players: [],
      score: 0,
      diff: { speed: 0.95, skill: 0.75, passRate: 0.75 },
    };
    FORMATION.forEach((f, fi) => {
      const p = new Player(i, f.role, f.fx, f.fz, scene, fi + 1);
      team.players.push(p);
    });
    G.teams.push(team);
  }
}

function resetPositions() {
  for (const team of G.teams) {
    const d = team.attackDir;
    for (let i = 0; i < team.players.length; i++) {
      const p = team.players[i];
      const f = FORMATION[i];
      let x = d * f.fx * FL();
      let z = f.fz * FW();
      if (p.role === 'FW') x = team.idx === G.kickoffTeam ? d * -0.5 : d * -7;
      x = clamp(x, d > 0 ? -(FL() - 1) : 0.5, d > 0 ? -0.5 : FL() - 1);
      if (p.role === 'FW' && team.idx === G.kickoffTeam && i === 9) { x = -d * 1.3; z = 0.6; }
      if (p.role === 'FW' && team.idx === G.kickoffTeam && i === 10) { x = -d * 1.3; z = -2.6; }
      p.pos.set(x, 0, z);
      p.vel.set(0, 0, 0);
      p.moveTarget.set(x, 0, z);
      p.aiTarget.set(x, 0, z);
      p.heading = d > 0 ? Math.PI / 2 : -Math.PI / 2;
      p.stamina = 100;
      p.kickAnimT = p.tackleAnimT = p.celebrateT = p.diveT = p.stumbleT = p.koTimer = 0;
      p.holdWait = 0;
      p.offsideArmed = false;
      p.markTarget = null;
    }
  }
  ball.reset(0, 0);
  G.receiver = null;
  G.claimLockTeam = -1;
  G.aimMate = {};
}

/* ---------- Действия с мячом ---------- */
function shoot(p, charge, accuracy, curl) {
  const team = G.teams[p.team];
  const d = team.attackDir;
  const oppGK = G.teams[1 - p.team].players[0];
  const corner = oppGK.pos.z >= 0 ? -1 : 1;
  let aimZ = corner * rand(1.6, 3.0) + rand(-1, 1) * (1 - accuracy) * 4.5;
  aimZ = clamp(aimZ, -3.4, 3.4);
  const dx = d * FL() - p.pos.x, dz = aimZ - p.pos.z;
  const dl = Math.sqrt(dx * dx + dz * dz) || 1;
  const speed = 22 + 12 * charge;
  const vy = 1.6 + charge * 3.6 + rand(-0.3, 0.6);
  ball.kick(dx / dl * speed, vy, dz / dl * speed, p.team, p, curl || 0);
  p.playKick();
  p.koTimer = 0.45;
  G.receiver = null;
  G.aimMate[p.team] = null;
  if (p.team === G.userTeam || (G.twoPlayers && p.team === 1)) {
    say('shot');
    Snd.crowdExcite(0.12, 1.4);
  }
}

/* наведенный игрок по направлению прицела */
function pickAimMate(teamIdx, p, ax, az) {
  let best = null, bs = -1e9;
  for (const m of G.teams[teamIdx].players) {
    if (m === p || m.isKeeper) continue;
    const md = dist2(p.pos.x, p.pos.z, m.pos.x, m.pos.z);
    if (md < 2.5 || md > 42) continue;
    const dot = ((m.pos.x - p.pos.x) * ax + (m.pos.z - p.pos.z) * az) / (md || 1);
    if (dot < 0.5) continue;
    const score = dot * 2 + (m.role === 'FW' ? 0.3 : 0) - md * 0.012;
    if (score > bs) { bs = score; best = m; }
  }
  return best;
}

function execPass(p, mate) {
  const md0 = dist2(p.pos.x, p.pos.z, mate.pos.x, mate.pos.z);
  const speed = clamp(md0 * 1.05 + 5, 10, 24);
  const t1 = md0 / speed;
  let tx = mate.pos.x + mate.vel.x * t1 * 0.9;
  let tz = mate.pos.z + mate.vel.z * t1 * 0.9;
  const md = dist2(p.pos.x, p.pos.z, tx, tz);
  const t2 = md / speed;
  tx = mate.pos.x + mate.vel.x * t2 * 0.9;
  tz = mate.pos.z + mate.vel.z * t2 * 0.9;
  const dx = tx - p.pos.x, dz = tz - p.pos.z;
  const dl = Math.sqrt(dx * dx + dz * dz) || 1;

  /* перекрыта ли линия паса соперником — тогда пас-подкидка */
  let blocked = false;
  for (const q of G.teams[1 - p.team].players) {
    for (let s = 0.25; s <= 0.8; s += 0.27) {
      const lx = p.pos.x + dx * s, lz = p.pos.z + dz * s;
      if (dist2(q.pos.x, q.pos.z, lx, lz) < 1.7) blocked = true;
    }
  }
  const vy = blocked ? 4.4 : (md > 26 ? 2.0 : 0.5);
  ball.kick(dx / dl * speed, vy, dz / dl * speed, p.team, p);
  showTracer(p.pos.x, 0.9, p.pos.z, mate.pos.x, 0.9, mate.pos.z);
  G.receiver = mate;
  p.koTimer = 0.45;
  armOffside(p.team);
  return true;
}

function passBall(p, aimWorldX, aimWorldZ, useAim, aimMate) {
  p.playKick();
  if (useAim && aimMate && aimMate !== p) {
    return execPass(p, aimMate);
  }
  let best = null, bestScore = -1e9;
  for (const m of G.teams[p.team].players) {
    if (m === p || m.isKeeper) continue;
    const md = dist2(p.pos.x, p.pos.z, m.pos.x, m.pos.z);
    if (md < 2.5 || md > 46) continue;
    const forward = G.teams[p.team].attackDir * (m.pos.x - p.pos.x);
    let score = forward * 0.55 - Math.abs(md - 14) * 0.22 + (m.role === 'FW' ? 3 : 0);
    let open = 30;
    for (const q of G.teams[1 - p.team].players) {
      for (let s = 0.2; s <= 0.9; s += 0.35) {
        const lx = p.pos.x + (m.pos.x - p.pos.x) * s;
        const lz = p.pos.z + (m.pos.z - p.pos.z) * s;
        open = Math.min(open, dist2(q.pos.x, q.pos.z, lx, lz));
      }
    }
    score += open * 1.4;
    if (useAim) {
      const dot = ((m.pos.x - p.pos.x) * aimWorldX + (m.pos.z - p.pos.z) * aimWorldZ) / (md || 1);
      score += dot * 26;
    }
    if (score > bestScore) { bestScore = score; best = m; }
  }
  if (!best) {
    const d = G.teams[p.team].attackDir;
    ball.kick(d * 12, 2.5, rand(-3, 3), p.team, p);
    return false;
  }
  return execPass(p, best);
}

/* фиксация офсайда в момент паса */
function armOffside(teamIdx) {
  if (!G.offsideOn) return;
  clearOffsideFlags();
  const d = G.teams[teamIdx].attackDir;
  const line = offsideLineX(G, teamIdx);
  for (const m of G.teams[teamIdx].players) {
    if (m.isKeeper) continue;
    if ((m.pos.x - line) * d > 0.4) m.offsideArmed = true;
  }
}
function clearOffsideFlags() {
  for (const t of G.teams) for (const p of t.players) p.offsideArmed = false;
}

function callOffside(p) {
  G.state = 'restart';
  G.stateT = 1.3;
  clearOffsideFlags();
  G.receiver = null;
  ball.reset(clamp(p.pos.x, -FL() + 2, FL() - 2), clamp(p.pos.z, -FW() + 2, FW() - 2));
  G.claimLockTeam = 1 - p.team;
  say('offside');
  showBanner('ВНЕ ИГРЫ!', 'офсайд', 1.5);
  Snd.whistle('short');
  Snd.crowdExcite(0.1, 1.2);
}

function requestTackle(p) {
  if (p.tackleAnimT > 0 || p.tackleCd > 0 || p.celebrateT > 0) return;
  p.tackleCd = 0.85;
  p.playTackle();
  const owner = ball.owner;
  if (owner && owner.team !== p.team && ball.ownerHoldT > 0.45) {
    const d = dist2(p.pos.x, p.pos.z, ball.pos.x, ball.pos.z);
    if (d < 1.8) {
      const isHuman = p === G.controlled || p === G.p2controlled;
      const chance = owner.isKeeper ? 0.06 : (isHuman ? 0.8 : 0.62);
      if (Math.random() < chance) {
        ball.takeBy(p);
        owner.stumbleT = 0.75;
        G.receiver = null;
        clearOffsideFlags();
        if (isHuman) {
          Snd.crowdExcite(0.05, 1);
          say('tackle');
        }
      } else if (isHuman) {
        p.stumbleT = 0.5;
      }
    }
  }
}

function keeperDistribute(p) {
  const team = G.teams[p.team];
  const d = team.attackDir;
  let best = null, bd = -1;
  for (const m of team.players) {
    if (m === p) continue;
    const md = dist2(p.pos.x, p.pos.z, m.pos.x, m.pos.z);
    const fwd = d * m.pos.x;
    if (md > 18 && fwd > bd) { bd = fwd; best = m; }
  }
  p.playKick();
  if (best) {
    const dx = best.pos.x - p.pos.x, dz = best.pos.z - p.pos.z;
    const dl = Math.sqrt(dx * dx + dz * dz) || 1;
    const speed = clamp(dl * 0.85 + 5, 14, 26);
    ball.kick(dx / dl * speed, 5.2, dz / dl * speed, p.team, p);
    G.receiver = best;
  } else {
    ball.kick(d * 18, 6, 0, p.team, p);
  }
  p.koTimer = 0.6;
}

/* экспорт для ИИ */
G.requestTackle = requestTackle;
G.keeperDistribute = keeperDistribute;
G.aiShoot = (p, charge) => shoot(p, charge, G.teams[p.team].diff.skill, 0);
G.aiPass = (p) => passBall(p, 0, 0, false, null);
G.onSave = () => {
  showBanner('СЭЙВ!', '', 0.8);
  say('save');
  Snd.crowdExcite(0.14, 1.4);
};
G.onCatch = () => Snd.crowdExcite(0.08, 1);

/* ---------- Сообщения ---------- */
function showBanner(text, subText, secs) {
  const b = document.getElementById('banner');
  b.innerHTML = text + (subText ? `<small>${subText}</small>` : '');
  b.classList.remove('hidden');
  G.msg.start(secs || 1.1, () => b.classList.add('hidden'));
}
function say(type, txt) {
  if (G.commCd > 0) return;
  G.commCd = 1.2;
  const el = document.getElementById('commentary');
  el.textContent = txt || PHRASES[type][(Math.random() * PHRASES[type].length) | 0];
  el.classList.add('show');
  G.commMsg.start(2.6, () => el.classList.remove('show'));
}

/* ---------- Переключение управляемого игрока ---------- */
function autoSwitchFor(teamIdx) {
  const cur = teamIdx === 0 ? G.controlled : G.p2controlled;
  const user = G.teams[teamIdx];
  if (ball.owner && ball.owner.team === teamIdx && !ball.owner.isKeeper) {
    if (teamIdx === 0) G.controlled = ball.owner; else G.p2controlled = ball.owner;
    return;
  }
  let best = null, bd = 1e9;
  for (const p of user.players) {
    if (p.isKeeper) continue;
    const d = dist2(p.pos.x, p.pos.z, ball.pos.x, ball.pos.z);
    if (d < bd) { bd = d; best = p; }
  }
  const curD = cur ? dist2(cur.pos.x, cur.pos.z, ball.pos.x, ball.pos.z) : 1e9;
  if (best && (!cur || curD > bd + 2.5 || cur.isKeeper)) {
    if (teamIdx === 0) G.controlled = best; else G.p2controlled = best;
  }
}

function switchPlayer() {
  const user = G.teams[G.userTeam];
  const cands = user.players
    .filter(p => !p.isKeeper && p !== G.controlled)
    .sort((a, b) => dist2(a.pos.x, a.pos.z, ball.pos.x, ball.pos.z) - dist2(b.pos.x, b.pos.z, ball.pos.x, ball.pos.z));
  if (cands[0]) G.controlled = cands[0];
}

/* ---------- Управляемый игрок ---------- */
const _fwd = new THREE.Vector3();
const _rgt = new THREE.Vector3();
function updateControlled(p, inp, teamIdx, dt) {
  if (!p) return;
  camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
  _rgt.set(-_fwd.z, 0, _fwd.x);

  const mx = inp.moveX, my = inp.moveY;
  const mag = Math.sqrt(mx * mx + my * my);
  p.sprinting = !!inp.sprint;

  let wx = 0, wz = 0;
  if (mag > 0.06 && p.celebrateT <= 0) {
    wx = _rgt.x * mx + _fwd.x * -my;
    wz = _rgt.z * mx + _fwd.z * -my;
    p.setMoveTarget(p.pos.x + wx * 6, p.pos.z + wz * 6);
  } else {
    p.setMoveTarget(p.pos.x, p.pos.z);
  }

  if (G.state !== 'play' || p.celebrateT > 0) return;

  if (inp.passLatch) {
    if (ball.owner === p) {
      let ax = 0, az = 0, has = false;
      if (mag > 0.15) { ax = wx / mag; az = wz / mag; has = true; }
      passBall(p, ax, az, has, G.aimMate[teamIdx]);
      say('pass');
    } else requestTackle(p);
  }
  if (inp.shootLatch) {
    if (ball.owner === p) {
      let curl = 0;
      if (mag > 0.2) {
        const gdx = G.teams[teamIdx].attackDir * FL() - p.pos.x, gdz = -p.pos.z;
        const gl = Math.sqrt(gdx * gdx + gdz * gdz) || 1;
        const lateral = (gdx / gl) * (wz / mag) - (gdz / gl) * (wx / mag);
        curl = clamp(lateral * 1.3, -1, 1) * 0.7;
      }
      shoot(p, Math.max(0.35, inp.shootCharge), 0.85, curl);
    } else requestTackle(p);
  }
  if (inp.tackleLatch) {
    if (ball.owner !== p) requestTackle(p);
    else passBall(p, _fwd.x, _fwd.z, false, null);
  }
}

/* ---------- Прицел паса (ретикул) ---------- */
function updateReticle(dt, teamIdx, p, inp, mesh) {
  const show = p && ball.owner === p && G.state === 'play';
  if (!show) { mesh.visible = false; G.aimMate[teamIdx] = null; return; }

  camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
  _rgt.set(-_fwd.z, 0, _fwd.x);
  const mx = inp.moveX, my = inp.moveY;
  const mag = Math.sqrt(mx * mx + my * my);
  if (mag > 0.15) {
    const ax = (_rgt.x * mx + _fwd.x * -my) / mag;
    const az = (_rgt.z * mx + _fwd.z * -my) / mag;
    const mate = pickAimMate(teamIdx, p, ax, az);
    G.aimMate[teamIdx] = mate;
    if (mate) {
      mesh.visible = true;
      mesh.position.set(mate.pos.x, 0.06, mate.pos.z);
      mesh.scale.setScalar(1 + Math.sin(performance.now() * 0.008) * 0.12);
      mesh.rotation.z = performance.now() * 0.0015;
    } else mesh.visible = false;
  } else {
    G.aimMate[teamIdx] = null;
    mesh.visible = false;
  }
}

/* ---------- Основной шаг ---------- */
function step(dt) {
  G.msg.update(dt);
  G.commMsg.update(dt);
  G.commCd = Math.max(0, G.commCd - dt);
  G.stateT -= dt;

  switch (G.state) {
    case 'menu': menuIdleCam(dt); break;
    case 'kickoff': {
      if (G.stateT <= 0) {
        G.state = 'play';
        const kf = G.teams[G.kickoffTeam].players[9];
        ball.takeBy(kf);
        clearOffsideFlags();
        Snd.whistle('short');
      }
      break;
    }
    case 'restart': {
      if (G.stateT <= 0) { G.state = 'play'; G.claimLockTeam = -1; }
      break;
    }
    case 'goal': {
      if (G.stateT <= 0) {
        G.cheer = false;
        G.state = 'kickoff';
        G.stateT = 1.2;
        resetPositions();
        ball.reset(0, 0);
      }
      break;
    }
    case 'half': {
      if (G.stateT <= 0) {
        G.half = 2;
        for (const t of G.teams) t.attackDir *= -1;
        G.kickoffTeam = 1;
        resetPositions();
        G.state = 'kickoff';
        G.stateT = 1.2;
        updateScoreboard();
      }
      break;
    }
    case 'play': playStep(dt); break;
  }

  if (G.state !== 'menu' && G.state !== 'end' && G.state !== 'paused') {
    for (const team of G.teams) for (const p of team.players) p.update(dt);

    const all = [...G.teams[0].players, ...G.teams[1].players];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.72 && d2 > 1e-5) {
          const d = Math.sqrt(d2), push = (0.85 - d) * 0.5;
          a.pos.x -= dx / d * push; a.pos.z -= dz / d * push;
          b.pos.x += dx / d * push; b.pos.z += dz / d * push;
        }
      }
    }

    ball.update(dt, performance.now() * 0.001);
    ball.syncMesh();
  }

  const ballDanger = G.state === 'play' && Math.min(
    dist2(ball.pos.x, ball.pos.z, FL(), 0), dist2(ball.pos.x, ball.pos.z, -FL(), 0)) < 26;
  stadium.fans.update(dt, G.cheer || (ballDanger && Math.random() < 0.5));
  if (stadium.clouds) stadium.clouds.update(dt);
  updateConfetti(dt);
  updateTracer(dt);

  if (G.state !== 'menu' && G.state !== 'end') {
    if (G.controlled) {
      markerMesh.visible = true;
      markerMesh.position.set(G.controlled.pos.x, 0.06, G.controlled.pos.z);
      markerMesh.rotation.z = performance.now() * 0.002;
    } else markerMesh.visible = false;
    if (G.twoPlayers && G.p2controlled) {
      marker2Mesh.visible = true;
      marker2Mesh.position.set(G.p2controlled.pos.x, 0.06, G.p2controlled.pos.z);
      marker2Mesh.rotation.z = -performance.now() * 0.002;
    } else marker2Mesh.visible = false;
  } else {
    markerMesh.visible = false;
    marker2Mesh.visible = false;
    reticleMesh.visible = false;
    reticleMesh2.visible = false;
  }

  if (G.state !== 'menu') followCamera(dt);
  updateHUD();
}

function playStep(dt) {
  const realDt = Math.min(dt, 0.05);
  pollInput(realDt);

  if (input.camLatch || input2.camLatch) cycleCameraMode();
  if (input.switchLatch) switchPlayer();

  G.minute += realDt * (45 / G.matchHalfSeconds);
  if (G.half === 1 && G.minute >= 45) {
    G.minute = 45;
    G.state = 'half';
    G.stateT = 2.6;
    showBanner('ПЕРЕРЫВ', '', 2.4);
    Snd.whistle('full');
    return;
  }
  if (G.half === 2 && G.minute >= 90) {
    G.minute = 90;
    endMatch();
    return;
  }

  autoSwitchFor(0);
  if (G.twoPlayers) autoSwitchFor(1);

  updateControlled(G.controlled, input, 0, realDt);
  if (G.twoPlayers) updateControlled(G.p2controlled, input2, 1, realDt);

  updateTeamAI(G, 0, realDt);
  updateTeamAI(G, 1, realDt);
  for (const team of G.teams) {
    for (const p of team.players) {
      if (p !== G.controlled && p !== G.p2controlled) p.moveTarget.copy(p.aiTarget);
    }
  }

  if (!ball.owner) {
    const claim = findClaimant(ball, [...G.teams[0].players, ...G.teams[1].players], G.controlled);
    if (claim && (G.claimLockTeam === -1 || claim.team === G.claimLockTeam)) {
      if (G.offsideOn && claim.offsideArmed) {
        callOffside(claim);
      } else {
        ball.takeBy(claim);
        G.receiver = null;
        clearOffsideFlags();
      }
    }
  }

  updateReticle(realDt, 0, G.controlled, input, reticleMesh);
  if (G.twoPlayers) updateReticle(realDt, 1, G.p2controlled, input2, reticleMesh2);

  checkRules();
}

/* ---------- Камера ---------- */
const camLook = new THREE.Vector3(0, 1, 0);
let camInit = false;
function followCamera(dt) {
  const lead = 0.22;
  const tx = clamp(ball.pos.x + ball.vel.x * lead, -FL() + 4, FL() - 4);
  const tz = clamp(ball.pos.z + ball.vel.z * lead, -FW() + 3, FW() - 3);
  const k = 1 - Math.exp(-(G.cameraMode === 'player' ? 5.5 : 4.2) * dt);
  let px, py, pz, lx, ly, lz;

  if (G.cameraMode === 'player' && !G.twoPlayers) {
    const d = G.teams[G.userTeam].attackDir;
    px = ball.pos.x - d * 13.5;
    py = 8.5;
    pz = clamp(ball.pos.z, -FW() + 2, FW() - 2) * 0.9;
    lx = ball.pos.x + d * 9;
    ly = 0.8;
    lz = ball.pos.z * 0.75;
  } else if (G.cameraMode === 'close') {
    px = tx * 0.86; py = 9.5; pz = 24 + tz * 0.18;
    lx = tx * 0.94; ly = 0.9; lz = tz * 0.7;
  } else {
    px = tx * 0.84; py = 15.5; pz = 40 + tz * 0.12;
    lx = tx * 0.92; ly = 1.0; lz = tz * 0.6;
  }

  if (!camInit) {
    camera.position.set(px, py, pz);
    camLook.set(lx, ly, lz);
    camInit = true;
  } else {
    camera.position.x += (px - camera.position.x) * k;
    camera.position.y += (py - camera.position.y) * k;
    camera.position.z += (pz - camera.position.z) * k;
    camLook.x += (lx - camLook.x) * k;
    camLook.y += (ly - camLook.y) * k;
    camLook.z += (lz - camLook.z) * k;
  }
  camera.lookAt(camLook);
}

const CAM_NAMES = { tv: 'ТВ', close: 'БЛИЖНЯЯ', player: 'ЗА ИГРОКОМ' };
function cycleCameraMode() {
  const order = ['tv', 'close', 'player'];
  let i = (order.indexOf(G.cameraMode) + 1) % order.length;
  if (G.twoPlayers && order[i] === 'player') i = (i + 1) % order.length;
  G.cameraMode = order[i];
  Store.set('fb3d_v2_cam', order[i]);
  showBanner('КАМЕРА: ' + CAM_NAMES[order[i]], '', 0.9);
}

function menuIdleCam(dt) {
  const t = performance.now() * 0.00012;
  camera.position.set(Math.sin(t) * 70, 24, Math.cos(t) * 70 + 10);
  camera.lookAt(0, 1, 0);
  camInit = false;
}

/* ---------- Правила ---------- */
function checkRules() {
  if (G.state !== 'play') return;
  const b = ball.pos;

  if (Math.abs(b.x) > FL() + CFG.BALL_R * 0.6 && Math.abs(b.z) < CFG.GOAL_W / 2 && b.y < CFG.GOAL_H) {
    const scoringTeam = G.teams[0].attackDir * b.x > 0 ? 0 : 1;
    onGoal(scoringTeam);
    return;
  }

  if (Math.abs(b.z) > FW() + 0.3) {
    const toTeam = 1 - ball.lastTouchTeam;
    G.state = 'restart';
    G.stateT = 1.0;
    ball.vel.set(0, 0, 0);
    ball.pos.set(clamp(b.x, -FL() + 2, FL() - 2), CFG.BALL_R, Math.sign(b.z) * (FW() - 0.5));
    G.claimLockTeam = toTeam;
    showBanner('АУТ', '', 0.9);
    Snd.whistle('short');
    return;
  }

  if (Math.abs(b.x) > FL() + 0.5 && !(Math.abs(b.z) < CFG.GOAL_W / 2 && b.y < CFG.GOAL_H)) {
    const side = Math.sign(b.x);
    const scoringSide = G.teams[0].attackDir * side > 0 ? 0 : 1;
    const defTeam = 1 - scoringSide;
    const wasShot = !ball.owner && Math.sqrt(ball.vel.x * ball.vel.x + ball.vel.z * ball.vel.z) > 16;
    const nearGoal = dist2(b.x, b.z, side * FL(), 0) < 24;
    G.state = 'restart';
    G.stateT = 1.0;
    ball.vel.set(0, 0, 0);
    const lastByDef = ball.lastTouchTeam === defTeam;
    if (lastByDef) {
      const gk = G.teams[defTeam].players[0];
      ball.reset(side * (FL() - 6), gk.pos.z);
      ball.takeBy(gk);
      showBanner('ОТ ВОРОТ');
    } else {
      ball.reset(side * (FL() - 0.4), Math.sign(b.z || 1) * (FW() - 0.4));
      G.claimLockTeam = scoringSide;
      showBanner('УГЛОВОЙ');
    }
    if (wasShot && nearGoal) { say('miss'); Snd.crowdExcite(0.12, 1.5); }
    Snd.whistle('short');
    return;
  }
}

function onGoal(teamIdx) {
  const team = G.teams[teamIdx];
  team.score++;
  G.state = 'goal';
  G.stateT = 3.4;
  G.cheer = true;
  ball.vel.set(0, 0, 0);
  ball.pos.x = clamp(ball.pos.x, -FL() - 1.2, FL() + 1.2);

  const scorer = (ball.lastPlayer && ball.lastPlayer.team === teamIdx) ? ball.lastPlayer : null;
  for (const p of team.players) {
    if (dist2(p.pos.x, p.pos.z, ball.pos.x, ball.pos.z) < 45) p.playCelebrate();
  }
  burstConfetti(ball.pos.x, 1.5, clamp(ball.pos.z, -6, 6));
  const label = scorer ? `№${scorer.number} • ${TEAM_KITS[teamIdx].name}` : TEAM_KITS[teamIdx].name;
  showBanner('ГОООООЛ!', label, 3.0);
  say('goal');
  Snd.whistle('goal');
  Snd.crowdExcite(0.5, 3.5);
  G.kickoffTeam = 1 - teamIdx;
  updateScoreboard();
}

/* ---------- HUD ---------- */
function updateHUD() {
  if (G.state === 'menu') return;
  const mm = Math.floor(G.minute);
  const ss = Math.floor((G.minute % 1) * 60);
  document.getElementById('clock').textContent =
    `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  const p = G.controlled;
  if (p) {
    document.getElementById('staminaFill').style.width = p.stamina + '%';
    const ring = document.getElementById('chargeRing');
    const c = Math.min(1, input.shootCharge);
    ring.style.background = `conic-gradient(rgba(255,255,255,.9) ${c * 360}deg, rgba(255,255,255,0) ${c * 360}deg)`;
    ring.style.opacity = input.shootHeld ? 1 : 0;
  }
  if (G.twoPlayers && G.p2controlled) {
    const f2 = document.getElementById('staminaFill2');
    if (f2) f2.style.width = G.p2controlled.stamina + '%';
    const ring2 = document.getElementById('chargeRing2');
    if (ring2) {
      const c2 = Math.min(1, input2.shootCharge);
      ring2.style.background = `conic-gradient(rgba(255,255,255,.9) ${c2 * 360}deg, rgba(255,255,255,0) ${c2 * 360}deg)`;
      ring2.style.opacity = input2.shootHeld ? 1 : 0;
    }
  }
}
function updateScoreboard() {
  document.getElementById('score').textContent = `${G.teams[0].score} : ${G.teams[1].score}`;
  document.getElementById('nameA').textContent = G.teams[0].name;
  document.getElementById('nameB').textContent = G.teams[1].name;
  document.getElementById('halfLabel').textContent = G.half === 1 ? '1-й тайм' : '2-й тайм';
}

/* ---------- Старт матча / конец ---------- */
function startMatch(diffKey, realMinutes, twoPlayers) {
  const d = DIFF[diffKey] || DIFF.normal;
  G.twoPlayers = !!twoPlayers;
  for (const team of G.teams) {
    team.score = 0;
    team.attackDir = team.idx === 0 ? 1 : -1;
    team.diff = (team.idx === G.userTeam || (G.twoPlayers && team.idx === 1))
      ? { speed: 1.0, skill: 0.8, passRate: 0.8 }
      : { speed: d.speed, skill: d.skill, passRate: d.passRate };
  }
  G.minute = 0; G.half = 1;
  G.kickoffTeam = 0;
  G.matchHalfSeconds = realMinutes * 60 / 2;
  G.p2controlled = null;
  input2.active = !!twoPlayers;
  input.active = true;
  resetPositions();
  G.controlled = G.teams[0].players[9];
  if (G.twoPlayers) G.p2controlled = G.teams[1].players[9];
  updateScoreboard();
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('endScreen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('joyZone').classList.remove('hidden');
  document.getElementById('actions').classList.remove('hidden');
  const p2zone = document.getElementById('joyZone2');
  const p2act = document.getElementById('p2actions');
  const p2bar = document.getElementById('staminaWrap2');
  if (p2zone) p2zone.classList.toggle('hidden', !G.twoPlayers);
  if (p2act) p2act.classList.toggle('hidden', !G.twoPlayers);
  if (p2bar) p2bar.classList.toggle('hidden', !G.twoPlayers);
  applyQuality(G.quality);
  showBanner('МАТЧ НАЧАЛСЯ!', G.twoPlayers ? '1 на 1 по одной сети!' : '', 1.4);
  G.state = 'kickoff';
  G.stateT = 1.2;
  G.aimMate = {};
  Snd.crowdExcite(0.2, 2);
}

function endMatch() {
  G.state = 'end';
  Snd.whistle('full');
  Snd.crowdExcite(0.35, 2.5);
  const a = G.teams[0].score, b = G.teams[1].score;
  document.getElementById('endScore').textContent = `${a} : ${b}`;
  const ua = G.teams[G.userTeam].score, ai = G.teams[1 - G.userTeam].score;
  document.getElementById('endPhrase').textContent =
    ua > ai ? '🏆 Победа! Отличный матч!' : ua < ai ? 'Поражение. Попробуй ещё раз!' : 'Ничья — честная борьба!';
  document.getElementById('endScreen').classList.remove('hidden');
  document.getElementById('joyZone').classList.add('hidden');
  document.getElementById('actions').classList.add('hidden');
  const p2zone = document.getElementById('joyZone2');
  const p2act = document.getElementById('p2actions');
  if (p2zone) p2zone.classList.add('hidden');
  if (p2act) p2act.classList.add('hidden');
  G.aimMate = {};
}

/* ---------- Пауза ---------- */
function setPaused(v) {
  if (v && (G.state === 'play' || G.state === 'kickoff' || G.state === 'restart')) {
    G.prevState = G.state;
    G.state = 'paused';
    document.getElementById('pauseMenu').classList.remove('hidden');
  } else if (!v && G.state === 'paused') {
    G.state = G.prevState;
    document.getElementById('pauseMenu').classList.add('hidden');
  }
}

/* ---------- Качество графики ---------- */
function applyQuality(q) {
  const fancy = q === 'fancy';
  try {
    renderer.setPixelRatio(fancy ? Math.min(window.devicePixelRatio, 2) : 1);
    if (renderer.shadowMap) renderer.shadowMap.enabled = fancy;
    if (renderer.shadowMap && renderer.shadowMap.needsUpdate !== undefined) renderer.shadowMap.needsUpdate = true;
  } catch (e) {}
  for (const t of G.teams) {
    for (const p of t.players) {
      if (p.mesh.traverse) p.mesh.traverse(o => { o.castShadow = fancy; });
      if (p.parts.shadow) p.parts.shadow.material.opacity = fancy ? 0.22 : 0.3;
    }
  }
  if (ball) ball.mesh.castShadow = fancy;
}

/* ---------- UI ---------- */
function tryFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fn) { try { fn.call(el); } catch (e) {} }
  if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
}

function bindUI() {
  let diffSel = Store.get('fb3d_v2_diff', 'normal');
  let lenSel = +Store.get('fb3d_v2_len', 6);
  let modeSel = Store.get('fb3d_v2_mode', '1p');
  G.offsideOn = Store.get('fb3d_v2_offside', 'on') === 'on';
  G.quality = Store.get('fb3d_v2_quality', 'fancy');
  const savedCam = Store.get('fb3d_v2_cam', 'tv');
  if (['tv', 'close', 'player'].indexOf(savedCam) >= 0) G.cameraMode = savedCam;

  const pick = (id, def, cb) => {
    const seg = document.getElementById(id);
    if (!seg) return;
    seg.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', b.dataset.v === String(def));
      b.addEventListener('click', () => {
        seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        cb(b.dataset.v);
      });
    });
  };
  pick('diffSeg', diffSel, v => { diffSel = v; Store.set('fb3d_v2_diff', v); });
  pick('lenSeg', lenSel, v => { lenSel = +v; Store.set('fb3d_v2_len', v); });
  pick('modeSeg', modeSel, v => { modeSel = v; Store.set('fb3d_v2_mode', v); });
  pick('qualSeg', G.quality, v => { G.quality = v; Store.set('fb3d_v2_quality', v); applyQuality(v); });
  pick('offsideSeg', G.offsideOn ? 'on' : 'off', v => { G.offsideOn = v === 'on'; Store.set('fb3d_v2_offside', v); });

  document.getElementById('playBtn').addEventListener('click', () => {
    Snd.init(); Snd.resume();
    tryFullscreen();
    startMatch(diffSel, lenSel, modeSel === '2p');
  });
  document.getElementById('pauseBtn').addEventListener('click', () => setPaused(true));
  document.getElementById('resumeBtn').addEventListener('click', () => setPaused(false));
  document.getElementById('quitBtn').addEventListener('click', () => {
    document.getElementById('pauseMenu').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('joyZone').classList.add('hidden');
    document.getElementById('actions').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
    G.state = 'menu';
    input2.active = false;
  });
  document.getElementById('againBtn').addEventListener('click', () => {
    tryFullscreen();
    startMatch(diffSel, lenSel, modeSel === '2p');
  });
}

/* ---------- Запуск ---------- */
(function boot() {
  if (typeof THREE === 'undefined') {
    document.getElementById('fatalErr').classList.remove('hidden');
    return;
  }
  initEngine();
  createTeams();
  initAI(G);
  pollInput = initControls();
  bindUI();
  updateScoreboard();

  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.05);
    if (G.state !== 'paused') step(dt);
    flushLatches();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
})();

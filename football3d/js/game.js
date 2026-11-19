'use strict';
/* ==== Главный игровой модуль: состояние матча, правила, камера, цикл ==== */

let ball = null;               // глобальный экземпляр мяча
let renderer, scene, camera;
let stadium = null;
let pollInput = null;
let markerMesh = null;
const G = {
  state: 'menu',               // menu | kickoff | play | restart | goal | half | end | paused
  prevState: 'play',
  teams: [],
  userTeam: 0,
  controlled: null,
  receiver: null,
  minute: 0, half: 1,
  matchHalfSeconds: 180,
  stateT: 0,
  kickoffTeam: 0,
  claimLockTeam: -1,
  cheer: false,
  msg: new Timer(),
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

  camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.5, 500);
  camera.position.set(0, 26, 52);
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

  // маркер управляемого игрока
  markerMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.8, 20),
    new THREE.MeshBasicMaterial({ color: 0xffe22a, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  markerMesh.rotation.x = -Math.PI / 2;
  markerMesh.position.y = 0.05;
  scene.add(markerMesh);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
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
      const p = new Player(i, f.role, f.fx, f.fz, scene);
      p.number = fi + 1;
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
    }
  }
  ball.reset(0, 0);
  G.receiver = null;
  G.claimLockTeam = -1;
}

/* ---------- Действия с мячом ---------- */
function shoot(p, charge, accuracy) {
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
  ball.kick(dx / dl * speed, vy, dz / dl * speed, p.team, p);
  p.playKick();
  p.koTimer = 0.45;
  G.receiver = null;
}

function passBall(p, aimWorldX, aimWorldZ, useAim) {
  const team = G.teams[p.team];
  const d = team.attackDir;
  let best = null, bestScore = -1e9;
  for (const m of team.players) {
    if (m === p || m.isKeeper) continue;
    const md = dist2(p.pos.x, p.pos.z, m.pos.x, m.pos.z);
    if (md < 2.5 || md > 46) continue;
    let forward = d * (m.pos.x - p.pos.x);
    let score = forward * 0.55 - Math.abs(md - 14) * 0.22 + (m.role === 'FW' ? 3 : 0);
    // открытость линии паса
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
  p.playKick();
  if (!best) { // safety-кик вперёд
    ball.kick(d * 12, 2.5, rand(-3, 3), p.team, p);
    return false;
  }
  const md = dist2(p.pos.x, p.pos.z, best.pos.x, best.pos.z);
  const speed = clamp(md * 0.95 + 4, 9, 23);
  const t = md / speed;
  const tx = best.pos.x + best.vel.x * t * 0.85;
  const tz = best.pos.z + best.vel.z * t * 0.85;
  const dx = tx - p.pos.x, dz = tz - p.pos.z;
  const dl = Math.sqrt(dx * dx + dz * dz) || 1;
  ball.kick(dx / dl * speed, md > 24 ? 2.6 : 0.6, dz / dl * speed, p.team, p);
  G.receiver = best;
  p.koTimer = 0.45;
  return true;
}

function requestTackle(p) {
  if (p.tackleAnimT > 0 || p.tackleCd > 0 || p.celebrateT > 0) return;
  p.tackleCd = 0.85;
  p.playTackle();
  const owner = ball.owner;
  if (owner && owner.team !== p.team && ball.ownerHoldT > 0.45) {
    const d = dist2(p.pos.x, p.pos.z, ball.pos.x, ball.pos.z);
    if (d < 1.8) {
      const chance = owner.isKeeper ? 0.06 : (p === G.controlled ? 0.8 : 0.62);
      if (Math.random() < chance) {
        ball.takeBy(p);
        owner.stumbleT = 0.75;
        G.receiver = null;
        if (p === G.controlled) Snd.crowdExcite(0.05, 1);
      } else if (p === G.controlled) {
        p.stumbleT = 0.5;
      }
    }
  }
}

/* экспорт действий для ИИ */
G.requestTackle = requestTackle;
G.keeperDistribute = keeperDistribute;
G.aiShoot = (p, charge) => shoot(p, charge, G.teams[p.team].diff.skill);
G.aiPass = (p) => passBall(p, 0, 0, false);
G.onSave = (p) => { if (G.msg.t <= 0) showBanner('СЭЙВ!', '', 0.8); Snd.crowdExcite(0.1, 1.2); };
G.onCatch = () => Snd.crowdExcite(0.08, 1);

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

/* ---------- Правила ---------- */
function checkRules() {
  if (G.state !== 'play') return;
  const b = ball.pos;

  // ГОЛ
  if (Math.abs(b.x) > FL() + CFG.BALL_R * 0.6 && Math.abs(b.z) < CFG.GOAL_W / 2 && b.y < CFG.GOAL_H) {
    const scoringTeam = G.teams[0].attackDir * b.x > 0 ? 0 : 1;
    onGoal(scoringTeam);
    return;
  }

  // аут за боковой
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

  // линия ворот: угловой или от ворот
  if (Math.abs(b.x) > FL() + 0.5 && !(Math.abs(b.z) < CFG.GOAL_W / 2 && b.y < CFG.GOAL_H)) {
    const side = Math.sign(b.x);
    const scoringSide = G.teams[0].attackDir * side > 0 ? 0 : 1;
    const defTeam = 1 - scoringSide;
    G.state = 'restart';
    G.stateT = 1.0;
    ball.vel.set(0, 0, 0);
    const lastByDef = ball.lastTouchTeam === defTeam;
    if (lastByDef) {
      // удар от ворот
      const gk = G.teams[defTeam].players[0];
      ball.reset(side * (FL() - 6), gk.pos.z);
      ball.takeBy(gk);
      showBanner('ОТ ВОРОТ');
    } else {
      // угловой
      ball.reset(side * (FL() - 0.4), Math.sign(b.z || 1) * (FW() - 0.4));
      G.claimLockTeam = scoringSide;
      showBanner('УГЛОВОЙ');
    }
    Snd.whistle('short');
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
  const label = scorer ? `№${scorer.number} • ${TEAM_KITS[teamIdx].name}` : TEAM_KITS[teamIdx].name;
  showBanner('ГООООЛ!', label, 3.0);
  Snd.whistle('goal');
  Snd.crowdExcite(0.5, 3.5);
  G.kickoffTeam = 1 - teamIdx;
}

function showBanner(text, subText, secs) {
  const b = document.getElementById('banner');
  b.innerHTML = text + (subText ? `<small>${subText}</small>` : '');
  b.classList.remove('hidden');
  G.msg.start(secs || 1.1, () => b.classList.add('hidden'));
}

/* ---------- Переключение управляемого игрока ---------- */
function autoSwitch() {
  const user = G.teams[G.userTeam];
  if (ball.owner && ball.owner.team === G.userTeam && !ball.owner.isKeeper) {
    G.controlled = ball.owner;
    return;
  }
  let best = null, bd = 1e9;
  for (const p of user.players) {
    if (p.isKeeper) continue;
    const d = dist2(p.pos.x, p.pos.z, ball.pos.x, ball.pos.z);
    if (d < bd) { bd = d; best = p; }
  }
  const curD = G.controlled ? dist2(G.controlled.pos.x, G.controlled.pos.z, ball.pos.x, ball.pos.z) : 1e9;
  if (best && (!G.controlled || curD > bd + 2.5 || G.controlled.isKeeper)) G.controlled = best;
}

/* ---------- Управляемый игрок ---------- */
const _fwd = new THREE.Vector3();
const _rgt = new THREE.Vector3();
function updateControlled(dt) {
  const p = G.controlled;
  if (!p) return;
  camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
  _rgt.set(-_fwd.z, 0, _fwd.x);

  const mx = input.moveX, my = input.moveY;
  const mag = Math.sqrt(mx * mx + my * my);
  p.sprinting = !!input.sprint;
  if (mag > 0.06 && p.celebrateT <= 0) {
    const wx = _rgt.x * mx + _fwd.x * -my;
    const wz = _rgt.z * mx + _fwd.z * -my;
    p.setMoveTarget(p.pos.x + wx * 6, p.pos.z + wz * 6);
  } else {
    p.setMoveTarget(p.pos.x, p.pos.z);
  }

  // действия
  if (G.state === 'play' && p.celebrateT <= 0) {
    if (input.passLatch) {
      if (ball.owner === p) {
        let ax = 0, az = 0;
        if (mag > 0.15) { ax = _rgt.x * mx + _fwd.x * -my; az = _rgt.z * mx + _fwd.z * -my; }
        passBall(p, ax, az, mag > 0.15);
      } else requestTackle(p);
    }
    if (input.tackleLatch) {
      if (ball.owner !== p) requestTackle(p);
      else passBall(p, _fwd.x, _fwd.z, false);
    }
    if (input.shootLatch) {
      if (ball.owner === p) shoot(p, Math.max(0.35, input.shootCharge), 0.85);
      else requestTackle(p);
    }
  }
}

/* ---------- Основной шаг ---------- */
let fanTime = 0;
function step(dt) {
  G.msg.update(dt);
  G.stateT -= dt;

  switch (G.state) {
    case 'menu': menuIdleCam(dt); break;
    case 'kickoff': {
      if (G.stateT <= 0) {
        G.state = 'play';
        const kf = G.teams[G.kickoffTeam].players[9];
        ball.takeBy(kf);
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

  // игроки и мяч обновляются во всех игровых состояниях
  if (G.state !== 'menu' && G.state !== 'end' && G.state !== 'paused') {
    for (const team of G.teams) {
      for (const p of team.players) p.update(dt);
    }
    // расталкивание игроков
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
    ball.update(dt, null);
    ball.syncMesh();
  }

  // фанаты
  const ballDanger = G.state === 'play' && Math.min(
    dist2(ball.pos.x, ball.pos.z, FL(), 0), dist2(ball.pos.x, ball.pos.z, -FL(), 0)) < 26;
  stadium.fans.update(dt, G.cheer || (ballDanger && Math.random() < 0.5));

  // маркер управляемого игрока
  if (G.controlled && G.state !== 'menu' && G.state !== 'end') {
    markerMesh.visible = true;
    markerMesh.position.set(G.controlled.pos.x, 0.06, G.controlled.pos.z);
    markerMesh.rotation.z = performance.now() * 0.002;
  } else markerMesh.visible = false;

  if (G.state !== 'menu') followCamera(dt);
  updateHUD();
}

function playStep(dt) {
  const realDt = Math.min(dt, 0.05);
  pollInput(realDt);

  // время матча
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

  autoSwitch();
  updateControlled(realDt);

  // ИИ обеих команд
  updateTeamAI(G, 0, realDt);
  updateTeamAI(G, 1, realDt);
  for (const team of G.teams) {
    for (const p of team.players) {
      if (p !== G.controlled) {
        p.moveTarget.copy(p.aiTarget);
      }
    }
  }

  // подбор мяча
  if (!ball.owner) {
    const claim = findClaimant(ball, [...G.teams[0].players, ...G.teams[1].players], G.controlled);
    if (claim && (G.claimLockTeam === -1 || claim.team === G.claimLockTeam)) {
      ball.takeBy(claim);
      G.receiver = null;
    }
  }

  // вратарь-владелец в опасности? ИИ выдаёт мяч через keeperDistribute (в ai.js)

  checkRules();
}

/* ---------- Камера ---------- */
const camLook = new THREE.Vector3();
function followCamera(dt) {
  const lead = 0.22;
  const tx = clamp(ball.pos.x + ball.vel.x * lead, -FL() + 4, FL() - 4);
  const tz = clamp(ball.pos.z + ball.vel.z * lead, -FW() + 3, FW() - 3);
  const k = 1 - Math.exp(-3.2 * dt);
  camera.position.x += (tx * 0.84 - camera.position.x) * k;
  camera.position.z += (58 - camera.position.z) * k;
  camera.position.y += (27 - camera.position.y) * k;
  camLook.x += (tx * 0.92 - camLook.x) * k;
  camLook.z += (tz * 0.55 - camLook.z) * k;
  camLook.y += (1.2 - camLook.y) * k;
  camera.lookAt(camLook);
}
function menuIdleCam(dt) {
  const t = performance.now() * 0.00012;
  camera.position.set(Math.sin(t) * 70, 24, Math.cos(t) * 70 + 10);
  camera.lookAt(0, 1, 0);
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
}
function updateScoreboard() {
  document.getElementById('score').textContent = `${G.teams[0].score} : ${G.teams[1].score}`;
  document.getElementById('nameA').textContent = G.teams[0].name;
  document.getElementById('nameB').textContent = G.teams[1].name;
  document.getElementById('halfLabel').textContent = G.half === 1 ? '1-й тайм' : '2-й тайм';
}

/* ---------- Старт матча / конец ---------- */
function startMatch(diffKey, realMinutes) {
  const d = DIFF[diffKey] || DIFF.normal;
  for (const team of G.teams) {
    team.score = 0;
    team.attackDir = team.idx === 0 ? 1 : -1;
    team.diff = team.idx === G.userTeam
      ? { speed: 1.0, skill: 0.8, passRate: 0.8 }
      : { speed: d.speed, skill: d.skill, passRate: d.passRate };
  }
  G.minute = 0; G.half = 1;
  G.kickoffTeam = 0;
  G.matchHalfSeconds = realMinutes * 60 / 2;
  resetPositions();
  G.controlled = G.teams[0].players[9];
  updateScoreboard();
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('endScreen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('joyZone').classList.remove('hidden');
  document.getElementById('actions').classList.remove('hidden');
  showBanner('МАТЧ НАЧАЛСЯ!', '', 1.4);
  G.state = 'kickoff';
  G.stateT = 1.2;
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

/* ---------- UI-биндинги ---------- */
function tryFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fn) { try { fn.call(el); } catch (e) {} }
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
}

function bindUI() {
  let diffSel = 'normal', lenSel = 6;
  const pick = (id, cb) => {
    const seg = document.getElementById(id);
    seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      cb(b.dataset.v);
    }));
  };
  pick('diffSeg', v => diffSel = v);
  pick('lenSeg', v => lenSel = +v);
  document.getElementById('playBtn').addEventListener('click', () => {
    Snd.init(); Snd.resume();
    tryFullscreen();
    startMatch(diffSel, lenSel);
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
  });
  document.getElementById('againBtn').addEventListener('click', () => {
    tryFullscreen();
    startMatch(diffSel, lenSel);
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

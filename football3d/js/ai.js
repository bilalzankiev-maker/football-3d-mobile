'use strict';
/* ==== ИИ v2: персональная опека, офсайдная дисциплина, пошаговое предсказание у вратаря ==== */

const FORMATION = [
  { role: 'GK', fx: -0.93, fz: 0 },
  { role: 'DF', fx: -0.68, fz: -0.6 },
  { role: 'DF', fx: -0.75, fz: -0.21 },
  { role: 'DF', fx: -0.75, fz: 0.21 },
  { role: 'DF', fx: -0.68, fz: 0.6 },
  { role: 'MF', fx: -0.33, fz: -0.62 },
  { role: 'MF', fx: -0.44, fz: -0.22 },
  { role: 'MF', fx: -0.44, fz: 0.22 },
  { role: 'MF', fx: -0.33, fz: 0.62 },
  { role: 'FW', fx: -0.06, fz: -0.24 },
  { role: 'FW', fx: -0.06, fz: 0.24 },
];

let AI_G = null;
function initAI(gameState) { AI_G = gameState; }

function basePos(team, p) {
  const d = team.attackDir;
  return [d * p.fx * FL(), p.fz * FW()];
}

/* Предел офсайда для атакующей команды: второй с конца защитник + мяч */
function offsideLineX(state, teamIdx) {
  const d = state.teams[teamIdx].attackDir;
  const opps = state.teams[1 - teamIdx].players.map(p => p.pos.x * d).sort((a, b) => a - b);
  const line = opps.length >= 2 ? opps[1] : (opps[0] || 0);
  return Math.max(line, ball.pos.x * d, 0) * d;
}

/* Пошаговая симуляция: z мяча на плоскости x = targetX и время до неё */
function predictBallAtX(targetSign, targetX, out) {
  let x = ball.pos.x, z = ball.pos.z, y = ball.pos.y;
  let vx = ball.vel.x, vz = ball.vel.z, vy = ball.vel.y;
  const dt = 0.05;
  out.t = -1;
  for (let t = 0; t < 1.6; t += dt) {
    vy -= CFG.GRAVITY * dt;
    const drag = y > 0.4 ? 0.10 : 0;
    const f = 1 - drag * dt;
    vx *= f; vz *= f;
    x += vx * dt; z += vz * dt; y += vy * dt;
    if (y < 0.36) {
      y = 0.36;
      if (vy < 0) { vy = -vy * 0.58; if (vy < 0.9) vy = 0; }
      const hv = Math.sqrt(vx * vx + vz * vz);
      if (hv > 0.01) {
        const dec = Math.min(4.0 * dt, hv);
        vx -= vx / hv * dec; vz -= vz / hv * dec;
      }
    }
    const crossed = targetSign > 0 ? x >= targetX : x <= targetX;
    if (crossed) { out.z = clamp(z, -5.2, 5.2); out.t = t; return true; }
    if (Math.abs(x) > FL() + 2) break;
  }
  out.z = clamp(z, -5.2, 5.2);
  return false;
}

/* Основной тактический пересчёт (каждый кадр) */
function updateTeamAI(state, teamIdx, dt) {
  const team = state.teams[teamIdx];
  const opp = state.teams[1 - teamIdx];
  const diff = team.diff;
  const ballFuture = {
    x: ball.pos.x + ball.vel.x * 0.18,
    z: ball.pos.z + ball.vel.z * 0.18,
  };

  const fieldPlayers = team.players.filter(p => !p.isKeeper);
  const dists = fieldPlayers
    .map(p => ({ p, d: dist2(p.pos.x, p.pos.z, ballFuture.x, ballFuture.z) }))
    .sort((a, b) => a.d - b.d);

  const teamHasBall = ball.owner && ball.owner.team === teamIdx;
  const oppHasBall = ball.owner && ball.owner.team === 1 - teamIdx;

  let chaser = null, presser = null;
  if (!teamHasBall && (!oppHasBall || dists[0].p !== ball.owner)) chaser = dists[0].p;
  if (oppHasBall && dists[0].p !== ball.owner) presser = dists[1] && dists[1].p;

  if (!teamHasBall) assignMarks(team, opp);

  for (const p of team.players) {
    if (p === state.controlled || p === state.p2controlled) { p.aiSpeedScale = 1; continue; }

    if (p.isKeeper) { keeperLogic(state, team, p, dt, diff); continue; }

    if (p === state.receiver && !ball.owner) {
      p.aiTarget.set(ballFuture.x, 0, ballFuture.z);
      p.aiSpeedScale = 1;
      continue;
    }

    if (ball.owner === p) { aiWithBall(state, teamIdx, p, dt, diff); continue; }

    if (!teamHasBall && p === chaser) {
      p.aiTarget.set(ballFuture.x, 0, ballFuture.z);
      p.aiSpeedScale = Math.min(1, diff.speed + 0.1);
      continue;
    }
    if (p === presser) {
      const own = ball.owner;
      const gx = own.pos.x + (ball.pos.x - own.pos.x) * 1.5;
      p.aiTarget.set(gx, 0, own.pos.z + (ball.pos.z - own.pos.z) * 0.3);
      p.aiSpeedScale = Math.min(1, diff.speed + 0.1);
      continue;
    }

    formationTarget(state, team, p, teamHasBall);
    p.aiSpeedScale = Math.min(1, 0.95 * diff.speed);
  }

  /* --- попытка отбора --- */
  if (oppHasBall && chaser && chaser !== state.controlled) {
    const d = dist2(chaser.pos.x, chaser.pos.z, ball.pos.x, ball.pos.z);
    if (d < 1.5 && chaser.tackleAnimT <= 0 && chaser.tackleCd <= 0 && chaser.koTimer <= 0) {
      if (Math.random() < diff.skill * 0.9 * dt) state.requestTackle(chaser);
    }
  }
  if (oppHasBall && presser && presser !== state.controlled) {
    const d = dist2(presser.pos.x, presser.pos.z, ball.pos.x, ball.pos.z);
    if (d < 1.3 && presser.tackleAnimT <= 0 && presser.tackleCd <= 0) {
      if (Math.random() < diff.skill * 0.9 * dt) state.requestTackle(presser);
    }
  }
}

/* Назначение персональных опекунов: опасные соперники — ближайшим DF/MF */
function assignMarks(team, opp) {
  const d = team.attackDir;
  const defenders = team.players.filter(p => !p.isKeeper && (p.role === 'DF' || p.role === 'MF'));
  const threats = opp.players
    .filter(q => !q.isKeeper && q.pos.x * d < FL() * 0.25)
    .sort((a, b) => (a.pos.x * d) - (b.pos.x * d));
  for (const p of defenders) p.markTarget = null;
  for (const q of threats) {
    let best = null, bd = 1e9;
    for (const p of defenders) {
      if (p.markTarget) continue;
      const dd = dist2(p.pos.x, p.pos.z, q.pos.x, q.pos.z);
      if (dd < bd) { bd = dd; best = p; }
    }
    if (best && bd < 30) best.markTarget = q;
  }
}

function formationTarget(state, team, p, teamHasBall) {
  const teamIdx = team.idx;
  const d = team.attackDir;
  const [bx, bz] = basePos(team, p);

  if (!teamHasBall && p.markTarget) {
    const q = p.markTarget;
    const gx = -d * FL();
    const mx = q.pos.x + (gx - q.pos.x) * 0.09;
    const mz = q.pos.z * 0.94;
    p.aiTarget.set(mx, 0, clamp(mz, -FW() + 1, FW() - 1));
    p.aiSpeedScale = 1.02;
    return;
  }

  let x = bx + clamp(ball.pos.x, -FL(), FL()) * 0.42 + (teamHasBall ? d * 5 : d * -2.5);
  let z = bz + ball.pos.z * 0.34;
  const maxShift = p.role === 'DF' ? 8 : 16;
  x = clamp(x, bx - maxShift - 6, bx + maxShift + 6 + d * 4);
  x = clamp(x, -FL() + 1.5, FL() - 1.5);
  z = clamp(z, -FW() + 1, FW() - 1);

  if (teamHasBall && (p.role === 'FW' || p.role === 'MF') && AI_G && AI_G.offsideOn) {
    const lineW = offsideLineX(AI_G, teamIdx);
    if (d > 0) x = Math.min(x, lineW - 0.4);
    else x = Math.max(x, lineW + 0.4);
  }
  p.aiTarget.set(x, 0, z);
}

/* ИИ владеющего мячом (не пользователь) */
function aiWithBall(state, teamIdx, p, dt, diff) {
  const team = state.teams[teamIdx];
  const d = team.attackDir;
  const goalX = d * FL();
  const distGoal = dist2(p.pos.x, p.pos.z, goalX, 0);

  let opp = null, od = 1e9;
  for (const q of state.teams[1 - teamIdx].players) {
    const dd = dist2(p.pos.x, p.pos.z, q.pos.x, q.pos.z);
    if (dd < od) { od = dd; opp = q; }
  }

  let tx = goalX, tz = clamp(p.pos.z * 0.75, -8, 8);
  if (opp && od < 4.0) {
    const away = (p.pos.z - opp.pos.z) > 0 ? 1 : -1;
    tz = clamp(p.pos.z + away * 5, -FW() + 2, FW() - 2);
    if (Math.abs(p.pos.z) > FW() - 6) tx = goalX - d * 6;
  }
  p.aiTarget.set(tx, 0, tz);
  p.aiSpeedScale = 1;
  p.sprinting = od > 3 && distGoal > 18 && p.stamina > 25;

  p.decideT -= dt;
  if (p.decideT > 0) return;
  p.decideT = 0.22;

  const skill = diff.skill;
  const pressure = od < 2.8;
  const shootRange = 20 + skill * 14;
  if (distGoal < shootRange && Math.abs(p.pos.z) < 22) {
    const openAngle = od > 2.0 || distGoal < 15;
    if (openAngle && Math.random() < 0.5 + skill * 0.4) {
      state.aiShoot(p, clamp(distGoal / 26, 0.35, 1));
      return;
    }
  }
  const wantPass = (pressure && Math.random() < 0.75)
    || Math.random() < (1 - skill) * 0.2 + diff.passRate * 0.25;
  if (wantPass) state.aiPass(p);
}

/* ==== Вратарь ==== */
function keeperLogic(state, team, p, dt, diff) {
  const d = team.attackDir;
  const goalX = -d * FL();
  const distBall = dist2(ball.pos.x, ball.pos.z, goalX, 0);

  if (ball.owner === p) {
    p.holdWait = (p.holdWait || 0) + dt;
    p.aiTarget.set(goalX + d * 2.5, 0, clamp(p.pos.z, -2, 2));
    if (p.holdWait > 1.1) { state.keeperDistribute(p); p.holdWait = 0; }
    return;
  }

  let tx, tz;
  if (distBall < 14 && (!ball.owner || ball.owner.team !== p.team) && Math.abs(ball.vel.x) < 6
      && ball.pos.y < 1.2) {
    tx = ball.pos.x;
    tz = ball.pos.z;
  } else {
    let vx = ball.pos.x - goalX, vz = ball.pos.z;
    const vl = Math.sqrt(vx * vx + vz * vz) || 1;
    vx /= vl; vz /= vl;
    const out = clamp(2.2 + distBall * 0.09, 2.2, 7.5);
    tx = goalX + vx * out;
    tz = vz * out * 1.6;
    tx = d === 1 ? clamp(tx, goalX + 0.8, goalX + 11) : clamp(tx, goalX - 11, goalX - 0.8);
    tz = clamp(tz, -4.4, 4.4);
  }

  const towardGoal = ball.vel.x * -d > 7;
  let intercept = false;
  if (!ball.owner && towardGoal && distBall < 26) {
    const out = { z: 0, t: -1 };
    if (predictBallAtX(-d, goalX + d * 0.7, out) && out.t >= 0 && out.t < 1.4
        && Math.abs(out.z - p.pos.z) > 0.4) {
      intercept = true;
      /* ошибка чтения траектории: тем больше, чем быстрее мяч */
      const spd = Math.sqrt(ball.vel.x * ball.vel.x + ball.vel.z * ball.vel.z);
      const err = clamp(spd / 38, 0, 1) * rand(-1.8, 1.8);
      tz = clamp(out.z + err, -4.6, 4.6);
      tx = goalX + d * 0.7;
    }
  }

  p.aiTarget.set(tx, 0, tz);
  p.aiSpeedScale = intercept ? 1.15 : 1;

  const reach = 1.15 + (p.diveT > 0 ? 0.9 : 0);
  const dd = dist2(p.pos.x, p.pos.z, ball.pos.x, ball.pos.z);
  if (!ball.owner && dd < reach && ball.pos.y < 2.7) {
    const spd = ball.vel.length();
    let missChance = spd > 26 ? 0.45 : spd > 20 ? 0.3 : spd > 14 ? 0.16 : 0.05;
    if (diff && diff.skill) missChance *= 1.3 - diff.skill * 0.6;
    const react = Math.random() < missChance;   // кипер не дотянулся
    if ((spd > 14 || ball.pos.y > 1.9) && !react) {
      const dir = (ball.pos.z >= 0 ? 1 : -1) * (Math.random() < 0.5 ? 1 : -1) || 1;
      ball.kick(-Math.sign(ball.vel.x) * Math.max(6, spd * 0.35), 3.5, dir * rand(4, 8), p.team);
      p.playDive(dir);
      state.onSave(p);
    } else if (ball.claimCooldown <= 0) {
      ball.takeBy(p);
      p.playDive(Math.sign(ball.pos.z - p.pos.z) || 1);
      state.onCatch(p);
    }
  }
}

'use strict';
/* ==== Искусственный интеллект: тактика, дриблинг, передачи, удары, вратари ==== */

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

/* Основной тактический пересчёт (вызывается каждый кадр) */
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

  // распределение ролей реактивного прессинга
  let chaser = null, presser = null;
  if (!teamHasBall && (!oppHasBall || dists[0].p !== ball.owner)) chaser = dists[0].p;
  if (oppHasBall && dists[0].p !== ball.owner) presser = dists[1] && dists[1].p;

  for (const p of team.players) {
    if (p === state.controlled) { p.aiSpeedScale = 1; continue; }

    if (p.isKeeper) { keeperLogic(state, team, p, dt, diff); continue; }

    if (p === state.receiver && !ball.owner) {
      // адресат паса идёт на мяч
      p.aiTarget.set(ballFuture.x, 0, ballFuture.z);
      p.aiSpeedScale = 1;
      continue;
    }

    if (ball.owner === p) { aiWithBall(state, teamIdx, p, dt, diff); continue; }

    if (!teamHasBall && p === chaser) {
      p.aiTarget.set(ballFuture.x, 0, ballFuture.z);
      p.aiSpeedScale = 1;
      continue;
    }
    if (p === presser) {
      const own = ball.owner;
      const gx = own.pos.x + (ball.pos.x - own.pos.x) * 1.5;
      p.aiTarget.set(gx, 0, own.pos.z + (ball.pos.z - own.pos.z) * 0.3);
      p.aiSpeedScale = 1;
      continue;
    }

    formationTarget(state, team, p, teamHasBall);
    p.aiSpeedScale = Math.min(1, 0.95 * diff.speed);
  }

  // попытка отбора у игрока, который ближе всех к мячу соперника
  if (oppHasBall && chaser && chaser !== state.controlled) {
    const own = ball.owner;
    const d = dist2(chaser.pos.x, chaser.pos.z, ball.pos.x, ball.pos.z);
    if (d < 1.5 && chaser.tackleAnimT <= 0 && chaser.koTimer <= 0) {
      if (Math.random() < diff.skill * 0.9 * dt) state.requestTackle(chaser);
    }
  }
  // отбор в новичковом стиле у прессера
  if (oppHasBall && presser && presser !== state.controlled) {
    const d = dist2(presser.pos.x, presser.pos.z, ball.pos.x, ball.pos.z);
    if (d < 1.3 && presser.tackleAnimT <= 0 && Math.random() < diff.skill * 0.9 * dt) {
      state.requestTackle(presser);
    }
  }
}

function formationTarget(state, team, p, teamHasBall) {
  const d = team.attackDir;
  const [bx, bz] = basePos(team, p);
  let x = bx + clamp(ball.pos.x, -FL(), FL()) * 0.42 + (teamHasBall ? d * 5 : d * -2.5);
  let z = bz + ball.pos.z * 0.34;
  const maxShift = p.role === 'DF' ? 8 : 16;
  x = clamp(x, bx - maxShift - 6, bx + maxShift + 6 + d * 4);
  x = clamp(x, -FL() + 1.5, FL() - 1.5);
  z = clamp(z, -FW() + 1, FW() - 1);
  p.aiTarget.set(x, 0, z);
}

/* ИИ владеющего мячом (не пользователь) */
function aiWithBall(state, teamIdx, p, dt, diff) {
  const team = state.teams[teamIdx];
  const d = team.attackDir;
  const goalX = d * FL();
  const distGoal = dist2(p.pos.x, p.pos.z, goalX, 0);

  // ближайший соперник
  let opp = null, od = 1e9;
  for (const q of state.teams[1 - teamIdx].players) {
    const dd = dist2(p.pos.x, p.pos.z, q.pos.x, q.pos.z);
    if (dd < od) { od = dd; opp = q; }
  }

  // дриблинг: к воротам с обходом опекуна
  let tx = goalX, tz = clamp(p.pos.z * 0.75, -8, 8);
  if (opp && od < 4.0) {
    const away = (p.pos.z - opp.pos.z) > 0 ? 1 : -1;
    tz = clamp(p.pos.z + away * 5, -FW() + 2, FW() - 2);
    if (Math.abs(p.pos.z) > FW() - 6) tx = goalX - d * 6;
  }
  p.aiTarget.set(tx, 0, tz);
  p.aiSpeedScale = 1;
  p.sprinting = distGoal > 18;

  p.decideT -= dt;
  if (p.decideT > 0) return;
  p.decideT = 0.22;

  const skill = diff.skill;
  // удар
  const shootRange = 19 + skill * 13;
  if (distGoal < shootRange && Math.abs(p.pos.z) < 22) {
    const openAngle = od > 2.0 || distGoal < 15;
    if (openAngle && Math.random() < 0.5 + skill * 0.4) {
      state.aiShoot(p, clamp(distGoal / 26, 0.35, 1));
      return;
    }
  }
  // пас
  const wantPass = (od < 2.8 && Math.random() < 0.75) || Math.random() < (1 - skill) * 0.2 + diff.passRate * 0.25;
  if (wantPass) state.aiPass(p);
}

/* ==== Вратарь ==== */
function keeperLogic(state, team, p, dt, diff) {
  const d = team.attackDir;
  const goalX = -d * FL();
  const distBall = dist2(ball.pos.x, ball.pos.z, goalX, 0);

  if (ball.owner === p) {
    // держит мяч, затем выбивает
    p.holdWait = (p.holdWait || 0) + dt;
    p.aiTarget.set(goalX + d * 2.5, 0, clamp(p.pos.z, -2, 2));
    if (p.holdWait > 1.1) { state.keeperDistribute(p); p.holdWait = 0; }
    return;
  }

  let tx, tz;
  if (distBall < 14 && (!ball.owner || ball.owner.team !== p.team) && Math.abs(ball.vel.x) < 6
      && ball.pos.y < 1.2) {
    //-danger: выход на мяч
    tx = ball.pos.x;
    tz = ball.pos.z;
  } else {
    // позиция на дуге перед воротами
    let vx = ball.pos.x - goalX, vz = ball.pos.z;
    const vl = Math.sqrt(vx * vx + vz * vz) || 1;
    vx /= vl; vz /= vl;
    const out = clamp(2.2 + distBall * 0.09, 2.2, 7.5);
    tx = goalX + vx * out * d * d; // d*d=1: остаёмся в поле
    tz = vz * out * 1.6;
    tx = d === 1 ? clamp(tx, goalX + 0.8, goalX + 11) : clamp(tx, goalX - 11, goalX - 0.8);
    tz = clamp(tz, -4.4, 4.4);
  }

  // перехват удара: предсказать Z на линии вратаря
  const towardGoal = ball.vel.x * -d > 7; // мяч летит в наши ворота
  let intercept = false;
  if (!ball.owner && towardGoal && distBall < 26) {
    const rel = (goalX + d * 0.7) - ball.pos.x;
    const vx = ball.vel.x;
    if (Math.sign(rel) === Math.sign(vx) && Math.abs(vx) > 6) {
      const t = rel / vx;
      const pz = ball.pos.z + ball.vel.z * t;
      if (t > 0 && t < 1.4 && Math.abs(pz) < 5.2 && Math.abs(pz - p.pos.z) > 0.4) {
        intercept = true;
        tz = clamp(pz, -4.6, 4.6);
        tx = goalX + d * 0.7;
      }
    }
  }

  p.aiTarget.set(tx, 0, tz);
  p.aiSpeedScale = intercept ? 1.12 : 1;

  // попытка сейва
  const reach = 1.15 + (p.diveT > 0 ? 0.9 : 0);
  const dd = dist2(p.pos.x, p.pos.z, ball.pos.x, ball.pos.z);
  if (!ball.owner && dd < reach && ball.pos.y < 2.7) {
    const spd = ball.vel.length();
    const missChance = spd > 24 ? 0.32 : spd > 17 ? 0.18 : 0.04;
    const react = ball.claimCooldown < 0.12 ? (Math.random() < missChance) : false; // рефлекс на самый крайний
    if ((spd > 14 || ball.pos.y > 1.9) && !react) {
      // отражение
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

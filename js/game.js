'use strict';
// ============================================================
//  KIEZ KINGS – Berlin  |  Spiellogik
// ============================================================

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = Math.random;
const pick = a => a[(rand() * a.length) | 0];
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // 0=Ost 1=Süd 2=West 3=Nord

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let VW = 0, VH = 0, DPR = 1;

// ------------------------------------------------------------
//  Fahrzeugmodelle
// ------------------------------------------------------------
const MODELS = {
  kompakt: { name: 'Kompaktwagen', len: 40, wid: 20, max: 340, acc: 270, grip: 7, turn: 2.7, hp: 100, colors: ['#3b6fb6', '#b33a3a', '#2f8f5b', '#777c84', '#1d1f24', '#d6d3cc', '#c7792b', '#5b3f8c'] },
  trabi: { name: 'Trabi', len: 34, wid: 18, max: 230, acc: 160, grip: 6, turn: 2.9, hp: 70, colors: ['#8fb8a8', '#d9c27a', '#9fb3cf', '#c98d7a', '#b9c48a'] },
  taxi: { name: 'Taxi', len: 44, wid: 21, max: 350, acc: 260, grip: 7, turn: 2.5, hp: 110, colors: ['#efe4c2'] },
  polizei: { name: 'Streifenwagen', len: 44, wid: 21, max: 410, acc: 340, grip: 8, turn: 2.7, hp: 150, colors: ['#e9edf0'] },
  sport: { name: 'Sportwagen', len: 42, wid: 20, max: 500, acc: 440, grip: 8.5, turn: 3.0, hp: 90, colors: ['#d4202c', '#f2c200', '#111'] },
  transporter: { name: 'Transporter', len: 50, wid: 23, max: 280, acc: 190, grip: 6, turn: 2.1, hp: 160, colors: ['#f0f0ee', '#c8d2db', '#e0b84a'] },
  bus: { name: 'Linienbus', len: 84, wid: 26, max: 230, acc: 130, grip: 6, turn: 1.5, hp: 260, colors: ['#f5c400'] },
};
for (const k in MODELS) {
  const m = MODELS[k]; m.key = k;
  const n = Math.max(2, Math.ceil(m.len / m.wid));
  m.r = m.wid / 2;
  m.circles = [];
  for (let i = 0; i < n; i++) m.circles.push(lerp(-m.len / 2 + m.r, m.len / 2 - m.r, i / (n - 1)));
  m.mass = m.len * m.wid / 800;
}

// ------------------------------------------------------------
//  Spielzustand
// ------------------------------------------------------------
const G = {
  state: 'title', // title | play | pause
  time: 0, clock: 9.5, // Tageszeit in Stunden
  cars: [], peds: [], cops: [], particles: [], skids: [],
  player: null, cam: { x: 0, y: 0, z: 1 },
  wanted: 0, wantedCool: 0, evadeT: 0, bustT: 0,
  flow: null, flowT: 0, flowSrc: -1,
  mission: null, missionIdx: 0, missionStep: 0, missionTimer: 0, missionData: {},
  taxi: null,
  msgT: 0, toastQueue: [], toastT: 0,
  showMap: false, nextId: 1,
  carCount: 0,
};

const keys = {};
const touch = { active: false, jx: 0, jy: 0, brake: false, gas: false };

// ------------------------------------------------------------
//  Kollision mit der Welt
// ------------------------------------------------------------
function collideCircle(cx, cy, r, withTrees) {
  let px = 0, py = 0, hit = false;
  const x0 = Math.floor((cx - r) / T), x1 = Math.floor((cx + r) / T);
  const y0 = Math.floor((cy - r) / T), y1 = Math.floor((cy + r) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (isSolidTile(tx, ty)) {
      const nx = clamp(cx, tx * T, tx * T + T), ny = clamp(cy, ty * T, ty * T + T);
      const dx = cx - nx, dy = cy - ny, d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        let mx = 0, my = 0;
        if (d2 > 1e-6) { const d = Math.sqrt(d2), p = r - d; mx = dx / d * p; my = dy / d * p; }
        else {
          const l = cx - tx * T, rr = tx * T + T - cx, u = cy - ty * T, b = ty * T + T - cy;
          const m = Math.min(l, rr, u, b);
          if (m === l) mx = -(l + r); else if (m === rr) mx = rr + r; else if (m === u) my = -(u + r); else my = b + r;
        }
        cx += mx; cy += my; px += mx; py += my; hit = true;
      }
    }
    if (withTrees) {
      const tr = World.treeAt.get(ty * MW + tx);
      if (tr) {
        const dx = cx - tr.x, dy = cy - tr.y, d = Math.hypot(dx, dy), rr = r + tr.tr;
        if (d < rr && d > 0.01) { const p = rr - d; cx += dx / d * p; cy += dy / d * p; px += dx / d * p; py += dy / d * p; hit = true; }
      }
    }
  }
  // Kartenrand
  const minX = T * 0.5, maxX = MW * T - T * 0.5, minY = T * 0.5, maxY = MH * T - T * 0.5;
  if (cx < minX) { px += minX - cx; hit = true; } if (cx > maxX) { px += maxX - cx; hit = true; }
  if (cy < minY) { py += minY - cy; hit = true; } if (cy > maxY) { py += maxY - cy; hit = true; }
  return hit ? { px, py } : null;
}

function lineOfSight(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 20);
  for (let i = 1; i < n; i++) {
    const x = lerp(ax, bx, i / n), y = lerp(ay, by, i / n);
    if (isSolidTile(Math.floor(x / T), Math.floor(y / T))) return false;
  }
  return true;
}

// ------------------------------------------------------------
//  Autos
// ------------------------------------------------------------
function makeCar(modelKey, x, y, angle, color) {
  const m = MODELS[modelKey];
  const c = {
    id: G.nextId++, kind: 'car', model: m, x, y, angle, vx: 0, vy: 0, av: 0,
    steer: 0, throttle: 0, handbrake: false, hp: m.hp, color: color || pick(m.colors),
    driver: null, ai: null, police: modelKey === 'polizei', siren: false, burning: 0, wreck: false,
    mission: false, skidOn: false, lastSkid: null, honkT: 0, lightT: rand() * 10,
  };
  G.cars.push(c);
  return c;
}

function carSpeed(c) { return Math.hypot(c.vx, c.vy); }
function carForward(c) { return c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle); }

function updateCarPhysics(c, dt) {
  const m = c.model;
  const fx = Math.cos(c.angle), fy = Math.sin(c.angle);
  let vf = c.vx * fx + c.vy * fy;
  let vl = -c.vx * fy + c.vy * fx;
  const th = c.wreck || c.burning > 0 ? 0 : c.throttle;
  const maxV = m.max * (c.hp < m.hp * 0.3 ? 0.7 : 1);

  if (th > 0) {
    if (vf < -10) vf += 700 * th * dt;
    else if (vf < maxV) vf += m.acc * th * dt * (1 - Math.max(0, vf) / maxV * 0.6);
  } else if (th < 0) {
    if (vf > 10) vf -= 650 * -th * dt;
    else if (vf > -maxV * 0.35) vf -= m.acc * 0.7 * -th * dt;
  } else {
    const dec = Math.min(Math.abs(vf), 140 * dt);
    vf -= Math.sign(vf) * dec;
  }
  vf -= vf * 0.25 * dt;

  const grip = c.handbrake ? 1.3 : m.grip;
  const lateralLoss = vl * Math.min(1, grip * dt);
  vl -= lateralLoss;
  if (c.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 260 * dt);

  // Reifenspuren
  c.skidOn = Math.abs(vl) > 90 || (c.handbrake && Math.abs(vf) > 80) || (th < 0 && vf > 150);

  const steerF = clamp(vf / 110, -1, 1);
  const targetAv = c.steer * m.turn * steerF * (c.handbrake ? 1.45 : 1);
  c.av += (targetAv - c.av) * Math.min(1, 10 * dt);

  c.vx = fx * vf - fy * vl;
  c.vy = fy * vf + fx * vl;
  c.angle += c.av * dt;
  c.x += c.vx * dt;
  c.y += c.vy * dt;

  // Weltkollision
  const cs = Math.cos(c.angle), sn = Math.sin(c.angle);
  let impact = 0;
  for (const off of m.circles) {
    const res = collideCircle(c.x + cs * off, c.y + sn * off, m.r - 1, true);
    if (res) {
      c.x += res.px; c.y += res.py;
      const len = Math.hypot(res.px, res.py);
      if (len > 0) {
        const nx = res.px / len, ny = res.py / len;
        const vn = c.vx * nx + c.vy * ny;
        if (vn < 0) {
          c.vx -= 1.3 * vn * nx; c.vy -= 1.3 * vn * ny;
          c.vx *= 0.92; c.vy *= 0.92;
          impact = Math.max(impact, -vn);
          c.av += (off > 0 ? 1 : -1) * (nx * -sn + ny * cs) * -vn * 0.004;
        }
      }
    }
  }
  if (impact > 70) {
    damageCar(c, (impact - 70) * 0.13);
    if (impact > 120) { Sound.crash(impact * (c.driver === 'player' ? 1 : 0.3)); sparks(c.x, c.y, 6); if (c.driver === 'player') shake(impact / 60); }
  }

  if (c.skidOn && carSpeed(c) > 60) addSkid(c); else c.lastSkid = null;

  // Schaden-Effekte
  if (c.hp < m.hp * 0.35 && !c.wreck && rand() < dt * 8) smoke(c.x + cs * m.len * 0.4, c.y + sn * m.len * 0.4, c.burning > 0 ? '#444' : '#9a9a9a');
  if (c.burning > 0) {
    c.burning -= dt;
    if (rand() < dt * 30) fire(c.x + (rand() - 0.5) * m.len * 0.6, c.y + (rand() - 0.5) * m.wid);
    if (c.burning <= 0) explodeCar(c);
  }
}

function damageCar(c, d) {
  if (c.wreck || c.burning > 0) return;
  c.hp -= d;
  if (c.hp <= 0) {
    c.hp = 0; c.burning = 4;
    if (c.driver === 'player') { toast('Die Karre brennt! Raus da! (E)', 3); }
    else if (c.driver === 'ai' || c.driver === 'police') ejectDriver(c);
  }
}

function explodeCar(c) {
  c.wreck = true; c.burning = 0; c.color = '#2a2624'; c.vx *= 0.2; c.vy *= 0.2;
  Sound.boom(); shake(12);
  for (let i = 0; i < 40; i++) fire(c.x + (rand() - 0.5) * 40, c.y + (rand() - 0.5) * 40, true);
  for (let i = 0; i < 20; i++) smoke(c.x + (rand() - 0.5) * 50, c.y + (rand() - 0.5) * 50, '#333');
  const p = G.player;
  if (c.driver === 'player') { exitCar(true); hurtPlayer(55, 'Explosion'); }
  else if (!p.car && Math.hypot(p.x - c.x, p.y - c.y) < 90) hurtPlayer(35, 'Explosion');
  for (const o of G.cars) if (o !== c) {
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d < 110) { const k = (110 - d) * 4; o.vx += (o.x - c.x) / (d + 1) * k; o.vy += (o.y - c.y) / (d + 1) * k; damageCar(o, (110 - d) * 0.5); }
  }
  for (const pd of G.peds.concat(G.cops)) if (Math.hypot(pd.x - c.x, pd.y - c.y) < 100) knockPed(pd, (pd.x - c.x) * 4, (pd.y - c.y) * 4);
  c.driver = null; c.ai = null;
}

function ejectDriver(c) {
  const s = Math.sin(c.angle), co = Math.cos(c.angle);
  if (c.police) {
    const cop = spawnCop(c.x - s * 26, c.y + co * 26);
    if (cop) cop.fromCar = c;
  } else {
    const p = spawnPed(c.x - s * 26, c.y + co * 26);
    if (p) { p.flee = 6; }
  }
  c.driver = null; c.ai = null; c.siren = false;
}

// Auto-gegen-Auto
function carCollisions() {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const lim = (a.model.len + b.model.len) / 2;
      const dx0 = b.x - a.x, dy0 = b.y - a.y;
      if (dx0 > lim || dx0 < -lim || dy0 > lim || dy0 < -lim) continue;
      const ca = Math.cos(a.angle), sa = Math.sin(a.angle), cb = Math.cos(b.angle), sb = Math.sin(b.angle);
      let best = null;
      for (const oa of a.model.circles) for (const ob of b.model.circles) {
        const ax = a.x + ca * oa, ay = a.y + sa * oa, bx = b.x + cb * ob, by = b.y + sb * ob;
        const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), rr = a.model.r + b.model.r - 2;
        if (d < rr && (!best || rr - d > best.p)) best = { p: rr - d, nx: d > 0 ? dx / d : 1, ny: d > 0 ? dy / d : 0 };
      }
      if (!best) continue;
      const ma = a.model.mass * (a.wreck ? 2 : 1), mb = b.model.mass * (b.wreck ? 2 : 1), tot = ma + mb;
      a.x -= best.nx * best.p * (mb / tot); a.y -= best.ny * best.p * (mb / tot);
      b.x += best.nx * best.p * (ma / tot); b.y += best.ny * best.p * (ma / tot);
      const rv = (b.vx - a.vx) * best.nx + (b.vy - a.vy) * best.ny;
      if (rv < 0) {
        const jimp = -(1.25) * rv / (1 / ma + 1 / mb);
        a.vx -= jimp / ma * best.nx; a.vy -= jimp / ma * best.ny;
        b.vx += jimp / mb * best.nx; b.vy += jimp / mb * best.ny;
        const imp = -rv;
        if (imp > 60) {
          damageCar(a, (imp - 60) * 0.09 * (mb / tot) * 2);
          damageCar(b, (imp - 60) * 0.09 * (ma / tot) * 2);
          if (imp > 110) {
            sparks((a.x + b.x) / 2, (a.y + b.y) / 2, 8);
            const pl = a.driver === 'player' || b.driver === 'player';
            Sound.crash(imp * (pl ? 1 : 0.3));
            if (pl) {
              shake(imp / 70);
              const other = a.driver === 'player' ? b : a, mine = a.driver === 'player' ? a : b;
              const atFault = carSpeed(mine) > 110 && carSpeed(mine) > carSpeed(other) && mine.throttle > 0.3;
              if (other.police && other.driver === 'police') { if (atFault) crime('cophit'); }
              else if (other.driver === 'ai') crime('crash');
              if (other.driver === 'ai' && other.ai) other.ai.angry = 3;
            }
          }
        }
      }
    }
  }
}

// ------------------------------------------------------------
//  Verkehrs-KI
// ------------------------------------------------------------
function laneCenter(dir, base) {
  // vertikale Fahrtrichtung -> x-Koordinate, horizontale -> y
  if (dir === 0) return (base + 1.5) * T; // Ost: untere Spur
  if (dir === 2) return (base + 0.5) * T; // West: obere Spur
  if (dir === 1) return (base + 0.5) * T; // Süd: linke Spur
  return (base + 1.5) * T;                // Nord: rechte Spur
}
function canGo(xi, yj, nd) {
  let tx, ty;
  if (nd === 0) { tx = xi + 2; ty = yj; } else if (nd === 2) { tx = xi - 1; ty = yj; }
  else if (nd === 1) { tx = xi; ty = yj + 2; } else { tx = xi; ty = yj - 1; }
  return isRoadTile(tileAt(tx, ty));
}

function updateTrafficAI(c, dt) {
  const ai = c.ai;
  const d = ai.dir;
  const fx = DX[d], fy = DY[d];
  // Vorausschau auf Kreuzung
  const lx = c.x + fx * T * 1.1, ly = c.y + fy * T * 1.1;
  const ltx = Math.floor(lx / T), lty = Math.floor(ly / T);
  if (isRoadLine(ltx) && isRoadLine(lty) && isRoadTile(tileAt(ltx, lty))) {
    const xi = ltx - ltx % 12, yj = lty - lty % 12, key = xi * 1000 + yj;
    if (!ai.plan || ai.plan.key !== key) {
      const opts = [];
      if (canGo(xi, yj, d)) opts.push(d, d, d);
      if (canGo(xi, yj, (d + 1) % 4)) opts.push((d + 1) % 4, (d + 1) % 4);
      if (canGo(xi, yj, (d + 3) % 4)) opts.push((d + 3) % 4);
      let nd = opts.length ? pick(opts) : (d + 2) % 4;
      let at;
      if (nd === 1 || nd === 3) at = (nd === 1 ? xi + 0.5 : xi + 1.5) * T;
      else at = (nd === 0 ? yj + 1.5 : yj + 0.5) * T;
      if (nd === (d + 2) % 4) at = (d === 0 || d === 2) ? (xi + 1) * T : (yj + 1) * T;
      ai.plan = { key, nd, at, xi, yj, done: nd === d };
    }
  }
  // Abbiegen
  if (ai.plan && !ai.plan.done) {
    const p = ai.plan;
    const pos = (d === 0 || d === 2) ? c.x : c.y;
    const passed = (d === 0 || d === 1) ? pos >= p.at - 4 : pos <= p.at + 4;
    if (passed) {
      ai.dir = p.nd;
      ai.base = (p.nd === 1 || p.nd === 3) ? p.xi : p.yj;
      p.done = true;
    }
  }
  const nd = ai.dir;
  const lane = laneCenter(nd, ai.base);
  let tx, ty;
  if (nd === 0 || nd === 2) { tx = c.x + DX[nd] * 45; ty = lane; } else { tx = lane; ty = c.y + DY[nd] * 45; }
  const want = Math.atan2(ty - c.y, tx - c.x);
  const diff = angDiff(c.angle, want);
  c.steer = clamp(diff * 2.6, -1, 1);

  // Zielgeschwindigkeit
  let target = ai.cruise;
  if (ai.plan && !ai.plan.done && ai.plan.nd !== d) {
    const pos = (d === 0 || d === 2) ? c.x : c.y;
    if (Math.abs(pos - ai.plan.at) < 90) target = 75;
  }
  if (Math.abs(diff) > 0.5) target = Math.min(target, 70);
  // Hindernisse vor dem Auto
  const cf = Math.cos(c.angle), sf = Math.sin(c.angle);
  let block = 1e9;
  const check = (ox, oy, rad) => {
    const rx = ox - c.x, ry = oy - c.y;
    const along = rx * cf + ry * sf, lat = -rx * sf + ry * cf;
    if (along > 0 && along < 110 && Math.abs(lat) < 14 + rad) block = Math.min(block, along - c.model.len / 2 - rad);
  };
  if (ai.ignore > 0) ai.ignore -= dt;
  else {
    for (const o of G.cars) if (o !== c) { const dx = o.x - c.x, dy = o.y - c.y; if (dx * dx + dy * dy < 140 * 140) check(o.x, o.y, o.model.len / 2); }
    const p = G.player;
    if (!p.car && !p.dead) check(p.x, p.y, 8);
  }
  if (block < 70) target = Math.min(target, Math.max(0, (block - 12) * 2.2));
  const vf = carForward(c);
  c.throttle = clamp((target - vf) / 40, -1, 1);
  if (target < 5 && vf < 5) c.throttle = 0;
  c.handbrake = false;
  if (vf < 8 && target < 20) {
    ai.wait += dt;
    if (ai.wait > 2.5 && ai.honk <= 0 && rand() < 0.02) { ai.honk = 4; if (distToPlayer(c) < 400) Sound.beep(340 + rand() * 80, 0.25, 'square', 0.05); }
    if (ai.wait > 5) { ai.ignore = 1.4; ai.wait = 0; }
  } else ai.wait = 0;
  if (ai.honk > 0) ai.honk -= dt;
  // Wenn weit von der Spur abgekommen (z. B. gerammt): Neuorientierung
  const off = (nd === 0 || nd === 2) ? Math.abs(c.y - lane) : Math.abs(c.x - lane);
  if (off > 70) ai.lost = (ai.lost || 0) + dt; else ai.lost = 0;
  if (ai.lost > 3) reorientAI(c);
}

function reorientAI(c) {
  const tx = Math.floor(c.x / T), ty = Math.floor(c.y / T);
  const t = tileAt(tx, ty);
  if (!isRoadTile(t)) { c.ai.cruise = 0; return; }
  const v = isRoadLine(tx), h = isRoadLine(ty);
  if (h && !v) { c.ai.dir = ty % 12 === 1 ? 0 : 2; c.ai.base = ty - ty % 12; }
  else if (v) { c.ai.dir = tx % 12 === 1 ? 3 : 1; c.ai.base = tx - tx % 12; }
  c.ai.plan = null; c.ai.lost = 0;
}

function distToPlayer(o) { const p = G.player, q = p.car || p; return Math.hypot(o.x - q.x, o.y - q.y); }

// ------------------------------------------------------------
//  Polizei-KI
// ------------------------------------------------------------
function computeFlow() {
  const p = G.player, src = p.car || p;
  const sx = clamp(Math.floor(src.x / T), 0, MW - 1), sy = clamp(Math.floor(src.y / T), 0, MH - 1);
  const N = MW * MH;
  if (!G.flow) G.flow = new Float32Array(N);
  const dist = G.flow;
  dist.fill(1e9);
  const cost = World.cost;
  // Binärer Heap
  const heap = [];
  const push = (k, d) => { heap.push([d, k]); let i = heap.length - 1; while (i > 0) { const pa = (i - 1) >> 1; if (heap[pa][0] <= heap[i][0]) break; [heap[pa], heap[i]] = [heap[i], heap[pa]]; i = pa; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const s = sy * MW + sx;
  dist[s] = 0; push(s, 0);
  const maxD = 400;
  while (heap.length) {
    const [d, k] = pop();
    if (d > dist[k] || d > maxD) continue;
    const x = k % MW, y = (k / MW) | 0;
    for (let n = 0; n < 4; n++) {
      const nx = x + DX[n], ny = y + DY[n];
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const nk = ny * MW + nx, c = cost[nk];
      if (!c) continue;
      const nd = d + c;
      if (nd < dist[nk]) { dist[nk] = nd; push(nk, nd); }
    }
  }
}

function flowTarget(x, y, steps) {
  if (!G.flow) return null;
  let tx = Math.floor(x / T), ty = Math.floor(y / T);
  for (let s = 0; s < steps; s++) {
    let best = G.flow[ty * MW + tx] ?? 1e9, bx = tx, by = ty;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      if (dx && dy && (isSolidTile(tx + dx, ty) || isSolidTile(tx, ty + dy))) continue;
      const v = G.flow[ny * MW + nx] + (dx && dy ? 0.4 : 0);
      if (v < best) { best = v; bx = nx; by = ny; }
    }
    if (bx === tx && by === ty) break;
    tx = bx; ty = by;
  }
  return { x: tx * T + T / 2, y: ty * T + T / 2 };
}

function updatePoliceAI(c, dt) {
  const ai = c.ai;
  const p = G.player;
  const tgt = p.car || p;
  const dx = tgt.x - c.x, dy = tgt.y - c.y, dist = Math.hypot(dx, dy);
  c.siren = true;
  let goal;
  if (dist < 260 && lineOfSight(c.x, c.y, tgt.x, tgt.y)) {
    const lead = p.car ? 0.35 : 0;
    goal = { x: tgt.x + (tgt.vx || 0) * lead, y: tgt.y + (tgt.vy || 0) * lead };
  } else {
    goal = flowTarget(c.x, c.y, 3) || tgt;
  }
  const want = Math.atan2(goal.y - c.y, goal.x - c.x);
  let diff = angDiff(c.angle, want);
  const vf = carForward(c);

  if (ai.reverse > 0) {
    ai.reverse -= dt;
    c.throttle = -1; c.steer = -Math.sign(diff); c.handbrake = false;
    return;
  }
  c.steer = clamp(diff * 3, -1, 1);
  let thr = 1;
  const agg = 0.75 + G.wanted * 0.07;
  if (Math.abs(diff) > 1.2) thr = 0.35;
  if (!p.car && dist < 140) thr = dist < 90 ? -0.6 : 0.2;  // vor Fußgänger anhalten
  c.throttle = thr * agg;
  c.handbrake = Math.abs(diff) > 1.6 && vf > 150;
  // Festgefahren?
  if (Math.abs(vf) < 25 && c.throttle > 0.3) { ai.stuck += dt; if (ai.stuck > 1.0) { ai.reverse = 0.9; ai.stuck = 0; } }
  else ai.stuck = Math.max(0, ai.stuck - dt);

  // Polizisten aussteigen lassen
  if (!p.car && dist < 220 && Math.abs(vf) < 40 && !ai.deployed && G.cops.length < 2 + G.wanted * 2) {
    ai.deployed = true;
    const s = Math.sin(c.angle), co = Math.cos(c.angle);
    for (let k = 0; k < (G.wanted >= 3 ? 2 : 1); k++) spawnCop(c.x - s * (24 + k * 8) + co * k * 12, c.y + co * (24 + k * 8) + s * k * 12);
  }
  if (p.car) ai.deployed = false;
}

// ------------------------------------------------------------
//  Fußgänger
// ------------------------------------------------------------
const SHIRTS = ['#c0392b', '#2c3e50', '#27ae60', '#8e44ad', '#e67e22', '#16a085', '#7f8c8d', '#f1c40f', '#34495e', '#d35400', '#1a1a1a', '#ecf0f1'];
const SKINS = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673a'];
const HAIR = ['#2b1d0e', '#4a3121', '#090806', '#b89778', '#6a4e42', '#d6c4a0', '#7a2e1a'];

function spawnPed(x, y) {
  if (G.peds.length > 70) return null;
  const p = { kind: 'ped', x, y, vx: 0, vy: 0, angle: rand() * 6.28, shirt: pick(SHIRTS), skin: pick(SKINS), hair: pick(HAIR),
    tx: x, ty: y, dir: (rand() * 4) | 0, down: 0, flee: 0, walk: rand() * 10, speed: 38 + rand() * 22, lastTile: -1 };
  G.peds.push(p);
  return p;
}

function spawnCop(x, y) {
  const r = collideCircle(x, y, 7, false);
  if (r) { x += r.px; y += r.py; }
  const c = { kind: 'cop', x, y, vx: 0, vy: 0, angle: 0, shirt: '#1f3a6b', skin: pick(SKINS), hair: '#14213d', down: 0, walk: 0, speed: 128 + G.wanted * 6, cop: true };
  G.cops.push(c);
  return c;
}

function walkable(tx, ty) { return isWalkTile(tileAt(tx, ty)); }

function updatePed(p, dt) {
  p.walk += dt;
  if (p.down > 0) {
    p.down -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= Math.pow(0.03, dt); p.vy *= Math.pow(0.03, dt);
    const r = collideCircle(p.x, p.y, 6, false); if (r) { p.x += r.px; p.y += r.py; p.vx *= -0.3; p.vy *= -0.3; }
    if (p.down <= 0) { p.flee = 5; snapPedTarget(p); }
    return;
  }
  const pl = G.player, pq = pl.car || pl;
  // Gefahr erkennen
  if (pl.car && carSpeed(pl.car) > 160) {
    const d = Math.hypot(pq.x - p.x, pq.y - p.y);
    if (d < 110) p.flee = Math.max(p.flee, 2);
  }
  let spd = p.speed;
  if (p.flee > 0) {
    p.flee -= dt;
    spd = 110;
    // weg vom Spieler
    const ax = p.x - pq.x, ay = p.y - pq.y, d = Math.hypot(ax, ay) || 1;
    const goal = { x: p.x + ax / d * 40, y: p.y + ay / d * 40 };
    moveToward(p, goal.x, goal.y, spd, dt);
    const r = collideCircle(p.x, p.y, 6, false); if (r) { p.x += r.px; p.y += r.py; }
    if (p.flee <= 0) snapPedTarget(p);
    return;
  }
  // Gehweg-Navigation
  const dxT = p.tx - p.x, dyT = p.ty - p.y;
  if (dxT * dxT + dyT * dyT < 16) {
    const cx = Math.floor(p.x / T), cy = Math.floor(p.y / T);
    const opts = [];
    for (let n = 0; n < 4; n++) {
      if (n === (p.dir + 2) % 4) continue;
      if (walkable(cx + DX[n], cy + DY[n])) opts.push(n, ...(n === p.dir ? [n, n, n] : []));
    }
    if (!opts.length) { if (walkable(cx + DX[(p.dir + 2) % 4], cy + DY[(p.dir + 2) % 4])) opts.push((p.dir + 2) % 4); }
    if (opts.length) {
      p.dir = pick(opts);
      const off = p.offset ?? (p.offset = (rand() - 0.5) * 18);
      p.tx = (cx + DX[p.dir]) * T + T / 2 + (DY[p.dir] ? off : 0);
      p.ty = (cy + DY[p.dir]) * T + T / 2 + (DX[p.dir] ? off : 0);
    }
  }
  moveToward(p, p.tx, p.ty, spd, dt);
}

function snapPedTarget(p) {
  const cx = Math.floor(p.x / T), cy = Math.floor(p.y / T);
  if (walkable(cx, cy)) { p.tx = cx * T + T / 2; p.ty = cy * T + T / 2; return; }
  for (let r = 1; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (walkable(cx + dx, cy + dy)) { p.tx = (cx + dx) * T + T / 2; p.ty = (cy + dy) * T + T / 2; return; }
  }
}

function moveToward(p, gx, gy, spd, dt) {
  const dx = gx - p.x, dy = gy - p.y, d = Math.hypot(dx, dy);
  if (d < 0.5) return;
  const s = Math.min(spd * dt, d);
  p.x += dx / d * s; p.y += dy / d * s;
  p.angle = Math.atan2(dy, dx);
  p.moving = true;
}

function updateCop(c, dt) {
  c.walk += dt;
  if (c.down > 0) {
    c.down -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= Math.pow(0.03, dt); c.vy *= Math.pow(0.03, dt);
    const r = collideCircle(c.x, c.y, 6, false); if (r) { c.x += r.px; c.y += r.py; }
    return;
  }
  const p = G.player;
  if (G.wanted === 0) { // nach Hause gehen
    c.leave = (c.leave || 0) + dt;
    return;
  }
  const tgt = p.car || p;
  let gx = tgt.x, gy = tgt.y;
  if (!lineOfSight(c.x, c.y, tgt.x, tgt.y)) { const f = flowTarget(c.x, c.y, 2); if (f) { gx = f.x; gy = f.y; } }
  // Wieder in den Streifenwagen, wenn der Spieler wegfährt
  if (p.car && carSpeed(p.car) > 120 && c.fromCar && !c.fromCar.wreck && Math.hypot(c.fromCar.x - c.x, c.fromCar.y - c.y) < 200) {
    gx = c.fromCar.x; gy = c.fromCar.y;
    if (Math.hypot(gx - c.x, gy - c.y) < 30 && !c.fromCar.driver) {
      c.fromCar.driver = 'police'; c.fromCar.ai = { stuck: 0, reverse: 0, deployed: false }; c.remove = true; return;
    }
  }
  moveToward(c, gx, gy, c.speed, dt);
  const r = collideCircle(c.x, c.y, 7, true); if (r) { c.x += r.px; c.y += r.py; }
}

function knockPed(p, vx, vy) {
  if (p.down > 0) { p.vx += vx * 0.3; p.vy += vy * 0.3; return; }
  p.down = 3 + rand() * 2; p.vx = vx; p.vy = vy;
  for (let i = 0; i < 4; i++) G.particles.push({ x: p.x, y: p.y, vx: (rand() - 0.5) * 80, vy: (rand() - 0.5) * 80, life: 0.6, max: 0.6, c: '#fff', s: 2, type: 'spark' });
}

// ------------------------------------------------------------
//  Spieler
// ------------------------------------------------------------
function makePlayer() {
  const s = World.pois.start;
  return { kind: 'player', x: s.x, y: s.y, vx: 0, vy: 0, angle: -Math.PI / 2, hp: 100, money: 500, car: null, walk: 0,
    down: 0, dead: false, shirt: '#151515', skin: '#e9be97', hair: '#c4202a', moving: false };
}

function updatePlayerOnFoot(dt) {
  const p = G.player;
  p.walk += dt;
  if (p.down > 0) {
    p.down -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.02, dt); p.vy *= Math.pow(0.02, dt);
    const r = collideCircle(p.x, p.y, 7, true); if (r) { p.x += r.px; p.y += r.py; }
    return;
  }
  let ix = 0, iy = 0;
  if (keys.ArrowLeft || keys.KeyA) ix -= 1; if (keys.ArrowRight || keys.KeyD) ix += 1;
  if (keys.ArrowUp || keys.KeyW) iy -= 1; if (keys.ArrowDown || keys.KeyS) iy += 1;
  if (touch.active) { ix = touch.jx; iy = touch.jy; }
  const len = Math.hypot(ix, iy);
  const sprint = keys.ShiftLeft || keys.ShiftRight || (touch.active && len > 0.9);
  const boost = G.boostT > 0 ? 1.4 : 1;
  const spd = (sprint ? 165 : 95) * boost;
  if (len > 0.1) {
    const n = Math.min(1, len);
    p.vx = ix / len * spd * n; p.vy = iy / len * spd * n;
    p.angle = Math.atan2(iy, ix); p.moving = true;
  } else { p.vx = 0; p.vy = 0; p.moving = false; }
  p.x += p.vx * dt; p.y += p.vy * dt;
  const r = collideCircle(p.x, p.y, 7, true); if (r) { p.x += r.px; p.y += r.py; }
  // Autos schieben den Spieler
  for (const c of G.cars) {
    const dx = p.x - c.x, dy = p.y - c.y;
    if (dx * dx + dy * dy > 60 * 60) continue;
    const cs = Math.cos(c.angle), sn = Math.sin(c.angle);
    const lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
    const hl = c.model.len / 2 + 7, hw = c.model.wid / 2 + 7;
    if (Math.abs(lx) < hl && Math.abs(ly) < hw) {
      const spd2 = carSpeed(c);
      if (spd2 > 90 && !c.wreck) {
        hurtPlayer(spd2 * 0.09, 'Unfall');
        p.down = 1.2; p.vx = c.vx * 0.7; p.vy = c.vy * 0.7;
        Sound.crash(spd2 * 0.6);
        if (c.driver === 'ai' && c.ai) c.ai.ignore = 0;
      }
      const px = hl - Math.abs(lx), py = hw - Math.abs(ly);
      if (px < py) { const s = Math.sign(lx) * px; p.x += cs * s; p.y += sn * s; }
      else { const s = Math.sign(ly) * py; p.x += -sn * s; p.y += cs * s; }
    }
  }
}

function updatePlayerDriving(dt) {
  const c = G.player.car;
  let ix = 0, iy = 0;
  const up = keys.ArrowUp || keys.KeyW, down = keys.ArrowDown || keys.KeyS;
  const left = keys.ArrowLeft || keys.KeyA, right = keys.ArrowRight || keys.KeyD;
  c.handbrake = !!(keys.Space || touch.brake);
  if (touch.active && (Math.abs(touch.jx) > 0.15 || Math.abs(touch.jy) > 0.15)) {
    // Absolute Lenkung per Joystick
    const want = Math.atan2(touch.jy, touch.jx);
    const mag = Math.min(1, Math.hypot(touch.jx, touch.jy));
    const vf = carForward(c);
    let diff = angDiff(c.angle, want);
    if (Math.abs(diff) > 2.3 && vf < 60) { // rückwärts
      c.throttle = -mag; c.steer = clamp(-angDiff(c.angle + Math.PI, want) * 2, -1, 1);
    } else {
      c.steer = clamp(diff * 2.2, -1, 1);
      c.throttle = mag * (Math.abs(diff) > 1.5 ? 0.4 : 1);
    }
  } else {
    c.throttle = (up ? 1 : 0) - (down ? 1 : 0);
    if (touch.gas) c.throttle = 1;
    ix = (right ? 1 : 0) - (left ? 1 : 0);
    c.steer = lerp(c.steer, ix, Math.min(1, dt * 12));
  }
  G.player.x = c.x; G.player.y = c.y;
}

function hurtPlayer(d, why) {
  const p = G.player;
  if (p.dead) return;
  p.hp -= d;
  flashDamage();
  if (p.hp <= 0) { p.hp = 0; wasted(); }
}

function tryEnterExit() {
  const p = G.player;
  if (p.dead || G.state !== 'play') return;
  if (p.car) { exitCar(false); return; }
  if (p.down > 0) return;
  let best = null, bd = 60;
  for (const c of G.cars) {
    if (c.wreck || c.burning > 0) continue;
    const d = Math.hypot(c.x - p.x, c.y - p.y) - c.model.len * 0.3;
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return;
  if (carSpeed(best) > 90) return;
  if (best.driver === 'ai' || best.driver === 'police') {
    const wasCop = best.driver === 'police';
    ejectDriver(best);
    crime(wasCop ? 'copcar' : 'jack');
  } else if (best.police) crime('copcar');
  best.driver = 'player'; best.ai = null; best.siren = false;
  p.car = best;
  Sound.init();
  Sound.beep(220, 0.08, 'square', 0.08);
  if (best.model.key === 'taxi' && !G.mission) toast('Taxi! Fahrgäste warten – folge der gelben Markierung.', 4);
  else toast(best.model.name, 1.5);
}

function exitCar(force) {
  const p = G.player, c = p.car;
  if (!c) return;
  if (!force && carSpeed(c) > 140) return;
  const s = Math.sin(c.angle), co = Math.cos(c.angle);
  const tries = [[-s, co], [s, -co], [co, s], [-co, -s]];
  let ok = false;
  for (const [ox, oy] of tries) {
    const d = c.model.wid / 2 + 12;
    const x = c.x + ox * d, y = c.y + oy * d;
    if (!collideCircle(x, y, 7, true)) { p.x = x; p.y = y; ok = true; break; }
  }
  if (!ok && !force) return;
  if (!ok) { p.x = c.x; p.y = c.y; }
  c.driver = null; c.throttle = 0; c.steer = 0; c.handbrake = true;
  p.car = null; p.vx = c.vx * 0.3; p.vy = c.vy * 0.3;
  if (G.taxi) endTaxi('Taxi-Job beendet.');
}

// ------------------------------------------------------------
//  Fahndung
// ------------------------------------------------------------
function policeNear(r) {
  const q = G.player.car || G.player;
  for (const c of G.cars) if (c.police && c.driver === 'police' && Math.hypot(c.x - q.x, c.y - q.y) < r) return true;
  for (const c of G.cops) if (Math.hypot(c.x - q.x, c.y - q.y) < r) return true;
  return false;
}
function setWanted(n) {
  n = clamp(n, 0, 5);
  if (n > G.wanted) { G.evadeT = 0; flashStars(); }
  G.wanted = n;
}
function bumpWanted(cap) {
  if (G.wantedCool > 0) return;
  if (G.wanted < cap) { setWanted(G.wanted + 1); G.wantedCool = 4; }
}
function crime(kind) {
  const near = policeNear(650);
  switch (kind) {
    case 'ped': if (G.wanted === 0) { if (near || rand() < 0.3) setWanted(1); } else bumpWanted(3); break;
    case 'jack': if (G.wanted === 0 && (near || rand() < 0.2)) setWanted(1); break;
    case 'crash': if (near && G.wanted === 0 && rand() < 0.3) setWanted(1); break;
    case 'copcar': setWanted(Math.max(G.wanted, 2)); bumpWanted(5); break;
    case 'cophit': if (G.wanted === 0) setWanted(1); else bumpWanted(5); break;
    case 'copped': bumpWanted(5); break;
  }
}

function updateWanted(dt) {
  if (G.wantedCool > 0) G.wantedCool -= dt;
  const p = G.player, q = p.car || p;
  if (G.wanted > 0) {
    const seen = policeNear(520);
    if (seen) G.evadeT = 0; else G.evadeT += dt;
    if (G.evadeT > 7 + G.wanted * 2.5) { G.wanted--; G.evadeT = 0; if (G.wanted === 0) toast('Polizei abgehängt!', 2.5); }
    // Festnahme
    let busting = false;
    if (p.car) {
      if (carSpeed(p.car) < 35) for (const c of G.cars) if (c.police && c.driver === 'police' && Math.hypot(c.x - q.x, c.y - q.y) < 75) busting = true;
    } else {
      for (const c of G.cops) if (c.down <= 0 && Math.hypot(c.x - p.x, c.y - p.y) < 20) busting = true;
    }
    if (busting) { G.bustT += dt; if (G.bustT > (p.car ? 2.6 : 1.1)) busted(); }
    else G.bustT = Math.max(0, G.bustT - dt * 2);
    // Flussfeld
    G.flowT -= dt;
    if (G.flowT <= 0) { computeFlow(); G.flowT = 0.45; }
  } else { G.bustT = 0; }
}

// ------------------------------------------------------------
//  Spawning
// ------------------------------------------------------------
function viewRect(margin) {
  const z = G.cam.z, hw = VW / 2 / z + margin, hh = VH / 2 / z + margin;
  return { x0: G.cam.x - hw, x1: G.cam.x + hw, y0: G.cam.y - hh, y1: G.cam.y + hh };
}
function inView(x, y, m) { const v = viewRect(m); return x > v.x0 && x < v.x1 && y > v.y0 && y < v.y1; }

function randomRoadSpot(minD, maxD) {
  const q = G.player.car || G.player;
  for (let k = 0; k < 30; k++) {
    const a = rand() * Math.PI * 2, d = minD + rand() * (maxD - minD);
    const tx = Math.floor((q.x + Math.cos(a) * d) / T), ty = Math.floor((q.y + Math.sin(a) * d) / T);
    const t = tileAt(tx, ty);
    if (!isRoadTile(t)) continue;
    const v = isRoadLine(tx), h = isRoadLine(ty);
    if (v && h) continue;
    let dir, base, x, y;
    if (h) { dir = ty % 12 === 1 ? 0 : 2; base = ty - ty % 12; x = tx * T + T / 2; y = laneCenter(dir, base); }
    else { dir = tx % 12 === 1 ? 3 : 1; base = tx - tx % 12; y = ty * T + T / 2; x = laneCenter(dir, base); }
    if (inView(x, y, 60)) continue;
    let clear = true;
    for (const c of G.cars) if (Math.abs(c.x - x) < 70 && Math.abs(c.y - y) < 70) { clear = false; break; }
    if (!clear) continue;
    return { x, y, dir, base, angle: Math.atan2(DY[dir], DX[dir]) };
  }
  return null;
}

function spawnTraffic() {
  const s = randomRoadSpot(650, 1150);
  if (!s) return;
  const r = rand();
  const key = r < 0.5 ? 'kompakt' : r < 0.62 ? 'taxi' : r < 0.74 ? 'trabi' : r < 0.85 ? 'transporter' : r < 0.9 ? 'sport' : r < 0.95 ? 'polizei' : 'bus';
  const c = makeCar(key, s.x, s.y, s.angle);
  c.driver = c.police && G.wanted > 0 ? 'police' : 'ai';
  if (c.driver === 'police') c.ai = { stuck: 0, reverse: 0 };
  else c.ai = { dir: s.dir, base: s.base, plan: null, cruise: 120 + rand() * 50 + (key === 'sport' ? 40 : 0) - (key === 'bus' ? 30 : 0), wait: 0, ignore: 0, honk: 0 };
  const sp = c.driver === 'ai' ? c.ai.cruise * 0.8 : 100;
  c.vx = Math.cos(s.angle) * sp; c.vy = Math.sin(s.angle) * sp;
}

function spawnPoliceCar() {
  const s = randomRoadSpot(700, 1100);
  if (!s) return;
  const c = makeCar('polizei', s.x, s.y, s.angle);
  c.driver = 'police'; c.ai = { stuck: 0, reverse: 0 };
  c.vx = Math.cos(s.angle) * 150; c.vy = Math.sin(s.angle) * 150;
}

function spawnParked() {
  const q = G.player.car || G.player;
  for (let k = 0; k < 12; k++) {
    const a = rand() * Math.PI * 2, d = 500 + rand() * 600;
    const tx = Math.floor((q.x + Math.cos(a) * d) / T), ty = Math.floor((q.y + Math.sin(a) * d) / T);
    if (tileAt(tx, ty) !== PARKING) continue;
    const x = tx * T + T / 2, y = ty * T + T / 2;
    if (inView(x, y, 40)) continue;
    let clear = true;
    for (const c of G.cars) if (Math.abs(c.x - x) < 50 && Math.abs(c.y - y) < 50) { clear = false; break; }
    if (!clear) continue;
    const key = pick(['kompakt', 'kompakt', 'trabi', 'transporter', 'taxi', 'sport']);
    makeCar(key, x, y, (rand() < 0.5 ? 0.5 : 1.5) * Math.PI + (rand() < 0.5 ? 0 : Math.PI)).parked = true;
    return;
  }
}

function spawnPedNear() {
  const q = G.player.car || G.player;
  for (let k = 0; k < 10; k++) {
    const a = rand() * Math.PI * 2, d = 450 + rand() * 600;
    const tx = Math.floor((q.x + Math.cos(a) * d) / T), ty = Math.floor((q.y + Math.sin(a) * d) / T);
    const t = tileAt(tx, ty);
    if (t !== SIDEWALK && t !== PLAZA && t !== PARK) continue;
    const x = tx * T + T / 2, y = ty * T + T / 2;
    if (inView(x, y, 30)) continue;
    spawnPed(x, y);
    return;
  }
}

function populate(dt) {
  const q = G.player.car || G.player;
  // Entfernen
  G.cars = G.cars.filter(c => {
    if (c.driver === 'player' || c.mission) return true;
    const d = Math.hypot(c.x - q.x, c.y - q.y);
    if (c === G.player.lastCar && d < 2500) return true;
    if (d > 1600 && !inView(c.x, c.y, 100)) return false;
    if (c.driver === 'police' && G.wanted === 0 && d > 900 && !inView(c.x, c.y, 50)) return false;
    return true;
  });
  G.peds = G.peds.filter(p => Math.hypot(p.x - q.x, p.y - q.y) < 1400 || inView(p.x, p.y, 50));
  G.cops = G.cops.filter(c => !c.remove && !(G.wanted === 0 && (c.leave > 4 || !inView(c.x, c.y, 50))) && Math.hypot(c.x - q.x, c.y - q.y) < 1500);

  const traffic = G.cars.filter(c => c.driver === 'ai').length;
  const parked = G.cars.filter(c => c.parked && !c.driver).length;
  const police = G.cars.filter(c => c.driver === 'police').length;
  if (traffic < 34 && rand() < 0.5) spawnTraffic();
  if (parked < 14 && rand() < 0.2) spawnParked();
  if (G.peds.length < 55 && rand() < 0.6) spawnPedNear();
  const wantPolice = [0, 1, 2, 4, 6, 8][G.wanted];
  if (police < wantPolice && rand() < 0.04 + G.wanted * 0.02) spawnPoliceCar();

  // Streifenwagen im Verkehr schalten bei Fahndung um
  if (G.wanted > 0) for (const c of G.cars) {
    if (c.police && c.driver === 'ai' && Math.hypot(c.x - q.x, c.y - q.y) < 800) { c.driver = 'police'; c.ai = { stuck: 0, reverse: 0 }; }
  } else for (const c of G.cars) {
    if (c.driver === 'police') { c.siren = false; c.ai = { dir: 0, base: 0, plan: null, cruise: 110, wait: 0, ignore: 0, honk: 0 }; c.driver = 'ai'; reorientAI(c); }
  }
}

// ------------------------------------------------------------
//  Partikel
// ------------------------------------------------------------
function sparks(x, y, n) { for (let i = 0; i < n; i++) G.particles.push({ x, y, vx: (rand() - 0.5) * 300, vy: (rand() - 0.5) * 300, life: 0.4, max: 0.4, c: '#ffd36b', s: 2, type: 'spark' }); }
function smoke(x, y, c) { G.particles.push({ x, y, vx: (rand() - 0.5) * 20, vy: (rand() - 0.5) * 20, life: 1.6, max: 1.6, c, s: 6 + rand() * 6, type: 'smoke' }); }
function fire(x, y, big) { G.particles.push({ x, y, vx: (rand() - 0.5) * (big ? 260 : 30), vy: (rand() - 0.5) * (big ? 260 : 30), life: big ? 0.8 : 0.5, max: big ? 0.8 : 0.5, c: rand() < 0.5 ? '#ff9a1f' : '#ffd23f', s: big ? 10 + rand() * 12 : 5 + rand() * 5, type: 'fire' }); }
function addSkid(c) {
  const cs = Math.cos(c.angle), sn = Math.sin(c.angle), m = c.model;
  const bx = c.x - cs * m.len * 0.35, by = c.y - sn * m.len * 0.35;
  const w = m.wid * 0.38;
  const L = { x: bx - sn * w, y: by + cs * w }, R = { x: bx + sn * w, y: by - cs * w };
  if (c.lastSkid) {
    G.skids.push([c.lastSkid.L.x, c.lastSkid.L.y, L.x, L.y], [c.lastSkid.R.x, c.lastSkid.R.y, R.x, R.y]);
    if (G.skids.length > 900) G.skids.splice(0, 2);
  }
  c.lastSkid = { L, R };
  if (rand() < 0.3) smoke(bx, by, 'rgba(220,220,220,0.5)');
}
function updateParticles(dt) {
  for (const p of G.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.2, dt); p.vy *= Math.pow(0.2, dt); if (p.type === 'smoke') p.s += dt * 10; }
  G.particles = G.particles.filter(p => p.life > 0);
  if (G.particles.length > 600) G.particles.splice(0, G.particles.length - 600);
}

// ------------------------------------------------------------
//  Missionen
// ------------------------------------------------------------
const MISSIONS = [
  { name: 'Willkommen in Berlin', giver: null, reward: 250, steps: [
    { say: 'Deniz (Handy): „Ey, willkommen in Berlin, Cousin! Schnapp dir ’ne Karre und komm zu mir an den Späti in Kreuzberg.“', t: 6 },
    { type: 'car', text: 'Steig in ein Auto (E)' },
    { type: 'goto', poi: 'spaeti', text: 'Fahr zum Späti in Kreuzberg', r: 70 },
  ], done: 'Deniz: „Da biste ja! Komm wieder vorbei, ich hab Arbeit für dich.“' },

  { name: 'Döner-Express', giver: 'spaeti', reward: 500, steps: [
    { say: 'Deniz: „Ein Kunde am Fernsehturm will 20 Döner. Hol sie beim Imbiss in Neukölln – und dann zack, bevor sie kalt sind!“', t: 6 },
    { type: 'car', text: 'Steig in ein Auto (E)' },
    { type: 'goto', poi: 'imbiss', text: 'Hol die Döner beim Imbiss in Neukölln', r: 70 },
    { say: 'Imbiss: „20 Döner mit alles, scharf! Gib Gas!“', t: 3, timer: 75 },
    { type: 'goto', poi: 'turm', text: 'Liefere die Döner zum Fernsehturm', r: 80 },
  ], done: 'Kunde: „Noch warm! Respekt.“' },

  { name: 'Sightseeing-Raserei', giver: 'spaeti', reward: 800, steps: [
    { say: 'Deniz: „Mein Kumpel macht Stadtführungen. Die Touris haben nur 3 Minuten – zeig ihnen alles!“', t: 6 },
    { type: 'car', text: 'Steig in ein Auto (E)' },
    { say: 'Los! Die Uhr läuft.', t: 2, timer: 170 },
    { type: 'goto', poi: 'tor', text: 'Checkpoint 1/5: Brandenburger Tor', r: 90 },
    { type: 'goto', poi: 'reichstag', text: 'Checkpoint 2/5: Reichstag', r: 90 },
    { type: 'goto', poi: 'dom', text: 'Checkpoint 3/5: Berliner Dom', r: 90 },
    { type: 'goto', poi: 'turm', text: 'Checkpoint 4/5: Fernsehturm', r: 90 },
    { type: 'goto', poi: 'esg', text: 'Checkpoint 5/5: East Side Gallery', r: 100 },
  ], done: 'Touristen: „Wunderbar! Aber uns ist schlecht.“' },

  { name: 'Heißer Ofen', giver: 'werkstatt', reward: 1200, steps: [
    { say: 'Kemal (Werkstatt): „Am Potsdamer Platz steht ein roter Sportwagen. Hol ihn mir. Die Bullen werden das merken.“', t: 6 },
    { type: 'getcar', poi: 'potsdamer', text: 'Klau den roten Sportwagen am Potsdamer Platz' },
    { type: 'wanted', n: 2 },
    { type: 'goto', poi: 'werkstatt', text: 'Bring den Sportwagen zu Kemals Werkstatt', r: 80, needMissionCar: true },
  ], done: 'Kemal: „Sauber. Den lackier ich um, keiner merkt was.“', clearWanted: true },

  { name: 'Der Koffer', giver: 'werkstatt', reward: 3000, steps: [
    { say: 'Kemal: „Letzter Job, ein großer. Am Checkpoint Charlie wartet ein Koffer. Bring ihn zum alten Flughafen Tempelhof.“', t: 6 },
    { type: 'goto', poi: 'checkpoint', text: 'Hol den Koffer am Checkpoint Charlie', r: 60 },
    { say: 'Alarm! Die Polizei hat dich gesehen!', t: 3 },
    { type: 'wanted', n: 3 },
    { type: 'lose', text: 'Hänge die Polizei ab' },
    { type: 'goto', poi: 'tempelhof', text: 'Bring den Koffer zum Tempelhofer Feld', r: 110 },
  ], done: 'Glückwunsch! Du bist jetzt der König vom Kiez. Berlin gehört dir.' },
];

function currentGiverPoi() {
  if (G.mission || G.missionIdx >= MISSIONS.length) return null;
  const m = MISSIONS[G.missionIdx];
  return m.giver ? m.giver : null;
}

function startMission(idx) {
  G.mission = MISSIONS[idx]; G.missionStep = 0; G.missionTimer = 0; G.missionData = {};
  if (G.taxi) endTaxi('');
  bigMsg(G.mission.name, 'Mission ' + (idx + 1));
  Sound.success();
  enterStep();
}

function enterStep() {
  const s = G.mission.steps[G.missionStep];
  if (!s) { completeMission(); return; }
  G.stepT = 0;
  if (s.say) { toast(s.say, s.t || 4); if (s.timer) G.missionTimer = s.timer; }
  if (s.type === 'getcar') {
    const p = World.pois[s.poi];
    const c = makeCar('sport', p.x, p.y, 0, '#d4202c');
    c.mission = true;
    G.missionData.car = c;
  }
  if (s.type === 'wanted') { setWanted(Math.max(G.wanted, s.n)); nextStep(); }
}

function nextStep() { G.missionStep++; enterStep(); }

function updateMission(dt) {
  if (!G.mission) {
    // Auftraggeber-Marker
    const gp = currentGiverPoi();
    if (gp) {
      const p = World.pois[gp], q = G.player.car || G.player;
      if (Math.hypot(p.x - q.x, p.y - q.y) < 55 && (!G.player.car || carSpeed(G.player.car) < 60)) startMission(G.missionIdx);
    }
    return;
  }
  const s = G.mission.steps[G.missionStep];
  if (!s) return;
  G.stepT += dt;
  if (G.missionTimer > 0) {
    G.missionTimer -= dt;
    if (G.missionTimer <= 0) { failMission('Zeit abgelaufen!'); return; }
  }
  const p = G.player, q = p.car || p;
  if (G.missionData.car && G.missionData.car.wreck) { failMission('Der Sportwagen ist Schrott!'); return; }
  if (s.say && !s.type) { if (G.stepT > Math.min(s.t || 3, 2.5)) nextStep(); return; }
  switch (s.type) {
    case 'car': if (p.car) nextStep(); break;
    case 'getcar': if (p.car === G.missionData.car) nextStep(); break;
    case 'lose': if (G.wanted === 0) nextStep(); break;
    case 'goto': {
      const t = World.pois[s.poi];
      if (s.needMissionCar && p.car !== G.missionData.car) break;
      if (Math.hypot(t.x - q.x, t.y - q.y) < (s.r || 60)) { Sound.coin(); nextStep(); }
      break;
    }
  }
}

function completeMission() {
  const m = G.mission;
  G.player.money += m.reward;
  if (m.clearWanted) setWanted(0);
  if (G.missionData.car) { G.missionData.car.mission = false; }
  G.mission = null; G.missionTimer = 0;
  G.missionIdx++;
  bigMsg('Mission erfüllt!', '+' + m.reward + ' €');
  Sound.success();
  toast(m.done, 6);
  save();
}

function failMission(why) {
  if (!G.mission) return;
  if (G.missionData.car) { G.missionData.car.mission = false; }
  G.mission = null; G.missionTimer = 0;
  bigMsg('Mission gescheitert', why);
  Sound.fail();
}

// Taxi-Nebenjob
function updateTaxi(dt) {
  const p = G.player;
  if (G.mission) return;
  if (!p.car || p.car.model.key !== 'taxi') return;
  if (!G.taxi) {
    // Fahrgast suchen
    const spot = findWalkSpot(p.car.x, p.car.y, 350, 900);
    if (spot) G.taxi = { stage: 'pickup', x: spot.x, y: spot.y, ped: spawnPed(spot.x, spot.y), fares: (G.taxi && G.taxi.fares) || 0 };
    if (G.taxi && G.taxi.ped) { G.taxi.ped.taxi = true; G.taxi.ped.shirt = '#f5c400'; }
    return;
  }
  const tx = G.taxi;
  if (tx.ped && tx.stage === 'pickup') { tx.ped.x = tx.x; tx.ped.y = tx.y; tx.ped.tx = tx.x; tx.ped.ty = tx.y; }
  const d = Math.hypot(tx.x - p.car.x, tx.y - p.car.y);
  if (tx.stage === 'pickup') {
    if (d < 70 && carSpeed(p.car) < 50) {
      G.peds = G.peds.filter(o => o !== tx.ped);
      const dest = findWalkSpot(p.car.x, p.car.y, 1300, 2800);
      if (!dest) return;
      const dist = Math.hypot(dest.x - p.car.x, dest.y - p.car.y);
      tx.stage = 'drive'; tx.x = dest.x; tx.y = dest.y; tx.time = dist / 120 + 20; tx.pay = Math.round(25 + dist / 30);
      toast('Fahrgast: „Nach ' + districtAt(Math.floor(dest.x / T), Math.floor(dest.y / T)) + ', bitte. Und zackig!“', 3.5);
      Sound.beep(660, 0.1);
    }
  } else if (tx.stage === 'drive') {
    tx.time -= dt;
    if (tx.time <= 0) { toast('Fahrgast: „Zu langsam! Ich steig aus.“', 3); G.taxi = { fares: tx.fares }; G.taxi = null; return; }
    if (d < 75 && carSpeed(p.car) < 50) {
      const tip = Math.round(tx.time * 1.5);
      p.money += tx.pay + tip;
      Sound.coin();
      toast('Fahrpreis ' + tx.pay + ' € + ' + tip + ' € Trinkgeld', 3);
      spawnPed(tx.x, tx.y);
      G.taxi = null;
    }
  }
}
function endTaxi(msg) {
  if (G.taxi && G.taxi.ped) G.peds = G.peds.filter(o => o !== G.taxi.ped);
  G.taxi = null;
  if (msg) toast(msg, 2);
}
function findWalkSpot(x, y, minD, maxD) {
  for (let k = 0; k < 60; k++) {
    const a = rand() * Math.PI * 2, d = minD + rand() * (maxD - minD);
    const tx = Math.floor((x + Math.cos(a) * d) / T), ty = Math.floor((y + Math.sin(a) * d) / T);
    if (tileAt(tx, ty) !== SIDEWALK) continue;
    let nearRoad = false;
    for (let n = 0; n < 4; n++) if (isRoadTile(tileAt(tx + DX[n], ty + DY[n]))) nearRoad = true;
    if (!nearRoad) continue;
    return { x: tx * T + T / 2, y: ty * T + T / 2 };
  }
  return null;
}

// Lackiererei
function updateSprayShops() {
  const p = G.player;
  if (!p.car) return;
  for (const k of ['lack1', 'lack2']) {
    const s = World.pois[k];
    if (Math.hypot(s.x - p.car.x, s.y - p.car.y) < 50 && carSpeed(p.car) < 80) {
      if (G.sprayCool > 0) return;
      G.sprayCool = 6;
      const cost = G.wanted > 0 ? 250 : 100;
      if (p.money < cost) { toast('Lackiererei: „' + cost + ' € – haste nich? Dann raus!“', 3); return; }
      p.money -= cost;
      p.car.hp = p.car.model.hp; p.car.burning = 0;
      p.car.color = pick(['#1f6f8b', '#99a3a4', '#3c8d2f', '#6c3483', '#e2e2e2', '#b03a2e', '#f39c12', '#212121']);
      if (G.wanted > 0) { setWanted(0); toast('Neu lackiert & repariert! Fahndung aufgehoben. (−' + cost + ' €)', 3.5); }
      else toast('Repariert & neu lackiert. (−' + cost + ' €)', 3);
      Sound.coin();
    }
  }
}

// ------------------------------------------------------------
//  Tod / Festnahme
// ------------------------------------------------------------
function wasted() {
  const p = G.player;
  if (p.dead) return;
  p.dead = true;
  failMission('Du bist schwer verletzt.');
  bigMsg('Ab in die Charité!', 'Behandlung: −' + Math.min(p.money, 200) + ' €', true);
  Sound.fail();
  setTimeout(() => respawn('klinik', 200), 3200);
}
function busted() {
  const p = G.player;
  if (p.dead) return;
  p.dead = true;
  failMission('Festgenommen.');
  const fine = Math.min(p.money, Math.round(150 + G.wanted * 120));
  bigMsg('Festgenommen!', 'Kaution: −' + fine + ' €', true);
  Sound.fail();
  setTimeout(() => respawn('polizei', fine), 3200);
}
function respawn(poi, cost) {
  const p = G.player;
  if (p.car) { p.car.driver = null; p.car = null; }
  p.money = Math.max(0, p.money - cost);
  const s = World.pois[poi];
  p.x = s.x; p.y = s.y; p.hp = 100; p.dead = false; p.down = 0; p.vx = p.vy = 0;
  G.wanted = 0; G.evadeT = 0; G.bustT = 0;
  G.cops = [];
  G.cars = G.cars.filter(c => c.driver !== 'police');
  G.cam.x = p.x; G.cam.y = p.y;
  save();
}

// ------------------------------------------------------------
//  Speichern
// ------------------------------------------------------------
function save() {
  try { localStorage.setItem('kiezkings-save', JSON.stringify({ m: G.missionIdx, money: G.player.money })); } catch (e) { }
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('kiezkings-save') || 'null');
    if (s) { G.missionIdx = s.m | 0; G.player.money = Math.max(0, Number(s.money) || 0); return true; }
  } catch (e) { }
  return false;
}

// ------------------------------------------------------------
//  Kamera & Effekte
// ------------------------------------------------------------
let shakeAmt = 0;
function shake(a) { shakeAmt = Math.min(18, shakeAmt + a); }

function updateCamera(dt) {
  const p = G.player, q = p.car || p;
  const vx = q.vx || 0, vy = q.vy || 0;
  const tx = q.x + vx * 0.45, ty = q.y + vy * 0.45;
  G.cam.x = lerp(G.cam.x, tx, Math.min(1, dt * 3.5));
  G.cam.y = lerp(G.cam.y, ty, Math.min(1, dt * 3.5));
  const base = clamp(Math.min(VW, VH) / 760, 0.62, 1.25);
  const spd = p.car ? carSpeed(p.car) : 0;
  const tz = base * (1 - clamp(spd / 500, 0, 1) * 0.25);
  G.cam.z = lerp(G.cam.z, tz, Math.min(1, dt * 1.5));
  shakeAmt *= Math.pow(0.02, dt);
}

// ------------------------------------------------------------
//  Hauptschleife
// ------------------------------------------------------------
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.05);
  if (G.state === 'play') update(dt);
  else if (G.state === 'title') { G.cam.x += dt * 25; G.clock += dt * 0.02; }
  render();
  updateHUD(dt);
  requestAnimationFrame(frame);
}

function update(dt) {
  G.time += dt;
  G.clock = (G.clock + dt * (24 / 480)) % 24; // 8 Minuten pro Tag
  if (G.sprayCool > 0) G.sprayCool -= dt;
  if (G.boostT > 0) G.boostT -= dt;
  updateShops();
  const p = G.player;
  if (!p.dead) {
    if (p.car) updatePlayerDriving(dt); else updatePlayerOnFoot(dt);
  } else if (p.car) { p.car.throttle = 0; p.car.steer = 0; }

  for (const c of G.cars) {
    if (c.driver === 'ai' && c.ai) updateTrafficAI(c, dt);
    else if (c.driver === 'police' && c.ai) updatePoliceAI(c, dt);
    else if (c.driver !== 'player') { c.throttle = 0; c.steer = 0; c.handbrake = carSpeed(c) < 30; }
    updateCarPhysics(c, dt);
  }
  carCollisions();
  if (p.car) { p.x = p.car.x; p.y = p.car.y; p.vx = p.car.vx; p.vy = p.car.vy; p.car.angle = p.car.angle; G.player.lastCar = p.car; }

  for (const pd of G.peds) updatePed(pd, dt);
  for (const c of G.cops) updateCop(c, dt);
  pedCarHits();
  updateParticles(dt);
  updateWanted(dt);
  updateMission(dt);
  updateTaxi(dt);
  updateSprayShops();
  populate(dt);
  updateCamera(dt);

  // Sound
  const nearestPolice = G.cars.reduce((m, c) => c.siren && c.driver === 'police' ? Math.min(m, distToPlayer(c)) : m, 1e9);
  const sv = nearestPolice < 1000 ? 1 - nearestPolice / 1000 : 0;
  Sound.update(dt, !!p.car, p.car ? carSpeed(p.car) : 0, p.car ? p.car.throttle : 0, sv);
}

function pedCarHits() {
  const all = G.peds.concat(G.cops);
  for (const c of G.cars) {
    const sp = carSpeed(c);
    const cs = Math.cos(c.angle), sn = Math.sin(c.angle);
    for (const p of all) {
      const dx = p.x - c.x, dy = p.y - c.y;
      if (dx * dx + dy * dy > 3600) continue;
      const lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
      const hl = c.model.len / 2 + 6, hw = c.model.wid / 2 + 6;
      if (Math.abs(lx) < hl && Math.abs(ly) < hw) {
        if (sp > 70 && p.down <= 0) {
          knockPed(p, c.vx * 0.8 + (rand() - 0.5) * 60, c.vy * 0.8 + (rand() - 0.5) * 60);
          c.vx *= 0.92; c.vy *= 0.92;
          if (c.driver === 'player' && Math.abs(c.throttle) > 0.2) { crime(p.cop ? 'copped' : 'ped'); Sound.crash(120); }
        } else {
          const px = hl - Math.abs(lx), py = hw - Math.abs(ly);
          if (px < py) { const s = Math.sign(lx) * px; p.x += cs * s; p.y += sn * s; }
          else { const s = Math.sign(ly) * py; p.x += -sn * s; p.y += cs * s; }
        }
      }
    }
  }
}

// ------------------------------------------------------------
//  Eingabe
// ------------------------------------------------------------
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  Sound.init();
  if (G.state === 'title') { if (e.code === 'Enter' || e.code === 'Space') startGame(); return; }
  if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Enter') tryEnterExit();
  if (e.code === 'KeyM') { Sound.setMuted(!Sound.muted); toast(Sound.muted ? 'Ton aus' : 'Ton an', 1.2); }
  if (e.code === 'KeyH' && G.player.car) Sound.horn();
  if (e.code === 'KeyK' || e.code === 'Tab') toggleMap();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

function togglePause() {
  if (G.state === 'shop') { closeShop(); return; }
  if (G.state === 'play') { G.state = 'pause'; document.getElementById('pause').hidden = false; }
  else if (G.state === 'pause') { G.state = 'play'; document.getElementById('pause').hidden = true; last = performance.now(); }
}
function toggleMap() { G.showMap = !G.showMap; document.getElementById('bigmap').hidden = !G.showMap; if (G.showMap) drawBigMap(); }

// Touch-Steuerung
function setupTouch() {
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const tc = document.getElementById('touch');
  if (!isTouch) return;
  tc.hidden = false;
  const joy = document.getElementById('joy'), knob = document.getElementById('knob');
  let jid = null, cx = 0, cy = 0;
  const R = 50;
  joy.addEventListener('pointerdown', e => {
    jid = e.pointerId; joy.setPointerCapture(e.pointerId);
    const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    move(e); Sound.init();
  });
  const move = e => {
    if (e.pointerId !== jid) return;
    let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touch.jx = dx / R; touch.jy = dy / R; touch.active = true;
  };
  joy.addEventListener('pointermove', move);
  const end = e => { if (e.pointerId !== jid) return; jid = null; knob.style.transform = ''; touch.jx = 0; touch.jy = 0; };
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  const btn = (id, down, up) => {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', e => { e.preventDefault(); touch.active = true; Sound.init(); down(); });
    if (up) { el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up); }
  };
  btn('b-enter', () => tryEnterExit());
  btn('b-brake', () => { touch.brake = true; }, () => { touch.brake = false; });
  btn('b-map', () => toggleMap());
  btn('b-horn', () => { if (G.player.car) Sound.horn(); });
}

// ------------------------------------------------------------
//  Start
// ------------------------------------------------------------
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  canvas.width = Math.round(VW * DPR); canvas.height = Math.round(VH * DPR);
  canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
  resizeLight();
}
window.addEventListener('resize', resize);

function startGame() {
  if (G.state !== 'title') return;
  Sound.init();
  document.getElementById('title').hidden = true;
  document.getElementById('hud').hidden = false;
  G.state = 'play';
  const p = G.player;
  G.cam.x = p.x; G.cam.y = p.y;
  last = performance.now();
  if (G.missionIdx === 0) startMission(0);
  else toast('Willkommen zurück! Gelbes M auf der Karte = nächste Mission.', 4);
}

function init() {
  generateWorld();
  buildMiniMap();
  G.player = makePlayer();
  const resumed = load();
  // Ein Trabi wartet am Hauptbahnhof
  const st = World.pois.start;
  makeCar('trabi', st.x - 2.2 * T, st.y, 0, '#8fb8a8').parked = true;
  makeCar('taxi', st.x + 2.6 * T, st.y, Math.PI).parked = true;
  G.cam.x = st.x; G.cam.y = st.y;
  resize();
  setupTouch();
  for (let i = 0; i < 40; i++) populate(0.1);
  document.getElementById('btn-start').addEventListener('click', startGame);
  if (resumed && G.missionIdx > 0) document.getElementById('btn-start').textContent = 'Weiterspielen';
  document.getElementById('btn-resume').addEventListener('click', togglePause);
  document.getElementById('btn-reset').addEventListener('click', () => {
    try { localStorage.removeItem('kiezkings-save'); } catch (e) { }
    location.reload();
  });
  document.getElementById('bigmap').addEventListener('click', toggleMap);
  document.getElementById('btn-shop-close').addEventListener('click', closeShop);
  requestAnimationFrame(t => { last = t; frame(t); });
}

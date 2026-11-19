'use strict';
// ============================================================
//  KIEZ KINGS – Berlin  |  Grafik & HUD
// ============================================================

// ---------- Boden in Chunks vorrendern ----------
const CHUNK = 16; // Kacheln
const chunkCache = new Map();
let chunkOrder = [];

function noiseAt(x, y, s) { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); }

function drawGroundTile(g, x, y, t) {
  const px = x * T, py = y * T;
  switch (t) {
    case ROAD: case BRIDGE: {
      g.fillStyle = t === BRIDGE ? '#4a4c50' : '#3a3c41'; g.fillRect(px, py, T, T);
      // Asphalt-Körnung
      g.fillStyle = 'rgba(255,255,255,0.025)';
      for (let i = 0; i < 6; i++) g.fillRect(px + noiseAt(x, y, i) * T, py + noiseAt(y, x, i) * T, 2, 2);
      const v = isRoadLine(x), h = isRoadLine(y);
      g.fillStyle = '#e8e4d8';
      if (v && !h && x % 12 === 0) { for (let k = 0; k < 2; k++) g.fillRect(px + T - 1.5, py + 4 + k * 20, 3, 10); }
      if (h && !v && y % 12 === 0) { for (let k = 0; k < 2; k++) g.fillRect(px + 4 + k * 20, py + T - 1.5, 10, 3); }
      // Zebrastreifen vor Kreuzungen
      if (v && !h && (y % 12 === 2 || y % 12 === 11) && isRoadLine(y % 12 === 2 ? y - 2 : y + 1)) {
        g.fillStyle = 'rgba(240,238,230,0.85)';
        for (let k = 0; k < 5; k++) g.fillRect(px + 2 + k * 8, py + 6, 4, T - 12);
      }
      if (h && !v && (x % 12 === 2 || x % 12 === 11)) {
        g.fillStyle = 'rgba(240,238,230,0.85)';
        for (let k = 0; k < 5; k++) g.fillRect(px + 6, py + 2 + k * 8, T - 12, 4);
      }
      if (t === BRIDGE) {
        g.fillStyle = '#8a8478';
        if (tileAt(x, y - 1) === WATER) g.fillRect(px, py, T, 4);
        if (tileAt(x, y + 1) === WATER) g.fillRect(px, py + T - 4, T, 4);
        if (tileAt(x - 1, y) === WATER) g.fillRect(px, py, 4, T);
        if (tileAt(x + 1, y) === WATER) g.fillRect(px + T - 4, py, 4, T);
      }
      break;
    }
    case SIDEWALK: case WALL: {
      g.fillStyle = '#8f8b84'; g.fillRect(px, py, T, T);
      // Berliner Gehweg: Granitplatten in der Mitte, Kleinpflaster am Rand
      g.fillStyle = '#a19d95';
      g.fillRect(px + 8, py + 8, T - 16, T - 16);
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
      g.strokeRect(px + 8.5, py + 8.5, T - 17, T - 17);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let i = 0; i < 10; i++) g.fillRect(px + noiseAt(x, y, i) * T, py + noiseAt(y, x, i + 3) * T, 2, 2);
      // Bordstein
      g.fillStyle = '#c9c5bc';
      if (isRoadTile(tileAt(x, y - 1))) g.fillRect(px, py, T, 3);
      if (isRoadTile(tileAt(x, y + 1))) g.fillRect(px, py + T - 3, T, 3);
      if (isRoadTile(tileAt(x - 1, y))) g.fillRect(px, py, 3, T);
      if (isRoadTile(tileAt(x + 1, y))) g.fillRect(px + T - 3, py, 3, T);
      if (tileAt(x, y + 1) === WATER || tileAt(x, y - 1) === WATER || tileAt(x - 1, y) === WATER || tileAt(x + 1, y) === WATER) {
        g.fillStyle = '#6d6a63';
        if (tileAt(x, y + 1) === WATER) g.fillRect(px, py + T - 4, T, 4);
        if (tileAt(x, y - 1) === WATER) g.fillRect(px, py, T, 4);
        if (tileAt(x - 1, y) === WATER) g.fillRect(px, py, 4, T);
        if (tileAt(x + 1, y) === WATER) g.fillRect(px + T - 4, py, 4, T);
      }
      break;
    }
    case WATER: {
      g.fillStyle = '#2d5f78'; g.fillRect(px, py, T, T);
      g.strokeStyle = 'rgba(180,220,240,0.18)'; g.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        const wx = px + noiseAt(x, y, i) * 26, wy = py + 8 + i * 18 + noiseAt(y, x, i) * 6;
        g.beginPath(); g.moveTo(wx, wy); g.quadraticCurveTo(wx + 6, wy - 3, wx + 12, wy); g.stroke();
      }
      break;
    }
    case PARK: case GRASS: {
      g.fillStyle = '#4c7d3a'; g.fillRect(px, py, T, T);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = noiseAt(x, y, i) > 0.5 ? 'rgba(120,170,80,0.35)' : 'rgba(30,60,20,0.25)';
        g.fillRect(px + noiseAt(x, y, i + 9) * T, py + noiseAt(y, x, i + 4) * T, 3, 3);
      }
      break;
    }
    case FIELD: {
      g.fillStyle = '#87a35a'; g.fillRect(px, py, T, T);
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(60,90,30,0.25)'; g.fillRect(px + noiseAt(x, y, i) * T, py + noiseAt(y, x, i) * T, 3, 2); }
      break;
    }
    case RUNWAY: {
      g.fillStyle = '#5a5d61'; g.fillRect(px, py, T, T);
      if (y === 117 || y === 125) { g.fillStyle = '#eee'; if (x % 3 === 0) g.fillRect(px + 4, py + T - 2, 24, 4); }
      break;
    }
    case PLAZA: case SOLID: {
      g.fillStyle = '#b3a993'; g.fillRect(px, py, T, T);
      g.strokeStyle = 'rgba(80,70,50,0.15)'; g.lineWidth = 1;
      g.strokeRect(px + 0.5, py + 0.5, 20, 20); g.strokeRect(px + 20.5, py + 20.5, 20, 20);
      break;
    }
    case PARKING: {
      g.fillStyle = '#55575b'; g.fillRect(px, py, T, T);
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(px, py, 2, T * 0.7);
      break;
    }
    case BUILDING: default: {
      g.fillStyle = '#2c2c30'; g.fillRect(px, py, T, T);
    }
  }
}

function getChunk(cx, cy) {
  const key = cx + ',' + cy;
  let c = chunkCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = CHUNK * T; c.height = CHUNK * T;
  const g = c.getContext('2d');
  g.translate(-cx * CHUNK * T, -cy * CHUNK * T);
  for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y++) for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
    if (x >= MW || y >= MH) { g.fillStyle = '#1b3644'; g.fillRect(x * T, y * T, T, T); continue; }
    drawGroundTile(g, x, y, tileAt(x, y));
  }
  // Schilder (U-/S-Bahn)
  for (const s of World.signs) {
    if (Math.floor(s.x / T / CHUNK) !== cx || Math.floor(s.y / T / CHUNK) !== cy) continue;
    g.fillStyle = s.t === 'U' ? '#1d4fa0' : '#0b8a3e';
    if (s.t === 'U') g.fillRect(s.x - 7, s.y - 7, 14, 14);
    else { g.beginPath(); g.arc(s.x, s.y, 8, 0, 6.29); g.fill(); }
    g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(s.t, s.x, s.y + 1);
  }
  chunkCache.set(key, c);
  chunkOrder.push(key);
  if (chunkOrder.length > 36) { const k = chunkOrder.shift(); chunkCache.delete(k); }
  return c;
}

// ---------- Licht-Ebene ----------
const light = document.createElement('canvas');
const lctx = light.getContext('2d');
function resizeLight() { light.width = Math.max(1, Math.ceil(VW / 2)); light.height = Math.max(1, Math.ceil(VH / 2)); }

function darkness() {
  const h = G.clock;
  // 0 = Tag, 1 = tiefste Nacht
  if (h >= 7 && h < 18.5) return 0;
  if (h >= 18.5 && h < 21) return (h - 18.5) / 2.5;
  if (h >= 21 || h < 5) return 1;
  return 1 - (h - 5) / 2; // 5..7
}

// ---------- Projektion (Pseudo-3D) ----------
let CX = 0, CY = 0;
const projX = (x, z) => x + (x - CX) * z;
const projY = (y, z) => y + (y - CY) * z;

function shade(hex, f) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  const n = parseInt(c, 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  if (f < 1) { r *= f; gg *= f; b *= f; } else { r += (255 - r) * (f - 1); gg += (255 - gg) * (f - 1); b += (255 - b) * (f - 1); }
  return 'rgb(' + (r | 0) + ',' + (gg | 0) + ',' + (b | 0) + ')';
}

// Box zwischen Höhen z0 und z1 zeichnen
function drawBox(g, x0, y0, x1, y1, z0, z1, wall, roof, floors) {
  const sides = [];
  if (CY > y1) sides.push([x0, y1, x1, y1, 0.78]);
  if (CY < y0) sides.push([x0, y0, x1, y0, 0.92]);
  if (CX < x0) sides.push([x0, y0, x0, y1, 0.84]);
  if (CX > x1) sides.push([x1, y0, x1, y1, 0.7]);
  for (const [ax, ay, bx, by, f] of sides) {
    g.fillStyle = shade(wall, f);
    g.beginPath();
    g.moveTo(projX(ax, z0), projY(ay, z0)); g.lineTo(projX(bx, z0), projY(by, z0));
    g.lineTo(projX(bx, z1), projY(by, z1)); g.lineTo(projX(ax, z1), projY(ay, z1));
    g.closePath(); g.fill();
    if (floors > 1) {
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.2;
      g.beginPath();
      for (let k = 1; k < floors; k++) {
        const z = lerp(z0, z1, k / floors);
        g.moveTo(projX(ax, z), projY(ay, z)); g.lineTo(projX(bx, z), projY(by, z));
      }
      g.stroke();
    }
  }
  if (roof) { g.fillStyle = roof; g.fillRect(projX(x0, z1), projY(y0, z1), projX(x1, z1) - projX(x0, z1), projY(y1, z1) - projY(y0, z1)); }
}

// In Dach-Koordinaten zeichnen
function roofSpace(g, z, fn) {
  g.save();
  g.translate(CX, CY); g.scale(1 + z, 1 + z); g.translate(-CX, -CY);
  fn();
  g.restore();
}

function drawBuilding(g, b) {
  if (b.landmark === 'tor') return drawTor(g, b);
  if (b.landmark === 'turm') return drawTurm(g, b);
  if (b.landmark === 'saeule') return drawSaeule(g, b);
  if (b.landmark === 'checkpoint') return drawCheckpoint(g, b);
  const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h, z = b.z;
  const floors = b.kind === 'platte' ? 10 : b.kind === 'glass' ? 14 : b.kind === 'mural' ? 1 : Math.round(z * 40);
  drawBox(g, x0, y0, x1, y1, 0, z, b.wall, b.roof, floors);
  roofSpace(g, z, () => roofDetails(g, b));
}

function roofDetails(g, b) {
  const x0 = b.x, y0 = b.y, w = b.w, h = b.h;
  const s = b.seed || 1;
  switch (b.kind) {
    case 'altbau': {
      // Satteldach mit First
      const horiz = w >= h;
      g.fillStyle = 'rgba(0,0,0,0.16)';
      if (horiz) g.fillRect(x0, y0 + h / 2, w, h / 2); else g.fillRect(x0 + w / 2, y0, w / 2, h);
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
      g.beginPath();
      if (horiz) { g.moveTo(x0 + 4, y0 + h / 2); g.lineTo(x0 + w - 4, y0 + h / 2); }
      else { g.moveTo(x0 + w / 2, y0 + 4); g.lineTo(x0 + w / 2, y0 + h - 4); }
      g.stroke();
      // Schornsteine
      g.fillStyle = '#5b3a2e';
      const n = 1 + (s % 3);
      for (let i = 0; i < n; i++) {
        const cx = x0 + 8 + noiseAt(s, i, 1) * (w - 16), cy = y0 + 8 + noiseAt(i, s, 2) * (h - 16);
        g.fillRect(cx - 4, cy - 4, 8, 8);
      }
      // Dachfenster
      g.fillStyle = 'rgba(160,200,230,0.5)';
      if (noiseAt(s, 3, 3) > 0.4) g.fillRect(x0 + w * 0.3, y0 + (horiz ? h * 0.2 : h * 0.3), 8, 6);
      break;
    }
    case 'platte': {
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
      for (let x = x0 + 20; x < x0 + w; x += 20) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + h); g.stroke(); }
      g.fillStyle = '#6f7479';
      g.fillRect(x0 + w / 2 - 8, y0 + h / 2 - 6, 16, 12);
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x0 + 2, y0 + 2, w - 4, 2);
      break;
    }
    case 'modern': case 'glass': {
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2; g.strokeRect(x0 + 3, y0 + 3, w - 6, h - 6);
      g.fillStyle = 'rgba(0,0,0,0.2)';
      for (let i = 0; i < 3; i++) { const ax = x0 + 8 + noiseAt(s, i, 5) * (w - 24), ay = y0 + 8 + noiseAt(i, s, 6) * (h - 24); g.fillRect(ax, ay, 12, 10); }
      if (b.kind === 'glass') {
        g.fillStyle = 'rgba(200,230,255,0.25)';
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + w * 0.6, y0); g.lineTo(x0, y0 + h * 0.6); g.fill();
      }
      if (w * h > 6 * T * T && noiseAt(s, 9, 9) > 0.6) { // Solaranlage
        g.fillStyle = '#26354d';
        for (let i = 0; i < 3; i++) g.fillRect(x0 + 10 + i * 14, y0 + h - 26, 10, 16);
      }
      break;
    }
    case 'mural': {
      g.fillStyle = b.wall; g.fillRect(x0, y0 + 14, w, 12);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x0 + noiseAt(s, 1, 1) * 30, y0 + 16, 8, 8);
      break;
    }
    case 'reichstag': {
      g.fillStyle = '#c4b694';
      for (const [cx, cy] of [[x0, y0], [x0 + w - 40, y0], [x0, y0 + h - 40], [x0 + w - 40, y0 + h - 40]]) g.fillRect(cx, cy, 40, 40);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x0 + 50, y0 + 50, w - 100, h - 100);
      // Glaskuppel
      const gx = x0 + w / 2, gy = y0 + h / 2;
      const grd = g.createRadialGradient(gx - 10, gy - 10, 4, gx, gy, 46);
      grd.addColorStop(0, '#e9f6ff'); grd.addColorStop(1, '#7fa6bf');
      g.fillStyle = grd; g.beginPath(); g.arc(gx, gy, 44, 0, 6.29); g.fill();
      g.strokeStyle = 'rgba(40,60,80,0.5)'; g.lineWidth = 1.5;
      for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + Math.cos(a) * 44, gy + Math.sin(a) * 44); g.stroke(); }
      g.beginPath(); g.arc(gx, gy, 28, 0, 6.29); g.stroke();
      // Flaggen
      g.fillStyle = '#111'; g.fillRect(x0 + w / 2 - 70, y0 + 6, 18, 4);
      g.fillStyle = '#d00'; g.fillRect(x0 + w / 2 - 70, y0 + 10, 18, 4);
      g.fillStyle = '#fc0'; g.fillRect(x0 + w / 2 - 70, y0 + 14, 18, 4);
      break;
    }
    case 'dom': {
      const gx = x0 + w / 2, gy = y0 + h / 2;
      g.fillStyle = '#4f8f7a';
      for (const [cx, cy] of [[x0 + 24, y0 + 24], [x0 + w - 24, y0 + 24], [x0 + 24, y0 + h - 24], [x0 + w - 24, y0 + h - 24]]) { g.beginPath(); g.arc(cx, cy, 16, 0, 6.29); g.fill(); }
      const grd = g.createRadialGradient(gx - 16, gy - 16, 6, gx, gy, 70);
      grd.addColorStop(0, '#9fd8bf'); grd.addColorStop(1, '#2f6b58');
      g.fillStyle = grd; g.beginPath(); g.arc(gx, gy, 64, 0, 6.29); g.fill();
      g.fillStyle = '#d7b450'; g.beginPath(); g.arc(gx, gy, 9, 0, 6.29); g.fill();
      break;
    }
    case 'hbf': {
      g.strokeStyle = 'rgba(40,70,90,0.45)'; g.lineWidth = 1.5;
      for (let x = x0 + 12; x < x0 + w; x += 12) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + h); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0, y0 + h / 2 - 3, w, 6);
      roofLabel(g, 'HAUPTBAHNHOF', x0 + w / 2, y0 + h / 2 + 22, '#1c3a52', 16);
      break;
    }
    case 'klinik': {
      g.fillStyle = '#c62828';
      const cx = x0 + w / 2, cy = y0 + h / 2;
      g.fillRect(cx - 30, cy - 9, 60, 18); g.fillRect(cx - 9, cy - 30, 18, 60);
      roofLabel(g, 'CHARITÉ', cx, y0 + h - 14, '#444', 14);
      break;
    }
    case 'schloss': {
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x0, y0 + h / 2, w, h / 2);
      const gx = x0 + w / 2, gy = y0 + h / 2;
      g.fillStyle = '#5c9a82'; g.beginPath(); g.arc(gx, gy, 30, 0, 6.29); g.fill();
      g.fillStyle = '#d7b450'; g.beginPath(); g.arc(gx, gy, 6, 0, 6.29); g.fill();
      break;
    }
    case 'flughafen': {
      g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 2;
      for (let x = x0 + 40; x < x0 + w; x += 40) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + h); g.stroke(); }
      roofLabel(g, 'FLUGHAFEN TEMPELHOF', x0 + w / 2, y0 + h / 2, '#3c3628', 26);
      break;
    }
    case 'polizei': {
      roofLabel(g, 'POLIZEI', x0 + b.w / 2, y0 + b.h / 2, '#fff', 22);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x0 + 26, y0 + 26, 10, 0, 6.29); g.fill();
      g.fillStyle = '#2b6a3f'; g.beginPath(); g.arc(x0 + 26, y0 + 26, 6, 0, 6.29); g.fill();
      break;
    }
    case 'lack': {
      roofLabel(g, 'LACKIEREREI', x0 + w / 2, y0 + h / 2 - 8, '#f5c400', 17);
      roofLabel(g, '24 h', x0 + w / 2, y0 + h / 2 + 14, '#fff', 14);
      break;
    }
    case 'lidl': {
      const cx = x0 + w / 2, cy = y0 + h / 2;
      g.fillStyle = '#ffe500'; g.beginPath(); g.arc(cx, cy, 34, 0, 6.29); g.fill();
      g.strokeStyle = '#e60a14'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 34, 0, 6.29); g.stroke();
      roofLabel(g, 'LIDL', cx, cy + 1, '#0a4fa6', 26);
      break;
    }
    case 'werkstatt': {
      roofLabel(g, 'KFZ KEMAL', x0 + w / 2, y0 + h / 2, '#f5c400', 18);
      break;
    }
  }
}

function roofLabel(g, txt, x, y, col, size) {
  g.fillStyle = col; g.font = '800 ' + size + 'px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y);
}

function drawTor(g, b) {
  // Sechs dorische Säulenpaare, Attika, Quadriga
  const x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.h;
  const cols = 6;
  const stone = '#d8c9a3';
  for (let i = 0; i < cols; i++) {
    const cy = lerp(y0 + 10, y1 - 10, i / (cols - 1));
    const thick = i === 0 || i === cols - 1 ? 18 : 10;
    drawBox(g, x0 + 22, cy - thick / 2, x1 - 22, cy + thick / 2, 0, 0.1, stone, shade(stone, 1.05), 1);
  }
  drawBox(g, x0, y0, x1, y1, 0.1, 0.135, stone, '#cdbd95', 1);
  roofSpace(g, 0.135, () => {
    g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 2; g.strokeRect(x0 + 6, y0 + 6, b.w - 12, b.h - 12);
  });
  // Quadriga
  drawBox(g, x0 + 22, b.cy - 22, x1 - 22, b.cy + 22, 0.135, 0.165, '#3f7a64', '#4f9479', 1);
  roofSpace(g, 0.165, () => {
    g.fillStyle = '#2f5f4d';
    for (let i = 0; i < 4; i++) g.fillRect(b.cx - 14, b.cy - 18 + i * 10, 24, 6);
  });
}

function drawTurm(g, b) {
  const cx = b.cx, cy = b.cy;
  // Fuß
  drawBox(g, b.x - 20, b.y - 20, b.x + b.w + 20, b.y + b.h + 20, 0, 0.03, '#b7b2a8', '#cfcac0', 1);
  // Schaft
  const zS = 0.03, zK = 0.55, zA = 0.82;
  const sx0 = projX(cx, zS), sy0 = projY(cy, zS), sx1 = projX(cx, zK), sy1 = projY(cy, zK);
  g.lineCap = 'round';
  g.strokeStyle = '#a8a59d'; g.lineWidth = 26; g.beginPath(); g.moveTo(sx0, sy0); g.lineTo(sx1, sy1); g.stroke();
  g.strokeStyle = '#d3d0c8'; g.lineWidth = 10; g.beginPath(); g.moveTo(sx0 - 5, sy0 - 5); g.lineTo(sx1 - 5, sy1 - 5); g.stroke();
  // Kugel
  const kx = projX(cx, zK), ky = projY(cy, zK), kr = 48 * (1 + zK);
  const grd = g.createRadialGradient(kx - kr * 0.35, ky - kr * 0.35, kr * 0.1, kx, ky, kr);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, '#b9c1c8'); grd.addColorStop(1, '#5d666e');
  g.fillStyle = grd; g.beginPath(); g.arc(kx, ky, kr, 0, 6.29); g.fill();
  g.strokeStyle = 'rgba(40,50,60,0.35)'; g.lineWidth = 2;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(kx, ky, kr * (0.3 + i * 0.12), 0, 6.29); g.stroke(); }
  g.fillStyle = 'rgba(30,40,50,0.6)'; g.beginPath(); g.arc(kx, ky, kr, 0, 6.29); g.arc(kx, ky, kr * 0.86, 0, 6.29, true); g.fill();
  // Antenne
  const ax = projX(cx, zA), ay = projY(cy, zA);
  const k2x = projX(cx, zK + 0.06), k2y = projY(cy, zK + 0.06);
  g.lineWidth = 6;
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = i % 2 ? '#d11' : '#eee';
    g.beginPath(); g.moveTo(lerp(k2x, ax, i / 6), lerp(k2y, ay, i / 6)); g.lineTo(lerp(k2x, ax, (i + 1) / 6), lerp(k2y, ay, (i + 1) / 6)); g.stroke();
  }
  g.fillStyle = (Math.floor(G.time * 1.5) % 2) ? '#ff3b3b' : '#7a1010';
  g.beginPath(); g.arc(ax, ay, 4, 0, 6.29); g.fill();
}

function drawSaeule(g, b) {
  const cx = b.cx, cy = b.cy;
  drawBox(g, b.x - 4, b.y - 4, b.x + b.w + 4, b.y + b.h + 4, 0, 0.05, '#9b8e7a', '#b7a990', 1);
  const z1 = 0.4;
  g.lineCap = 'round';
  g.strokeStyle = '#c9b48a'; g.lineWidth = 14; g.beginPath(); g.moveTo(projX(cx, 0.05), projY(cy, 0.05)); g.lineTo(projX(cx, z1), projY(cy, z1)); g.stroke();
  g.fillStyle = '#e7c13a'; g.beginPath(); g.arc(projX(cx, z1), projY(cy, z1), 11, 0, 6.29); g.fill();
  g.fillStyle = '#fff1a8'; g.beginPath(); g.arc(projX(cx, z1) - 3, projY(cy, z1) - 3, 4, 0, 6.29); g.fill();
}

function drawCheckpoint(g, b) {
  // Sandsäcke
  g.fillStyle = '#c2ad7c';
  for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(b.x - 10 + i * 9, b.y + b.h + 6, 6, 4, 0, 0, 6.29); g.fill(); }
  drawBox(g, b.x + 4, b.y + 4, b.x + b.w - 4, b.y + b.h - 4, 0, 0.06, '#f2efe6', '#e8e4da', 1);
  // Schild
  const sx = projX(b.cx, 0.12), sy = projY(b.y - 18, 0.12);
  g.fillStyle = '#fff'; g.fillRect(sx - 40, sy - 9, 80, 18);
  g.fillStyle = '#111'; g.font = '700 9px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('US ARMY CHECKPOINT', sx, sy);
}

function drawTree(g, t) {
  const z = 0.045;
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.arc(t.x + 6, t.y + 6, t.r, 0, 6.29); g.fill();
  const x = projX(t.x, z), y = projY(t.y, z), r = t.r * (1 + z);
  const base = t.hue < 0.33 ? [56, 112, 48] : t.hue < 0.66 ? [70, 125, 52] : [45, 98, 50];
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
  g.fillStyle = `rgba(${base[0] + 40},${base[1] + 45},${base[2] + 25},0.8)`;
  g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.55, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.beginPath(); g.arc(x + r * 0.35, y + r * 0.3, r * 0.45, 0, 6.29); g.fill();
}

// ---------- Fahrzeuge & Figuren ----------
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

function drawCar(g, c) {
  const m = c.model, L = m.len, W = m.wid;
  g.save();
  g.translate(c.x, c.y);
  // Schatten
  g.save(); g.translate(4, 5); g.rotate(c.angle);
  g.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(g, -L / 2, -W / 2, L, W, 6); g.fill();
  g.restore();
  g.rotate(c.angle);
  const body = c.color;
  // Räder
  g.fillStyle = '#111';
  const wx = L * 0.3, wy = W / 2;
  for (const sx of [-wx, wx]) for (const sy of [-wy, wy - 4]) g.fillRect(sx - 5, sy, 10, 4);
  // Karosserie
  g.fillStyle = body; roundRect(g, -L / 2, -W / 2, L, W, m.key === 'trabi' ? 8 : 5); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.stroke();
  if (m.key === 'bus') {
    g.fillStyle = '#2b3138'; g.fillRect(L / 2 - 10, -W / 2 + 3, 7, W - 6);
    g.fillStyle = 'rgba(0,0,0,0.15)'; for (let i = 0; i < 5; i++) g.fillRect(-L / 2 + 8 + i * 14, -W / 2 + 5, 9, W - 10);
    g.fillStyle = '#d9a900'; g.fillRect(-L / 2 + 4, -2, L - 18, 4);
  } else if (m.key === 'transporter') {
    g.fillStyle = '#2b3138'; g.fillRect(L / 2 - 14, -W / 2 + 2, 8, W - 4);
    g.fillStyle = shade(body.length > 4 ? body : '#ffffff', 0.92); g.fillRect(-L / 2 + 3, -W / 2 + 3, L - 20, W - 6);
  } else {
    // Scheiben
    g.fillStyle = '#26303a';
    g.beginPath(); g.moveTo(L * 0.12, -W / 2 + 3); g.lineTo(L * 0.3, -W / 2 + 4); g.lineTo(L * 0.3, W / 2 - 4); g.lineTo(L * 0.12, W / 2 - 3); g.closePath(); g.fill();
    g.fillRect(-L * 0.36, -W / 2 + 4, L * 0.1, W - 8);
    // Dach
    g.fillStyle = m.key === 'trabi' ? '#f4f1e8' : shade(body.length > 4 ? body : '#888888', 1.08);
    g.fillRect(-L * 0.25, -W / 2 + 3, L * 0.36, W - 6);
  }
  if (m.key === 'sport') { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(-L / 2 + 1, -W / 2 + 2, 4, W - 4); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-L / 2 + 6, -2, L - 10, 4); }
  if (m.key === 'taxi') {
    g.fillStyle = '#f5c400'; g.fillRect(-5, -6, 10, 12);
    g.fillStyle = '#111'; g.font = 'bold 6px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.rotate(Math.PI / 2); g.fillText('TAXI', 0, 0); g.restore();
  }
  if (c.police) {
    g.fillStyle = '#1d4fa0'; g.fillRect(-L / 2 + 2, -W / 2, L - 4, 3); g.fillRect(-L / 2 + 2, W / 2 - 3, L - 4, 3);
    g.fillRect(L / 2 - 6, -W / 2 + 2, 4, W - 4);
    const on = c.siren && Math.floor(G.time * 8 + c.lightT) % 2 === 0;
    g.fillStyle = on ? '#3d8bff' : '#16346a'; g.fillRect(-4, -W / 2 + 3, 7, W / 2 - 3);
    g.fillStyle = !on && c.siren ? '#3d8bff' : '#16346a'; g.fillRect(-4, 0, 7, W / 2 - 3);
  }
  // Lichter
  g.fillStyle = '#fff6c8'; g.fillRect(L / 2 - 3, -W / 2 + 2, 3, 4); g.fillRect(L / 2 - 3, W / 2 - 6, 3, 4);
  const braking = c.throttle < -0.1 || c.handbrake;
  g.fillStyle = braking ? '#ff2a2a' : '#8a1010'; g.fillRect(-L / 2, -W / 2 + 2, 2, 4); g.fillRect(-L / 2, W / 2 - 6, 2, 4);
  if (c.wreck) { g.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(g, -L / 2, -W / 2, L, W, 5); g.fill(); }
  g.restore();
}

function drawPerson(g, p, isPlayer) {
  g.save();
  g.translate(p.x, p.y);
  if (p.down > 0) {
    g.rotate((p.angle || 0) + 1.2);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(2, 2, 11, 6, 0, 0, 6.29); g.fill();
    g.fillStyle = p.shirt; g.beginPath(); g.ellipse(0, 0, 9, 5.5, 0, 0, 6.29); g.fill();
    g.fillStyle = p.skin; g.beginPath(); g.arc(10, 0, 4, 0, 6.29); g.fill();
    g.restore();
    // Sternchen
    g.fillStyle = '#ffe66b';
    for (let i = 0; i < 3; i++) { const a = G.time * 4 + i * 2.1; g.beginPath(); g.arc(p.x + Math.cos(a) * 10, p.y - 10 + Math.sin(a) * 4, 1.8, 0, 6.29); g.fill(); }
    return;
  }
  g.rotate(p.angle || 0);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(3, 3, 7, 8, 0, 0, 6.29); g.fill();
  // Beine
  const moving = p.moving !== false;
  const sw = moving ? Math.sin(p.walk * 14) * 5 : 0;
  g.fillStyle = '#222'; g.fillRect(sw - 2, -5, 5, 3); g.fillRect(-sw - 2, 2, 5, 3);
  // Körper
  g.fillStyle = p.shirt; g.beginPath(); g.ellipse(0, 0, 5, 8, 0, 0, 6.29); g.fill();
  g.fillStyle = p.skin; g.beginPath(); g.arc(1, 0, 4.2, 0, 6.29); g.fill();
  g.fillStyle = p.hair; g.beginPath(); g.arc(0, 0, 4.2, Math.PI * 0.5, Math.PI * 1.5); g.fill();
  if (p.cop) { g.fillStyle = '#0f2347'; g.beginPath(); g.arc(0, 0, 4.6, 0, 6.29); g.fill(); g.fillStyle = '#f5c400'; g.fillRect(-1, -1, 2, 2); }
  if (isPlayer) {
    g.fillStyle = '#c4202a'; g.beginPath(); g.arc(0, 0, 4.4, Math.PI * 0.5, Math.PI * 1.5); g.fill(); g.fillRect(2, -3, 4, 6);
  }
  g.restore();
}

// ---------- Hauptrender ----------
let frameStamp = 0;
function render() {
  const z = G.cam.z;
  const sx = shakeAmt ? (rand() - 0.5) * shakeAmt : 0, sy = shakeAmt ? (rand() - 0.5) * shakeAmt : 0;
  const camX = G.cam.x + sx, camY = G.cam.y + sy;
  CX = camX; CY = camY;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1b3644'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (VW / 2 - camX * z), DPR * (VH / 2 - camY * z));
  const hw = VW / 2 / z, hh = VH / 2 / z;
  const vx0 = camX - hw, vx1 = camX + hw, vy0 = camY - hh, vy1 = camY + hh;

  // Boden
  ctx.imageSmoothingEnabled = true;
  const cs = CHUNK * T;
  for (let cy = Math.floor(vy0 / cs); cy <= Math.floor(vy1 / cs); cy++)
    for (let cx = Math.floor(vx0 / cs); cx <= Math.floor(vx1 / cs); cx++) {
      if (cx < 0 || cy < 0 || cx * CHUNK >= MW || cy * CHUNK >= MH) continue;
      ctx.drawImage(getChunk(cx, cy), cx * cs, cy * cs, cs + 0.5, cs + 0.5);
    }

  // Reifenspuren
  ctx.strokeStyle = 'rgba(20,20,20,0.45)'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const s of G.skids) { if (s[0] < vx0 - 50 || s[0] > vx1 + 50 || s[1] < vy0 - 50 || s[1] > vy1 + 50) continue; ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
  ctx.stroke();

  // Marker auf dem Boden
  drawMarkers(ctx);

  // Figuren
  for (const p of G.peds) if (p.x > vx0 - 20 && p.x < vx1 + 20 && p.y > vy0 - 20 && p.y < vy1 + 20) drawPerson(ctx, p, false);
  for (const p of G.cops) if (p.x > vx0 - 20 && p.x < vx1 + 20 && p.y > vy0 - 20 && p.y < vy1 + 20) drawPerson(ctx, p, false);
  const pl = G.player;
  if (pl && !pl.car && G.state !== 'title') drawPerson(ctx, pl, true);
  // Autos
  for (const c of G.cars) if (c.x > vx0 - 60 && c.x < vx1 + 60 && c.y > vy0 - 60 && c.y < vy1 + 60) drawCar(ctx, c);

  // Partikel unter Gebäuden (Feuer/Funken)
  for (const p of G.particles) {
    if (p.type === 'smoke') continue;
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.c;
    if (p.type === 'fire') { ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (p.life / p.max + 0.3), 0, 6.29); ctx.fill(); }
    else ctx.fillRect(p.x - 1, p.y - 1, p.s, p.s);
  }
  ctx.globalAlpha = 1;

  // Gebäude & Bäume (sortiert nach Entfernung zur Kamera)
  frameStamp++;
  const list = [];
  const m = 300;
  const gx0 = Math.max(0, Math.floor((vx0 - m) / T / CELL)), gx1 = Math.min(CW - 1, Math.floor((vx1 + m) / T / CELL));
  const gy0 = Math.max(0, Math.floor((vy0 - m) / T / CELL)), gy1 = Math.min(CHh - 1, Math.floor((vy1 + m) / T / CELL));
  for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) {
    for (const b of World.cells[y * CW + x]) {
      if (b._st === frameStamp) continue; b._st = frameStamp;
      const zz = b.landmark === 'turm' ? 0.9 : (b.z || 0.2);
      const rx0 = Math.min(b.x, projX(b.x, zz)), rx1 = Math.max(b.x + b.w, projX(b.x + b.w, zz));
      const ry0 = Math.min(b.y, projY(b.y, zz)), ry1 = Math.max(b.y + b.h, projY(b.y + b.h, zz));
      if (rx1 < vx0 - 80 || rx0 > vx1 + 80 || ry1 < vy0 - 80 || ry0 > vy1 + 80) continue;
      list.push({ o: b, d: (b.cx - CX) ** 2 + (b.cy - CY) ** 2 - (b.landmark === 'turm' ? 0 : 0), t: 0 });
    }
    for (const t of World.treeCells[y * CW + x]) {
      if (t.x < vx0 - 40 || t.x > vx1 + 40 || t.y < vy0 - 40 || t.y > vy1 + 40) continue;
      list.push({ o: t, d: (t.x - CX) ** 2 + (t.y - CY) ** 2, t: 1 });
    }
  }
  list.sort((a, b) => b.d - a.d);
  for (const it of list) { if (it.t) drawTree(ctx, it.o); else drawBuilding(ctx, it.o); }

  // Rauch über allem
  for (const p of G.particles) {
    if (p.type !== 'smoke') continue;
    ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.55;
    ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.29); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Schwebende Missionspfeile
  drawFloatingArrows(ctx);

  // Nacht
  const dk = darkness();
  if (dk > 0.01) drawNight(dk, camX, camY, z);
  // Blaulicht-Schein
  ctx.globalCompositeOperation = 'lighter';
  for (const c of G.cars) {
    if (!c.siren || c.driver !== 'police') continue;
    if (c.x < vx0 - 100 || c.x > vx1 + 100 || c.y < vy0 - 100 || c.y > vy1 + 100) continue;
    const on = Math.floor(G.time * 8 + c.lightT) % 2 === 0;
    const grd = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, 70);
    grd.addColorStop(0, on ? 'rgba(60,120,255,0.55)' : 'rgba(255,40,40,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd; ctx.fillRect(c.x - 70, c.y - 70, 140, 140);
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawNight(dk, camX, camY, z) {
  const lw = light.width, lh = light.height, s = 0.5 * z;
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, lw, lh);
  lctx.fillStyle = `rgba(6,10,32,${0.72 * dk})`;
  lctx.fillRect(0, 0, lw, lh);
  lctx.globalCompositeOperation = 'destination-out';
  lctx.setTransform(s, 0, 0, s, lw / 2 - camX * s, lh / 2 - camY * s);
  const hw = VW / 2 / z, hh = VH / 2 / z;
  const glow = (x, y, r, a) => {
    if (x < camX - hw - r || x > camX + hw + r || y < camY - hh - r || y > camY + hh + r) return;
    const grd = lctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(0,0,0,${a})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = grd; lctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (const l of World.lamps) glow(l.x, l.y, 95, 0.75);
  for (const c of G.cars) {
    if (c.wreck || (!c.driver && c !== G.player.car)) continue;
    const cs = Math.cos(c.angle), sn = Math.sin(c.angle);
    glow(c.x + cs * 70, c.y + sn * 70, 70, 0.85);
    glow(c.x + cs * 25, c.y + sn * 25, 30, 0.6);
  }
  for (const p of G.particles) if (p.type === 'fire') glow(p.x, p.y, 40, 0.5);
  const p = G.player;
  glow(p.x, p.y, 60, 0.4);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(light, 0, 0, canvas.width, canvas.height);
  // Warmes Laternenlicht
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (VW / 2 - camX * z), DPR * (VH / 2 - camY * z));
  ctx.globalCompositeOperation = 'lighter';
  for (const l of World.lamps) {
    if (l.x < camX - hw - 50 || l.x > camX + hw + 50 || l.y < camY - hh - 50 || l.y > camY + hh + 50) continue;
    const grd = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 60);
    grd.addColorStop(0, `rgba(255,190,90,${0.28 * dk})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd; ctx.fillRect(l.x - 60, l.y - 60, 120, 120);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- Marker ----------
function activeTargets() {
  const out = [];
  if (G.mission) {
    const s = G.mission.steps[G.missionStep];
    if (s && s.type === 'goto' && !(s.needMissionCar && G.player.car !== G.missionData.car)) out.push({ ...World.pois[s.poi], r: s.r || 60, col: '#f5c400' });
    if (s && (s.type === 'getcar' || (s.needMissionCar && G.player.car !== G.missionData.car)) && G.missionData.car) out.push({ x: G.missionData.car.x, y: G.missionData.car.y, r: 30, col: '#4fc3ff', car: true });
  } else {
    const gp = currentGiverPoi();
    if (gp) out.push({ ...World.pois[gp], r: 40, col: '#f5c400', giver: true });
  }
  if (G.taxi && G.taxi.stage) out.push({ x: G.taxi.x, y: G.taxi.y, r: 55, col: '#f5c400' });
  if (G.player.car) for (const k of ['lack1', 'lack2']) out.push({ ...World.pois[k], r: 40, col: '#ff7ad9', shop: true });
  for (const s of World.shops) out.push({ x: s.x, y: s.y, r: 26, col: '#3d8bff', shop: true, lidl: true });
  return out;
}

function drawMarkers(g) {
  for (const t of activeTargets()) {
    if (t.car) continue;
    const pulse = 1 + Math.sin(G.time * 4) * 0.08;
    g.fillStyle = t.col + '33'; g.strokeStyle = t.col; g.lineWidth = 3;
    g.beginPath(); g.arc(t.x, t.y, t.r * pulse, 0, 6.29); g.fill(); g.stroke();
    if (t.giver) { roofLabel(g, 'M', t.x, t.y + 1, t.col, 30); }
    if (t.shop) { roofLabel(g, t.lidl ? 'LIDL' : 'LACK', t.x, t.y + 1, t.lidl ? '#ffe500' : t.col, 14); }
  }
}

function drawFloatingArrows(g) {
  for (const t of activeTargets()) {
    if (t.shop) continue;
    const bob = Math.sin(G.time * 3) * 6;
    const x = t.x, y = t.y - (t.car ? 40 : 30) + bob;
    g.fillStyle = t.col; g.strokeStyle = '#111'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - 10, y - 14); g.lineTo(x + 10, y - 14); g.lineTo(x, y); g.closePath(); g.fill(); g.stroke();
  }
}

// ---------- Minikarte ----------
let mapImg = null;
const TILE_COL = {
  [ROAD]: '#55585e', [BRIDGE]: '#6a6c70', [SIDEWALK]: '#7d7a73', [BUILDING]: '#c7bfae', [WATER]: '#3e7fa0', [PARK]: '#5b9447',
  [PLAZA]: '#a59c88', [SOLID]: '#e2d6b0', [WALL]: '#e8463b', [FIELD]: '#8bb05e', [RUNWAY]: '#666666', [PARKING]: '#626468', [GRASS]: '#5b9447', [LOT]: '#c7bfae'
};
function buildMiniMap() {
  mapImg = document.createElement('canvas');
  mapImg.width = MW; mapImg.height = MH;
  const g = mapImg.getContext('2d');
  const id = g.createImageData(MW, MH);
  for (let i = 0; i < MW * MH; i++) {
    const c = TILE_COL[World.tiles[i]] || '#000';
    const n = parseInt(c.slice(1), 16);
    id.data[i * 4] = n >> 16; id.data[i * 4 + 1] = (n >> 8) & 255; id.data[i * 4 + 2] = n & 255; id.data[i * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
}

const mini = document.getElementById('mini');
const mctx = mini.getContext('2d');
function drawMini() {
  const size = mini.clientWidth || 160;
  if (mini.width !== size * DPR) { mini.width = size * DPR; mini.height = size * DPR; }
  const g = mctx;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = '#1b3644'; g.fillRect(0, 0, size, size);
  const p = G.player, q = p.car || p;
  const scale = 2.6; // px pro Kachel
  const ptx = q.x / T, pty = q.y / T;
  g.imageSmoothingEnabled = false;
  g.save();
  g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, 6.29); g.clip();
  g.drawImage(mapImg, size / 2 - ptx * scale, size / 2 - pty * scale, MW * scale, MH * scale);
  const toM = (x, y) => [size / 2 + (x / T - ptx) * scale, size / 2 + (y / T - pty) * scale];
  // Polizei
  for (const c of G.cars) if (c.driver === 'police' && c.siren) {
    const [mx, my] = toM(c.x, c.y);
    g.fillStyle = Math.floor(G.time * 6) % 2 ? '#3d8bff' : '#ff3b3b'; g.fillRect(mx - 2.5, my - 2.5, 5, 5);
  }
  g.restore();
  // Ziele (am Rand festgeklemmt)
  for (const t of activeTargets()) {
    let [mx, my] = toM(t.x, t.y);
    const dx = mx - size / 2, dy = my - size / 2, d = Math.hypot(dx, dy), R = size / 2 - 7;
    if (d > R) { mx = size / 2 + dx / d * R; my = size / 2 + dy / d * R; }
    g.fillStyle = t.col; g.strokeStyle = '#111'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(mx, my, t.shop ? 3 : 5, 0, 6.29); g.fill(); g.stroke();
    if (t.giver) { g.fillStyle = '#111'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', mx, my + 0.5); }
  }
  // Spieler-Pfeil
  const ang = p.car ? p.car.angle : p.angle;
  g.save(); g.translate(size / 2, size / 2); g.rotate(ang);
  g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
  g.restore();
  // Nordmarke
  g.fillStyle = '#f1ede4'; g.font = '700 10px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.fillText('N', size / 2, 10);
}

function drawBigMap() {
  const c = document.getElementById('bigmap-c');
  const box = c.parentElement.getBoundingClientRect();
  const pad = 24;
  const sc = Math.min((box.width - pad * 2) / MW, (box.height - pad * 2 - 40) / MH);
  const w = MW * sc, h = MH * sc;
  c.width = w * DPR; c.height = h * DPR; c.style.width = w + 'px'; c.style.height = h + 'px';
  const g = c.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(mapImg, 0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // Bezirke
  g.font = `700 ${Math.max(10, sc * 4)}px "Barlow Condensed", sans-serif`;
  for (const [n, x, y] of DISTRICTS) {
    g.fillStyle = 'rgba(20,24,30,0.55)'; g.fillText(n.toUpperCase(), x * sc + 1, y * sc + 1);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillText(n.toUpperCase(), x * sc, y * sc);
  }
  g.font = `600 ${Math.max(9, sc * 3)}px "Barlow Condensed", sans-serif`;
  for (const b of World.buildings) if (b.label && b.label !== 'Lackiererei') {
    g.fillStyle = '#111'; g.fillText('◆ ' + b.label, b.cx / T * sc, b.cy / T * sc - 8);
  }
  for (const t of activeTargets()) {
    g.fillStyle = t.col; g.strokeStyle = '#111'; g.lineWidth = 2;
    g.beginPath(); g.arc(t.x / T * sc, t.y / T * sc, t.shop ? 4 : 7, 0, 6.29); g.fill(); g.stroke();
  }
  const p = G.player, q = p.car || p;
  g.save(); g.translate(q.x / T * sc, q.y / T * sc); g.rotate(p.car ? p.car.angle : p.angle);
  g.fillStyle = '#fff'; g.strokeStyle = '#c4202a'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(10, 0); g.lineTo(-7, -7); g.lineTo(-3, 0); g.lineTo(-7, 7); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

// ---------- HUD (DOM) ----------
const $ = id => document.getElementById(id);
let hudT = 0;
function updateHUD(dt) {
  if (G.state === 'title') return;
  // Toasts
  if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) $('toast').classList.remove('show'); }
  if (G.msgT > 0) { G.msgT -= dt; if (G.msgT <= 0) $('msg').classList.remove('show'); }
  hudT -= dt;
  drawMini();
  if (G.showMap && Math.floor(G.time * 4) !== Math.floor((G.time - dt) * 4)) drawBigMap();
  if (hudT > 0) return;
  hudT = 0.1;
  const p = G.player, q = p.car || p;
  $('money').textContent = fmtEuro(p.money);
  $('hp').style.width = Math.max(0, p.hp) + '%';
  const cb = $('carbar');
  if (p.car) { cb.hidden = false; $('carhp').style.width = (p.car.hp / p.car.model.hp * 100) + '%'; } else cb.hidden = true;
  // Sterne
  const stars = $('stars').children;
  const evading = G.wanted > 0 && G.evadeT > 1.5 && Math.floor(G.time * 3) % 2;
  for (let i = 0; i < 5; i++) stars[i].className = i < G.wanted ? (evading ? 'on blink' : 'on') : '';
  // Ort
  const tx = Math.floor(q.x / T), ty = Math.floor(q.y / T);
  $('district').textContent = districtAt(tx, ty);
  $('street').textContent = streetAt(tx, ty);
  $('speed').textContent = p.car ? Math.round(carSpeed(p.car) / 10 * 3.6) + ' km/h' : '';
  // Uhr
  const h = Math.floor(G.clock), mi = Math.floor((G.clock - h) * 60);
  $('clock').textContent = String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  // Missionstext
  let obj = '';
  if (G.mission) {
    const s = G.mission.steps[G.missionStep];
    if (s && s.text) obj = s.text;
    if (s && s.needMissionCar && p.car !== G.missionData.car) obj = 'Steig wieder in den roten Sportwagen';
    if (s && s.type === 'goto' && s.poi === 'checkpoint') obj = s.text;
  } else if (G.taxi && G.taxi.stage) {
    obj = G.taxi.stage === 'pickup' ? 'Taxi: Hol den Fahrgast ab (gelbe Markierung)' : 'Taxi: Bring den Fahrgast ans Ziel';
  } else if (currentGiverPoi()) {
    const names = { spaeti: 'Deniz am Späti (Kreuzberg)', werkstatt: 'Kemals Werkstatt (Neukölln)' };
    obj = 'Nächster Auftrag: ' + (names[currentGiverPoi()] || 'Gelbes M');
  } else if (G.missionIdx >= MISSIONS.length) obj = 'Alle Missionen geschafft! Fahr Taxi oder erkunde Berlin.';
  $('objective').textContent = obj;
  $('objective').hidden = !obj;
  let tm = 0;
  if (G.mission && G.missionTimer > 0) tm = G.missionTimer;
  else if (G.taxi && G.taxi.stage === 'drive') tm = G.taxi.time;
  $('timer').hidden = !tm;
  if (tm) { $('timer').textContent = Math.floor(tm / 60) + ':' + String(Math.floor(tm % 60)).padStart(2, '0'); $('timer').classList.toggle('low', tm < 15); }
  // Hinweis
  let hint = '';
  if (!p.car && !p.dead) {
    for (const c of G.cars) if (!c.wreck && c.burning <= 0 && Math.hypot(c.x - p.x, c.y - p.y) < 55) { hint = (c.driver === 'ai' || c.driver === 'police') ? 'E – Auto klauen' : 'E – Einsteigen'; break; }
  }
  if (G.bustT > 0.3) hint = 'Die Polizei nimmt dich fest – hau ab!';
  $('hint').textContent = hint; $('hint').hidden = !hint;
}

function toast(text, t) {
  const el = $('toast');
  el.textContent = text; el.classList.add('show');
  G.toastT = t || 3;
}
function bigMsg(title, sub, bad) {
  const el = $('msg');
  el.innerHTML = '';
  const h = document.createElement('div'); h.className = 'mt'; h.textContent = title;
  const s = document.createElement('div'); s.className = 'ms'; s.textContent = sub || '';
  el.append(h, s);
  el.classList.toggle('bad', !!bad);
  el.classList.add('show');
  G.msgT = 3;
}
function flashDamage() { const el = $('dmg'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
function flashStars() { const el = $('stars'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }

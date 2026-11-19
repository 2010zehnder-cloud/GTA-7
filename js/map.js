'use strict';
// ============================================================
//  KIEZ KINGS – Berlin  |  Kartengenerator
// ============================================================

const T = 40;          // Kachelgröße in Pixeln
const MW = 182;        // Kartenbreite in Kacheln
const MH = 134;        // Kartenhöhe in Kacheln

const GRASS = 0, ROAD = 1, SIDEWALK = 2, BUILDING = 3, WATER = 4, PARK = 5, BRIDGE = 6,
      PLAZA = 7, SOLID = 8, WALL = 9, FIELD = 10, RUNWAY = 11, PARKING = 12, LOT = 13;

const SOLIDS = new Uint8Array(16);
SOLIDS[BUILDING] = SOLIDS[WATER] = SOLIDS[SOLID] = SOLIDS[WALL] = SOLIDS[LOT] = 1;

function makeRng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Spree-Verlauf (Kachelkoordinaten), von Ost nach West
const SPREE = [[184, 100], [162, 93], [150, 89], [138, 84], [126, 77], [116, 66], [108, 56], [102, 46],
  [97, 37], [89, 27], [78, 22], [64, 24], [50, 30], [36, 31], [22, 26], [8, 30], [-3, 32]];

const H_STREETS = ['Bornholmer Straße', 'Seestraße', 'Invalidenstraße', 'Torstraße', 'Unter den Linden',
  'Leipziger Straße', 'Kochstraße', 'Gneisenaustraße', 'Oranienstraße', 'Columbiadamm', 'Sonnenallee', 'Ringbahnstraße'];
const V_STREETS = ['Messedamm', 'Leibnizstraße', 'Uhlandstraße', 'Bundesallee', 'Potsdamer Straße',
  'Kurfürstenstraße', 'Ebertstraße', 'Friedrichstraße', 'Mehringdamm', 'Prinzenstraße', 'Kottbusser Damm',
  'Hermannstraße', 'Karl-Marx-Straße', 'Warschauer Straße', 'Frankfurter Allee', 'Möllendorffstraße'];

const DISTRICTS = [
  ['Charlottenburg', 10, 62], ['Wedding', 60, 6], ['Moabit', 44, 22], ['Mitte', 94, 40],
  ['Prenzlauer Berg', 132, 16], ['Friedrichshain', 152, 62], ['Kreuzberg', 100, 84], ['Schöneberg', 44, 92],
  ['Neukölln', 142, 112], ['Lichtenberg', 176, 34], ['Treptow', 176, 120], ['Tempelhof', 86, 130]
];

const World = {
  tiles: new Uint8Array(MW * MH),
  trees: [], treeAt: new Map(),
  buildings: [], pois: {}, lamps: [], signs: [],
  cost: null,
};

function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MW || y >= MH) return SOLID;
  return World.tiles[y * MW + x];
}
function setTile(x, y, t) { if (x >= 0 && y >= 0 && x < MW && y < MH) World.tiles[y * MW + x] = t; }
function isSolidTile(x, y) { return SOLIDS[tileAt(x, y)] === 1; }
function isRoadTile(t) { return t === ROAD || t === BRIDGE; }
function isRoadLine(v) { const m = v % 12; return m === 0 || m === 1; }
function isWalkTile(t) { return t === SIDEWALK || t === PLAZA || t === PARK || t === FIELD || t === PARKING; }

function distToSpree(px, py) {
  let best = 1e9, bx = 0, by = 0;
  for (let i = 0; i < SPREE.length - 1; i++) {
    const [ax, ay] = SPREE[i], [cx, cy] = SPREE[i + 1];
    const dx = cx - ax, dy = cy - ay;
    let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    const qx = ax + dx * t, qy = ay + dy * t;
    const d = Math.hypot(px - qx, py - qy);
    if (d < best) { best = d; bx = qx; by = qy; }
  }
  return { d: best, x: bx, y: by };
}

function districtAt(tx, ty) {
  if (tx >= 26 && tx <= 71 && ty >= 38 && ty <= 59) return 'Tiergarten';
  if (tx >= 62 && tx <= 107 && ty >= 110) return 'Tempelhofer Feld';
  let best = 1e9, name = '';
  for (const [n, x, y] of DISTRICTS) {
    const d = (tx - x) * (tx - x) + (ty - y) * (ty - y);
    if (d < best) { best = d; name = n; }
  }
  return name;
}

function streetAt(tx, ty) {
  const h = isRoadLine(ty), v = isRoadLine(tx);
  const hn = () => {
    const k = Math.floor(ty / 12);
    if (k === 4 && tx < 72) return 'Straße des 17. Juni';
    if (k === 4 && tx >= 108) return 'Karl-Marx-Allee';
    return H_STREETS[k] || '';
  };
  const vn = () => V_STREETS[Math.floor(tx / 12)] || '';
  if (h && v) return hn() + ' / ' + vn();
  if (h) return hn();
  if (v) return vn();
  return '';
}

// --------------------------------------------------------------
//  Gebäude-Fabrik
// --------------------------------------------------------------
const ALTBAU_WALLS = ['#d9c9a6', '#c9a67a', '#bcb3a2', '#d5b39a', '#a9b5b8', '#cfc1a1', '#e0d3b8', '#b99c84'];
const ALTBAU_ROOFS = ['#94472f', '#83402c', '#6c4b3e', '#5a5f66', '#7a3b2b', '#4d5257'];
const PLATTE_WALLS = ['#c4c6c0', '#b7bdb9', '#cfcab9', '#a9b2ad'];
const MODERN_WALLS = ['#8fa3b5', '#9fb1ba', '#7c8f9e', '#b0b6b8'];

function addBuilding(b) {
  // b: tx,ty,tw,th (Kacheln) + style
  b.x = b.tx * T; b.y = b.ty * T; b.w = b.tw * T; b.h = b.th * T;
  b.cx = b.x + b.w / 2; b.cy = b.y + b.h / 2;
  if (!b.noTiles) {
    for (let y = b.ty; y < b.ty + b.th; y++)
      for (let x = b.tx; x < b.tx + b.tw; x++) setTile(x, y, BUILDING);
  }
  b.id = World.buildings.length;
  World.buildings.push(b);
  return b;
}

function styledBuilding(r, tx, ty, tw, th, east) {
  const kind = east && r() < 0.55 ? 'platte' : (r() < 0.75 ? 'altbau' : 'modern');
  let z, wall, roof;
  if (kind === 'platte') { z = 0.19 + r() * 0.08; wall = PLATTE_WALLS[(r() * 4) | 0]; roof = '#8b9095'; }
  else if (kind === 'altbau') { z = 0.11 + r() * 0.05; wall = ALTBAU_WALLS[(r() * 8) | 0]; roof = ALTBAU_ROOFS[(r() * 6) | 0]; }
  else { z = 0.13 + r() * 0.1; wall = MODERN_WALLS[(r() * 4) | 0]; roof = r() < 0.5 ? '#9a978f' : '#74716a'; }
  return addBuilding({ tx, ty, tw, th, z, wall, roof, kind, seed: (r() * 1e9) | 0 });
}

// --------------------------------------------------------------
//  Generierung
// --------------------------------------------------------------
function generateWorld() {
  const r = makeRng(1989);
  const tiles = World.tiles;

  // 1) Grundraster
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    let t;
    if (isRoadLine(x) || isRoadLine(y)) t = ROAD;
    else if (x % 12 === 2 || x % 12 === 11 || y % 12 === 2 || y % 12 === 11) t = SIDEWALK;
    else t = LOT;
    tiles[y * MW + x] = t;
  }

  const special = new Set(); // Blöcke mit Sonderbehandlung "i,j"
  const fillRect = (x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setTile(x, y, t); };

  // 2) Tiergarten
  for (let y = 38; y <= 59; y++) for (let x = 26; x <= 71; x++) {
    if (y === 48 || y === 49) continue;
    setTile(x, y, PARK);
  }
  for (let i = 2; i <= 5; i++) for (let j = 3; j <= 4; j++) special.add(i + ',' + j);

  // Tempelhofer Feld
  for (let y = 110; y <= 131; y++) for (let x = 62; x <= 107; x++) setTile(x, y, FIELD);
  fillRect(66, 117, 103, 118, RUNWAY);
  fillRect(66, 125, 103, 126, RUNWAY);
  for (let i = 5; i <= 8; i++) for (let j = 9; j <= 10; j++) special.add(i + ',' + j);

  // 3) Spree
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const s = distToSpree(x + 0.5, y + 0.5);
    const t = tiles[y * MW + x];
    if (s.d < 2.1) {
      tiles[y * MW + x] = (t === ROAD) ? BRIDGE : WATER;
    } else if (s.d < 3.1) {
      if (x >= 139 && x <= 161 && y + 0.5 < s.y && s.d >= 2.2 && t !== ROAD) {
        tiles[y * MW + x] = WALL; // East Side Gallery
      } else if (t === LOT || t === PARK) tiles[y * MW + x] = SIDEWALK;
    }
  }
  // East Side Gallery Wandsegmente als bemalte Objekte
  const muralCols = ['#e8463b', '#f3b61f', '#3aa7d8', '#7bc043', '#f37736', '#c04de6', '#ffffff', '#ee4c7c', '#2bb39a'];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (tiles[y * MW + x] === WALL) {
    addBuilding({ tx: x, ty: y, tw: 1, th: 1, z: 0.035, wall: muralCols[(r() * muralCols.length) | 0], roof: '#d9d6cf', kind: 'mural', noTiles: true, seed: (r() * 1e9) | 0 });
  }

  // 4) Wahrzeichen ------------------------------------------------
  const blockRange = (i, j) => [12 * i + 2, 12 * j + 2, 12 * i + 11, 12 * j + 11];

  // Pariser Platz + Brandenburger Tor (Block 6,3 und 6,4)
  special.add('6,3'); special.add('6,4');
  fillRect(74, 41, 83, 47, PLAZA);
  fillRect(74, 50, 83, 56, PLAZA);
  setTile(75, 46, SOLID); setTile(75, 47, SOLID); setTile(75, 50, SOLID); setTile(75, 51, SOLID);
  World.buildings.push({ id: World.buildings.length, landmark: 'tor', x: 74.6 * T, y: 45.6 * T, w: 1.8 * T, h: 6.8 * T,
    cx: 75.5 * T, cy: 49 * T, label: 'Brandenburger Tor' });
  // Häuserzeilen am Pariser Platz
  styledBuilding(r, 77, 38, 7, 3, false); styledBuilding(r, 77, 57, 7, 3, false);
  styledBuilding(r, 74, 38, 2, 3, false); styledBuilding(r, 74, 57, 2, 3, false);
  for (let y = 38; y <= 59; y++) for (let x = 74; x <= 83; x++) if (tileAt(x, y) === LOT) setTile(x, y, PLAZA);

  // Reichstag (Block 6,2)
  special.add('6,2');
  fillRect(74, 26, 83, 35, PLAZA);
  addBuilding({ tx: 75, ty: 27, tw: 8, th: 6, z: 0.14, wall: '#cdbf9f', roof: '#b9ab8b', kind: 'reichstag', landmark: 'reichstag', label: 'Reichstag' });
  for (let y = 22; y <= 35; y++) for (let x = 74; x <= 83; x++) if (tileAt(x, y) === LOT) setTile(x, y, PLAZA);

  // Berliner Dom + Lustgarten (Block 7,3)
  special.add('7,3');
  fillRect(86, 38, 95, 47, PLAZA);
  addBuilding({ tx: 87, ty: 39, tw: 7, th: 6, z: 0.15, wall: '#9e9584', roof: '#867d6c', kind: 'dom', landmark: 'dom', label: 'Berliner Dom' });

  // Alexanderplatz + Fernsehturm (Block 9,3)
  special.add('9,3');
  fillRect(110, 38, 119, 47, PLAZA);
  fillRect(114, 42, 115, 43, SOLID);
  World.buildings.push({ id: World.buildings.length, landmark: 'turm', x: 114 * T, y: 42 * T, w: 2 * T, h: 2 * T, cx: 115 * T, cy: 43 * T, label: 'Fernsehturm' });
  addBuilding({ tx: 110, ty: 38, tw: 3, th: 2, z: 0.2, wall: '#9aa6ad', roof: '#7f8a90', kind: 'modern', seed: 11 });
  addBuilding({ tx: 117, ty: 46, tw: 3, th: 2, z: 0.17, wall: '#a8b0b3', roof: '#8a9296', kind: 'modern', seed: 12 });

  // Potsdamer Platz (Block 6,5)
  special.add('6,5');
  fillRect(74, 62, 83, 71, PLAZA);
  addBuilding({ tx: 74, ty: 62, tw: 3, th: 3, z: 0.42, wall: '#5d7d99', roof: '#40566b', kind: 'glass', seed: 1 });
  addBuilding({ tx: 81, ty: 62, tw: 3, th: 4, z: 0.36, wall: '#7a8c9a', roof: '#566572', kind: 'glass', seed: 2 });
  addBuilding({ tx: 74, ty: 68, tw: 4, th: 4, z: 0.3, wall: '#8d6b52', roof: '#6b513f', kind: 'glass', seed: 3 });
  addBuilding({ tx: 81, ty: 69, tw: 3, th: 3, z: 0.33, wall: '#6a8fa8', roof: '#4b6a80', kind: 'glass', seed: 4 });

  // Siegessäule im Tiergarten
  fillRect(54, 44, 56, 46, PLAZA);
  setTile(55, 45, SOLID);
  World.buildings.push({ id: World.buildings.length, landmark: 'saeule', x: 55 * T, y: 45 * T, w: T, h: T, cx: 55.5 * T, cy: 45.5 * T, label: 'Siegessäule' });

  // Hauptbahnhof (Block 5,1)
  special.add('5,1');
  for (let y = 14; y <= 23; y++) for (let x = 62; x <= 71; x++) if (tileAt(x, y) === LOT) setTile(x, y, PLAZA);
  addBuilding({ tx: 63, ty: 15, tw: 8, th: 4, z: 0.13, wall: '#9fb8c8', roof: '#c5d6df', kind: 'hbf', landmark: 'hbf', label: 'Hauptbahnhof' });
  for (let y = 20; y <= 21; y++) for (let x = 63; x <= 70; x++) if (tileAt(x, y) === PLAZA) setTile(x, y, PARKING);

  // Charité (Block 7,1)
  special.add('7,1');
  for (let y = 14; y <= 23; y++) for (let x = 86; x <= 95; x++) if (tileAt(x, y) === LOT) setTile(x, y, PLAZA);
  addBuilding({ tx: 87, ty: 15, tw: 7, th: 4, z: 0.28, wall: '#a9573e', roof: '#e9e6df', kind: 'klinik', landmark: 'klinik', label: 'Charité' });

  // Schloss Charlottenburg (Block 1,3)
  special.add('1,3');
  fillRect(14, 38, 23, 47, PARK);
  addBuilding({ tx: 14, ty: 39, tw: 10, th: 3, z: 0.1, wall: '#e3d6a8', roof: '#6f9c86', kind: 'schloss', landmark: 'schloss', label: 'Schloss Charlottenburg' });
  fillRect(16, 42, 21, 43, PLAZA);

  // Checkpoint Charlie (Block 7,6)
  special.add('7,6');
  fillRect(86, 74, 89, 77, PLAZA);
  World.buildings.push({ id: World.buildings.length, landmark: 'checkpoint', x: 87 * T, y: 75 * T, w: T, h: T, cx: 87.5 * T, cy: 75.5 * T, label: 'Checkpoint Charlie', noSort: false });
  setTile(87, 75, SOLID);
  for (let y = 74; y <= 83; y++) for (let x = 86; x <= 95; x++) if (tileAt(x, y) === LOT && (x > 89 || y > 77)) {/* später normal */ }

  // Flughafen Tempelhof (Gebäude am Nordrand des Feldes)
  addBuilding({ tx: 66, ty: 110, tw: 38, th: 3, z: 0.12, wall: '#b8ae98', roof: '#8e8676', kind: 'flughafen', landmark: 'flughafen', label: 'Flughafen Tempelhof' });

  // Polizeiwache (Block 4,6)
  special.add('4,6');
  for (let y = 74; y <= 83; y++) for (let x = 50; x <= 59; x++) if (tileAt(x, y) === LOT) setTile(x, y, PARKING);
  addBuilding({ tx: 51, ty: 75, tw: 7, th: 3, z: 0.16, wall: '#d9dde0', roof: '#5c7a93', kind: 'polizei', landmark: 'polizei', label: 'Polizei' });

  // Lackierereien
  const garage = (bi, bj, label, kind) => {
    special.add(bi + ',' + bj);
    const [x0, y0, x1, y1] = blockRange(bi, bj);
    for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) if (tileAt(x, y) === LOT) setTile(x, y, PARKING);
    addBuilding({ tx: x0 + 3, ty: y0 + 3, tw: 5, th: 4, z: 0.1, wall: kind === 'lack' ? '#d3d8da' : '#b9a27a', roof: kind === 'lack' ? '#556b78' : '#6b5a46', kind, landmark: kind, label });
  };
  garage(2, 7, 'Lackiererei', 'lack');
  garage(12, 2, 'Lackiererei', 'lack');
  garage(12, 8, "Kemals Werkstatt", 'werkstatt');

  // Lidl-Filialen (mit Parkplatz, wie es sich gehört)
  World.shops = [];
  const lidl = (bi, bj) => {
    special.add(bi + ',' + bj);
    const [x0, y0, x1, y1] = blockRange(bi, bj);
    for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) if (tileAt(x, y) === LOT) setTile(x, y, PARKING);
    addBuilding({ tx: x0 + 2, ty: y0 + 1, tw: 6, th: 4, z: 0.08, wall: '#e9e9e4', roof: '#0a4fa6', kind: 'lidl', landmark: 'lidl', label: 'Lidl' });
    World.shops.push({ x: (x0 + 5) * T, y: (y0 + 0.5) * T });
  };
  lidl(5, 0);   // Wedding, gleich nördlich vom Hauptbahnhof
  lidl(9, 7);   // Kreuzberg
  lidl(13, 9);  // Neukölln

  // 5) Normale Blöcke
  for (let j = 0; j < 11; j++) for (let i = 0; i < 15; i++) {
    const key = i + ',' + j;
    const [x0, y0, x1, y1] = blockRange(i, j);
    const east = i >= 9;
    if (special.has(key)) {
      // Restflächen in Sonderblöcken mit kleinen Häusern füllen
      greedyFill(r, x0 + 1, y0 + 1, x1 - 1, y1 - 1, east);
      continue;
    }
    // vollständige Fläche?
    let full = true;
    for (let y = y0 + 1; y < y1 && full; y++) for (let x = x0 + 1; x < x1; x++) if (tileAt(x, y) !== LOT) { full = false; break; }
    const roll = r();
    if (full && roll < 0.06) {
      fillRect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, PARK);
    } else if (full && roll < 0.13) {
      fillRect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, PARKING);
    } else if (full && roll < 0.4 && !east) {
      // Berliner Altbau-Block mit Hinterhof
      const wall = ALTBAU_WALLS[(r() * 8) | 0], roof = ALTBAU_ROOFS[(r() * 6) | 0];
      const z = 0.12 + r() * 0.04;
      const mk = (tx, ty, tw, th) => addBuilding({ tx, ty, tw, th, z, wall: r() < 0.5 ? wall : ALTBAU_WALLS[(r() * 8) | 0], roof, kind: 'altbau', seed: (r() * 1e9) | 0 });
      mk(x0 + 1, y0 + 1, 8, 2); mk(x0 + 1, y1 - 2, 8, 2);
      mk(x0 + 1, y0 + 3, 2, 4); mk(x1 - 2, y0 + 3, 2, 4);
      fillRect(x0 + 3, y0 + 3, x1 - 3, y1 - 3, PLAZA); // Hinterhof
      if (r() < 0.6) { // Hinterhof-Baum
        addTree(r, (x0 + 5) * T + 20, (y0 + 5) * T + 20, 18);
      }
    } else {
      greedyFill(r, x0 + 1, y0 + 1, x1 - 1, y1 - 1, east);
    }
  }
  // restliche LOT-Kacheln (sollte nicht vorkommen)
  for (let k = 0; k < tiles.length; k++) if (tiles[k] === LOT) tiles[k] = PLAZA;

  // 6) Bäume
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = tiles[y * MW + x];
    if (t === PARK && r() < 0.42) {
      addTree(r, x * T + 20 + (r() - 0.5) * 14, y * T + 20 + (r() - 0.5) * 14, 15 + r() * 9);
    } else if (t === SIDEWALK && r() < 0.18) {
      // Straßenbaum: an die Bordsteinkante schieben
      let ox = 0, oy = 0;
      if (isRoadTile(tileAt(x + 1, y))) ox = 13; else if (isRoadTile(tileAt(x - 1, y))) ox = -13;
      else if (isRoadTile(tileAt(x, y + 1))) oy = 13; else if (isRoadTile(tileAt(x, y - 1))) oy = -13;
      else continue;
      if (isRoadTile(tileAt(x + 1, y)) && isRoadTile(tileAt(x, y + 1))) continue;
      if (isRoadTile(tileAt(x - 1, y)) && isRoadTile(tileAt(x, y - 1))) continue;
      addTree(r, x * T + 20 + ox, y * T + 20 + oy, 11 + r() * 5);
    } else if (t === FIELD && r() < 0.01) {
      addTree(r, x * T + 20, y * T + 20, 14);
    }
  }

  // 7) Straßenlaternen & U-Bahn-Schilder an Kreuzungen
  for (let yj = 0; yj < MH; yj += 12) for (let xi = 0; xi < MW; xi += 12) {
    const corners = [[xi - 1, yj - 1], [xi + 2, yj - 1], [xi - 1, yj + 2], [xi + 2, yj + 2]];
    for (const [cx, cy] of corners) {
      if (tileAt(cx, cy) === SIDEWALK) {
        World.lamps.push({ x: cx * T + 20, y: cy * T + 20 });
        if (r() < 0.12) World.signs.push({ x: cx * T + 20, y: cy * T + 20, t: r() < 0.6 ? 'U' : 'S' });
      }
    }
  }

  // 8) POIs (Kachelkoordinaten -> Pixel)
  const P = (x, y) => ({ x: x * T, y: y * T });
  World.pois = {
    start: P(66.5, 14.5),
    spaeti: P(98.5, 89.5),
    imbiss: P(134.5, 99.5),
    tor: P(79, 49),
    reichstag: P(78.5, 37),
    dom: P(91, 49),
    turm: P(114.5, 49),
    esg: P(150, 85),
    potsdamer: P(78.5, 66.5),
    werkstatt: P(150.5, 98.5),
    checkpoint: P(86.5, 74.5),
    tempelhof: P(85, 121.5),
    polizei: P(54.5, 74.5),
    klinik: P(90.5, 14.5),
    lack1: P(30.5, 86.5),
    lack2: P(150.5, 26.5),
    hbf: P(66.5, 14.5),
  };

  // 9) Wegkosten für Polizei-Navigation
  const cost = new Uint8Array(MW * MH);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = tiles[y * MW + x];
    if (SOLIDS[t]) { cost[y * MW + x] = 0; continue; }
    let c = isRoadTile(t) ? 1 : 3;
    // Nähe zu Hindernissen bestrafen
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isSolidTile(x + dx, y + dy)) { c += 3; dy = 2; break; }
    cost[y * MW + x] = c;
  }
  World.cost = cost;

  buildChunkIndex();
}

function addTree(r, x, y, rad) {
  const tr = { x, y, r: rad, tr: 6, hue: r(), seed: (r() * 1000) | 0 };
  World.trees.push(tr);
  const k = Math.floor(y / T) * MW + Math.floor(x / T);
  World.treeAt.set(k, tr);
}

function greedyFill(r, x0, y0, x1, y1, east) {
  const used = new Set();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (tileAt(x, y) !== LOT || used.has(x + ',' + y)) continue;
    const maxW = 2 + ((r() * 6) | 0), maxH = 2 + ((r() * 6) | 0);
    let w = 1;
    while (w < maxW && x + w <= x1 && tileAt(x + w, y) === LOT && !used.has((x + w) + ',' + y)) w++;
    let h = 1, ok = true;
    while (h < maxH && y + h <= y1 && ok) {
      for (let k = 0; k < w; k++) if (tileAt(x + k, y + h) !== LOT || used.has((x + k) + ',' + (y + h))) { ok = false; break; }
      if (ok) h++;
    }
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) used.add(xx + ',' + yy);
    if (w * h <= 1 && r() < 0.5) { setTile(x, y, PLAZA); continue; }
    styledBuilding(r, x, y, w, h, east);
  }
}

// Räumlicher Index für Gebäude (pro 8x8-Kachel-Zelle)
const CELL = 8;
const CW = Math.ceil(MW / CELL), CHh = Math.ceil(MH / CELL);
World.cells = [];
function buildChunkIndex() {
  World.cells = Array.from({ length: CW * CHh }, () => []);
  World.treeCells = Array.from({ length: CW * CHh }, () => []);
  for (const b of World.buildings) {
    const x0 = Math.floor(b.x / T / CELL), x1 = Math.floor((b.x + b.w - 1) / T / CELL);
    const y0 = Math.floor(b.y / T / CELL), y1 = Math.floor((b.y + b.h - 1) / T / CELL);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) World.cells[y * CW + x].push(b);
  }
  for (const t of World.trees) {
    const cx = Math.floor(t.x / T / CELL), cy = Math.floor(t.y / T / CELL);
    World.treeCells[cy * CW + cx].push(t);
  }
}

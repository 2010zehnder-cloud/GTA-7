'use strict';
// ============================================================
//  KIEZ KINGS – Berlin  |  Lidl-Filialen
// ============================================================

function fmtEuro(m) {
  const opt = Number.isInteger(m) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return m.toLocaleString('de-DE', opt) + ' €';
}

const LIDL_ITEMS = [
  { id: 'kong', name: 'Kong Strong Energy', desc: '60 Sek. schneller rennen, +5 Gesundheit', price: 0.99, icon: '⚡',
    use(p) { G.boostT = 60; heal(p, 5); return 'Kong Strong! Du fühlst dich unaufhaltsam.'; } },
  { id: 'gipfel', name: 'Nuss-Nougat-Gipfel', desc: '+15 Gesundheit – frisch aus dem Backautomaten', price: 0.49, icon: '🥐',
    use(p) { heal(p, 15); return 'Mmh, Nuss-Nougat-Gipfel. Noch warm!'; } },
  { id: 'brezel', name: 'Laugenbrezel', desc: '+6 Gesundheit', price: 0.29, icon: '🥨',
    use(p) { heal(p, 6); return 'Brezel weggeknuspert.'; } },
  { id: 'broetchen', name: 'Belegtes Brötchen', desc: '+25 Gesundheit', price: 1.49, icon: '🥪',
    use(p) { heal(p, 25); return 'Satt und zufrieden.'; } },
  { id: 'wasser', name: 'Mineralwasser 1,5 l', desc: '+5 Gesundheit', price: 0.29, icon: '💧',
    use(p) { heal(p, 5); return 'Erfrischend. Pfand nicht vergessen!'; } },
  { id: 'flips', name: 'Erdnussflips', desc: '+10 Gesundheit', price: 0.89, icon: '🥜',
    use(p) { heal(p, 10); return 'Crunch!'; } },
  { id: 'schoko', name: 'Vollmilch-Schokolade', desc: '+12 Gesundheit', price: 0.79, icon: '🍫',
    use(p) { heal(p, 12); return 'Nervennahrung.'; } },
  { id: 'bananen', name: 'Bananen 1 kg', desc: '+15 Gesundheit', price: 1.19, icon: '🍌',
    use(p) { heal(p, 15); return 'Gesund und lecker.'; } },
  { id: 'erstehilfe', name: 'Verbandskasten', desc: 'Volle Gesundheit', price: 4.99, icon: '🩹',
    use(p) { p.hp = 100; return 'Wieder wie neu.'; } },
  { id: 'werkzeug', name: 'Werkzeugkoffer (Aktionsware)', desc: 'Repariert dein letztes Auto komplett', price: 19.99, icon: '🧰',
    use(p) {
      const c = p.lastCar;
      if (!c || c.wreck || !G.cars.includes(c)) return null;
      c.hp = c.model.hp; c.burning = 0;
      return 'Dein Auto ist repariert.';
    } },
];

function heal(p, n) { p.hp = Math.min(100, p.hp + n); }

function updateShops() {
  const p = G.player;
  if (p.car || p.dead || !World.shops) return;
  let near = false;
  for (const s of World.shops) {
    if (Math.hypot(s.x - p.x, s.y - p.y) < 28) near = true;
  }
  if (near && !G.inShopZone) { G.inShopZone = true; openShop(); }
  if (!near) {
    let far = true;
    for (const s of World.shops) if (Math.hypot(s.x - p.x, s.y - p.y) < 50) far = false;
    if (far) G.inShopZone = false;
  }
}

function openShop() {
  G.state = 'shop';
  for (const k in keys) keys[k] = false;
  touch.jx = touch.jy = 0;
  renderShop();
  document.getElementById('shop').hidden = false;
  Sound.beep(880, 0.08, 'triangle', 0.1); Sound.beep(1175, 0.15, 'triangle', 0.1, 0.08);
}

function closeShop() {
  document.getElementById('shop').hidden = true;
  G.state = 'play';
  last = performance.now();
}

function renderShop(note) {
  const p = G.player;
  document.getElementById('shop-money').textContent = fmtEuro(p.money);
  document.getElementById('shop-hp').textContent = Math.round(p.hp) + ' / 100';
  const list = document.getElementById('shop-list');
  list.innerHTML = '';
  for (const it of LIDL_ITEMS) {
    const b = document.createElement('button');
    b.className = 'item';
    b.id = 'buy-' + it.id;
    b.disabled = p.money < it.price;
    const ic = document.createElement('span'); ic.className = 'ic'; ic.textContent = it.icon;
    const tx = document.createElement('span'); tx.className = 'tx';
    const nm = document.createElement('b'); nm.textContent = it.name;
    const ds = document.createElement('small'); ds.textContent = it.desc;
    tx.append(nm, ds);
    const pr = document.createElement('span'); pr.className = 'pr'; pr.textContent = it.price.toFixed(2).replace('.', ',');
    b.append(ic, tx, pr);
    b.addEventListener('click', () => buy(it));
    list.append(b);
  }
  document.getElementById('shop-note').textContent = note || 'Was darf’s sein? Antippen zum Kaufen.';
}

function buy(it) {
  const p = G.player;
  if (p.money < it.price) { renderShop('Nicht genug Geld.'); return; }
  const msg = it.use(p);
  if (msg === null) { renderShop('Du hast gerade kein Auto, das man reparieren könnte.'); return; }
  p.money = Math.round((p.money - it.price) * 100) / 100;
  Sound.coin();
  save();
  renderShop(it.name + ' gekauft. ' + msg);
}

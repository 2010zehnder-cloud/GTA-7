'use strict';
// ============================================================
//  Sound – alles synthetisch per WebAudio
// ============================================================
const Sound = {
  ctx: null, master: null, muted: false, ready: false,
  engine: null, siren: null, sirenT: 0,

  init() {
    if (this.ready) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);

      // Motor
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 50;
      const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 25;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
      const g = this.ctx.createGain(); g.gain.value = 0;
      const g2 = this.ctx.createGain(); g2.gain.value = 0.4;
      o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(this.master);
      o.start(); o2.start();
      this.engine = { o, o2, f, g };

      // Martinshorn (Tatütata)
      const so = this.ctx.createOscillator(); so.type = 'triangle'; so.frequency.value = 440;
      const sg = this.ctx.createGain(); sg.gain.value = 0;
      so.connect(sg); sg.connect(this.master); so.start();
      this.siren = { o: so, g: sg };

      // Rauschpuffer für Crashs
      const len = this.ctx.sampleRate * 0.6;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      this.ready = true;
    } catch (e) { this.ready = false; }
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  },

  update(dt, inCar, speed, throttle, sirenVol) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const e = this.engine;
    if (inCar) {
      const s = Math.abs(speed);
      const gearPos = (s % 120) / 120;
      const f = 38 + s * 0.12 + gearPos * 40 + Math.max(0, throttle) * 10;
      e.o.frequency.setTargetAtTime(f, t, 0.05);
      e.o2.frequency.setTargetAtTime(f / 2, t, 0.05);
      e.f.frequency.setTargetAtTime(250 + s * 1.2 + throttle * 200, t, 0.05);
      e.g.gain.setTargetAtTime(0.07 + Math.abs(throttle) * 0.05, t, 0.08);
    } else {
      e.g.gain.setTargetAtTime(0, t, 0.1);
    }
    // Martinshorn: zwei Töne im Wechsel
    this.sirenT += dt;
    const hi = Math.floor(this.sirenT / 0.55) % 2 === 0;
    this.siren.o.frequency.setTargetAtTime(hi ? 466 : 622, t, 0.01);
    this.siren.g.gain.setTargetAtTime(sirenVol * 0.07, t, 0.1);
  },

  crash(strength) {
    if (!this.ready) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600 + strength * 4;
    const g = this.ctx.createGain(); g.gain.value = Math.min(0.9, strength / 300);
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  },

  beep(freq, dur, type = 'square', vol = 0.15, when = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },

  horn() { this.beep(392, 0.35, 'square', 0.12); this.beep(494, 0.35, 'square', 0.08); },
  coin() { this.beep(988, 0.08, 'square', 0.1); this.beep(1319, 0.25, 'square', 0.1, 0.08); },
  success() { [523, 659, 784, 1047].forEach((f, i) => this.beep(f, 0.25, 'triangle', 0.18, i * 0.12)); },
  fail() { [392, 330, 262].forEach((f, i) => this.beep(f, 0.3, 'sawtooth', 0.12, i * 0.18)); },
  boom() {
    if (!this.ready) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.35;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    const g = this.ctx.createGain(); g.gain.value = 1.2;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  },
};

// Sound. Effects are generated with the Web Audio API (no SFX files). Music streams from
// audio/music/: a personal copy in audio/music/local/ (git-ignored) wins over the public
// track of the same name; if neither exists the game is simply silent. Two moods,
// 'explore' and 'boss', crossfade. Everything starts on the first tap (browser rule).
import { CONFIG } from './config.js';

const A = CONFIG.audio;
const PREF_KEY = 'frostbound.sound';   // 'all' | 'sfx' (music off) | 'off'

function loadPref() { try { return localStorage.getItem(PREF_KEY) || 'all'; } catch { return 'all'; } }
function savePref(v) { try { localStorage.setItem(PREF_KEY, v); } catch { /* storage unavailable */ } }

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.pref = loadPref();
    this.mood = 'explore';
    this.tracks = {};       // mood -> { el, gain }
    this.listener = { x: 0, z: 0 };
  }

  // Call from a tap/click handler.
  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.connect(this.master);
    this.#applyPref();

    // 1 s of white noise, reused by every noisy sound
    const n = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, n, n);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

    this.#startWind();
    this.#loadMusic();
    addEventListener('visibilitychange', () => (document.hidden ? ctx.suspend() : ctx.resume()));
  }

  // Cycle all -> music off -> all off. Returns the new setting.
  cyclePref() {
    this.pref = { all: 'sfx', sfx: 'off', off: 'all' }[this.pref] ?? 'all';
    savePref(this.pref);
    this.#applyPref();
    return this.pref;
  }

  #applyPref() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.pref === 'off' ? 0 : A.master, t, 0.1);
    this.sfx.gain.setValueAtTime(A.sfx, t);
    this.music.gain.setTargetAtTime(this.pref === 'all' ? A.music : 0, t, 0.3);
  }

  // ---- Music ----
  async #find(name) {
    for (const dir of ['audio/music/local/', 'audio/music/']) {
      for (const ext of ['mp3', 'ogg']) {
        try {
          const r = await fetch(`${dir}${name}.${ext}`, { method: 'HEAD' });
          if (r.ok) return `${dir}${name}.${ext}`;
        } catch { /* offline / blocked */ }
      }
    }
    return null;
  }

  async #loadMusic() {
    for (const mood of ['explore', 'boss']) {
      const url = await this.#find(mood);
      if (!url) continue;
      const el = new Audio(url);
      el.loop = true;
      el.preload = 'auto';
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      this.ctx.createMediaElementSource(el).connect(gain);
      gain.connect(this.music);
      this.tracks[mood] = { el, gain };
    }
    this.#fadeTo(this.mood, true);
  }

  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    if (this.ctx) this.#fadeTo(mood);
  }

  #fadeTo(mood, instant = false) {
    const t = this.ctx.currentTime, fade = instant ? 0.05 : A.crossfade;
    for (const [name, tr] of Object.entries(this.tracks)) {
      const on = name === mood;
      tr.gain.gain.cancelScheduledValues(t);
      tr.gain.gain.setValueAtTime(tr.gain.gain.value, t);
      tr.gain.gain.linearRampToValueAtTime(on ? 1 : 0, t + fade);
      if (on) { if (name === 'boss') tr.el.currentTime = 0; tr.el.play().catch(() => {}); }
      else setTimeout(() => { if (this.mood !== name) tr.el.pause(); }, fade * 1000 + 100);
    }
  }

  // ---- Ambience ----
  #startWind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 220;
    lfo.connect(lfoGain); lfoGain.connect(bp.frequency); lfo.start();
    this.wind = ctx.createGain(); this.wind.gain.value = A.wind;
    src.connect(bp); bp.connect(this.wind); this.wind.connect(this.sfx);
    src.start();
  }

  // 'valley' (wind) or 'dungeon' (still air)
  setAmbience(kind) {
    if (!this.ctx) return;
    this.wind.gain.setTargetAtTime(kind === 'valley' ? A.wind : A.wind * 0.12, this.ctx.currentTime, 0.8);
  }

  setListener(pos) { this.listener.x = pos.x; this.listener.z = pos.z; }

  // ---- Sound building blocks ----
  #out(vol, at) {
    let v = vol;
    if (at) {
      const d = Math.hypot(at.x - this.listener.x, at.z - this.listener.z);
      v *= Math.max(0, 1 - d / A.range);
      if (v < 0.01) return null;
    }
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(this.sfx);
    return g;
  }

  #env(param, t, attack, decay, peak) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  #tone(out, type, f0, f1, dur, peak = 0.5, delay = 0) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this.#env(g.gain, t, Math.min(0.02, dur * 0.2), dur, peak);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  #noise(out, type, f0, f1, dur, peak = 0.5, q = 1, delay = 0) {
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.#env(g.gain, t, Math.min(0.03, dur * 0.25), dur, peak);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // play(name, worldPos?) — worldPos makes it quieter with distance.
  play(name, at = null) {
    if (!this.ctx || this.pref === 'off') return;
    const recipe = SOUNDS[name];
    if (!recipe) return;
    const out = this.#out(recipe.vol ?? 1, at);
    if (out) recipe.make(out, { tone: (...a) => this.#tone(out, ...a), noise: (...a) => this.#noise(out, ...a) });
  }
}

const r = (a, b) => a + Math.random() * (b - a);

// Each sound: vol, and make(out, { tone(type, f0, f1, dur, peak, delay), noise(filter, f0, f1, dur, peak, q, delay) })
const SOUNDS = {
  swing:   { vol: 0.6, make: (o, s) => s.noise('bandpass', 1600, 500, 0.18, 0.5, 1.2) },
  heavySwing: { vol: 0.6, make: (o, s) => s.noise('bandpass', 900, 300, 0.25, 0.5, 1.2) },
  hit:     { vol: 0.8, make: (o, s) => { s.tone('sine', 150, 55, 0.16, 0.7); s.noise('lowpass', 1800, 400, 0.09, 0.5); } },
  arrowHit: { vol: 0.7, make: (o, s) => { s.noise('lowpass', 1200, 300, 0.06, 0.6); s.tone('triangle', 320, 120, 0.07, 0.4); } },
  block:   { vol: 0.6, make: (o, s) => { s.tone('square', 640, 600, 0.28, 0.12); s.tone('square', 957, 940, 0.22, 0.08); s.tone('triangle', 1290, 1270, 0.35, 0.15); s.noise('highpass', 3000, 3000, 0.05, 0.4); } },
  hurt:    { vol: 0.8, make: (o, s) => { s.tone('sine', 120, 50, 0.22, 0.8); s.noise('lowpass', 700, 200, 0.14, 0.5); } },
  growl:   { vol: 0.7, make: (o, s) => { s.tone('sawtooth', r(70, 90), 55, 0.45, 0.18); s.noise('bandpass', 260, 180, 0.45, 0.5, 3); } },
  groan:   { vol: 0.7, make: (o, s) => { s.tone('sawtooth', r(95, 115), 70, 0.6, 0.12); s.noise('bandpass', 500, 300, 0.6, 0.35, 5); } },
  bite:    { vol: 0.8, make: (o, s) => { s.noise('bandpass', 1000, 600, 0.07, 0.7, 2); s.tone('sine', 220, 80, 0.08, 0.4); } },
  bow:     { vol: 0.6, make: (o, s) => { s.tone('triangle', 900, 260, 0.13, 0.35); s.noise('highpass', 2500, 1500, 0.08, 0.3); } },
  push:    { vol: 1.0, make: (o, s) => { for (const f of [110, 164, 220]) s.tone('sawtooth', f, f * 0.8, 0.65, 0.15); s.noise('lowpass', 500, 2400, 0.7, 0.7, 0.8); } },
  slowTime: { vol: 0.9, make: (o, s) => { s.tone('sine', 330, 110, 1.4, 0.4); s.tone('sine', 495, 165, 1.4, 0.25); s.noise('bandpass', 800, 200, 1.2, 0.25, 2); } },
  fireBreath: { vol: 1.0, make: (o, s) => { s.noise('bandpass', 400, 1600, 0.9, 0.8, 0.7); s.tone('sawtooth', 95, 70, 0.7, 0.12); } },
  iceForm: { vol: 0.9, make: (o, s) => { s.noise('highpass', 6000, 2000, 0.9, 0.5, 0.7); s.tone('sine', 1760, 880, 0.9, 0.12); s.tone('triangle', 220, 160, 0.8, 0.25); } },
  fire:    { vol: 0.7, make: (o, s) => s.noise('bandpass', r(500, 800), r(900, 1300), 0.32, 0.5, 0.8) },
  roar:    { vol: 1.0, make: (o, s) => { s.noise('lowpass', 250, 900, 0.5, 0.9, 1.5); s.noise('lowpass', 900, 180, 1.4, 0.9, 1.5, 0.45); s.tone('sawtooth', 70, 42, 1.8, 0.25); } },
  thud:    { vol: 1.0, make: (o, s) => { s.tone('sine', 70, 30, 0.6, 0.9); s.noise('lowpass', 400, 80, 0.5, 0.8); } },
  chest:   { vol: 0.7, make: (o, s) => { s.tone('triangle', 170, 260, 0.35, 0.2); s.tone('sine', 90, 50, 0.15, 0.5, 0.3); } },
  coin:    { vol: 0.5, make: (o, s) => { s.tone('triangle', 1300, 1300, 0.12, 0.3); s.tone('triangle', 1750, 1750, 0.2, 0.25, 0.07); } },
  door:    { vol: 0.7, make: (o, s) => { s.tone('sine', 80, 45, 0.35, 0.7); s.noise('lowpass', 500, 150, 0.3, 0.4); } },
  levelUp: { vol: 0.6, make: (o, s) => { for (const [f, d] of [[660, 0], [990, 0.05], [1320, 0.1]]) s.tone('sine', f, f, 1.2, 0.3, d); } },
  quest:   { vol: 0.6, make: (o, s) => { [392, 494, 587, 784].forEach((f, i) => s.tone('triangle', f, f, 0.5, 0.3, i * 0.13)); } },
  questStart: { vol: 0.5, make: (o, s) => { s.tone('triangle', 440, 440, 0.4, 0.25); s.tone('triangle', 587, 587, 0.6, 0.25, 0.15); } },
  word:    { vol: 0.8, make: (o, s) => { s.tone('sine', 110, 110, 2.2, 0.3); s.tone('sine', 165, 165, 2.2, 0.2); s.noise('bandpass', 300, 1200, 2, 0.25, 3); } },
  step:    { vol: 0.35, make: (o, s) => s.noise('lowpass', r(700, 1100), 300, 0.07, 0.5, 1) },
  death:   { vol: 0.8, make: (o, s) => { s.tone('sine', 110, 35, 1.2, 0.6); s.noise('lowpass', 500, 100, 0.8, 0.4); } },
};

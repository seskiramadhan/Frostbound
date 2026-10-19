// Raids on Riverholt. The player starts one (village bell, or the Jarl's "Defend" job); after a
// warning, 4 waves march in from the forest along lanes. Raiders break barricades and fight
// guards and players. Win: every wave cleared. Lose: every barricade broken, or everyone down.
// All units are made at startup (fixed entity ids for co-op) and reused. The host runs the raid;
// guests mirror the units and follow the phases from 'raid' events.
// Emits 'raid' { data: { phase: 'warning' | 'wave' | 'cleared' | 'won' | 'lost', wave, level } }.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Creature } from '../entities/creature.js';
import { Barricade } from '../world/defenses.js';

const R = CONFIG.raid;

export class Raid {
  constructor(scene, valley, events, entities) {
    this.events = events;
    this.valley = valley;
    this.center = new THREE.Vector3(R.center[0], valley.heightAt(...R.center), R.center[1]);
    this.barricades = R.lanes.map(l => entities.add(new Barricade(scene, valley, ...l.barricade)));
    const make = (cfg, n, home, pack) => Array.from({ length: n }, () => {
      const c = entities.add(new Creature(scene, valley, events, entities, home, pack, { cfg, respawns: false, spread: 0 }));
      c.removeForGood();
      pack.push(c);
      return c;
    });
    const most = t => Math.max(...R.waves.map(w => w[t] ?? 0));
    const wolves = [], draugr = [], bandits = [];
    this.pool = {
      wolf: make({ ...R.raider }, most('wolf'), this.center, wolves),
      draugr: make({ ...CONFIG.draugr, ...R.raider }, most('draugr'), this.center, draugr),
      warlord: make({ ...CONFIG.draugr, ...R.warlord, ...R.raider }, most('warlord'), this.center, draugr),
      bandit: make({ ...CONFIG.bandit, ...R.raider }, most('bandit'), this.center, bandits),
      banditArcher: make({ ...CONFIG.bandit, ...CONFIG.banditArcher, ...R.raider }, most('banditArcher'), this.center, bandits),
    };
    this.raiders = Object.values(this.pool).flat();
    const guards = [];
    this.guards = R.guards.map(([x, z]) => make({ ...CONFIG.draugr, ...R.guard }, 1, new THREE.Vector3(x, 0, z), guards)[0]);
    this.phase = 'idle';
    this.wave = 0;
    this.timer = 0;
    this.level = 1;
    this.hideAt = 0;
  }

  get active() { return this.phase !== 'idle'; }
  get units() { return [...this.raiders, ...this.guards, ...this.barricades]; }
  get warlord() { return this.pool.warlord.find(c => c.alive) ?? null; }
  get barricadesUp() { return this.barricades.filter(b => b.alive).length; }
  raidersLeft() { return this.raiders.filter(c => c.alive).length; }

  nearestRaider(pos) {
    let best = null, bestD = Infinity;
    for (const c of this.raiders) {
      if (!c.alive) continue;
      const d = c.pos.distanceToSquared(pos);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  #emit(phase, extra = {}) {
    this.events.emit('raid', { data: { phase, wave: this.wave, level: this.level, ...extra } });
  }

  // Host / solo: begin the countdown. `level` is just the raid count (for the reward); how tough
  // the raiders are comes from enemy levels (each creature's onRespawn scales it).
  start(level) {
    if (this.active) return;
    this.level = level;
    this.wave = 0;
    this.phase = 'warning';
    this.timer = R.warning;
    this.hideAt = 0;
    for (const b of this.barricades) b.repair();      // villagers rebuild between raids
    for (const g of this.guards) this.#spawn(g, g.home);
    this.#emit('warning');
  }

  #spawn(c, at) {
    c.respawns = false;
    c.respawn();
    c.pos.set(at.x, this.valley.heightAt(at.x, at.z), at.z);
    c.prevPos.copy(c.pos);
    c.wanderTo.copy(c.pos);
    c.facing = c.prevFacing = Math.atan2(this.center.x - at.x, this.center.z - at.z);
  }

  #spawnWave(i) {
    this.wave = i;
    this.phase = 'wave';
    let lane = 0, n = 0;
    for (const [type, count] of Object.entries(R.waves[i])) {
      for (const c of this.pool[type].slice(0, count)) {
        const [x, z] = R.lanes[lane++ % R.lanes.length].spawn;
        this.#spawn(c, { x: x + (Math.random() - 0.5) * 4, z: z + (Math.random() - 0.5) * 4 });
        n++;
      }
    }
    this.#emit('wave', { count: n });
  }

  #finish(won) {
    this.phase = 'idle';
    for (const c of this.raiders) if (c.alive) c.removeForGood();   // survivors slip away with their loot
    this.hideAt = 4;                                                // guards go back inside a bit later
    this.#emit(won ? 'won' : 'lost');
  }

  // Host / solo, every fixed step. playersUp: is any player still standing?
  update(dt, playersUp) {
    if (this.hideAt > 0 && (this.hideAt -= dt) <= 0) for (const g of this.guards) g.removeForGood();
    if (!this.active) return;
    if (!this.barricadesUp || !playersUp) { this.#finish(false); return; }
    if (this.phase === 'warning' || this.phase === 'pause') {
      if ((this.timer -= dt) <= 0) this.#spawnWave(this.phase === 'warning' ? 0 : this.wave + 1);
    } else if (this.phase === 'wave' && !this.raidersLeft()) {
      if (this.wave >= R.waves.length - 1) this.#finish(true);
      else { this.phase = 'pause'; this.timer = R.wavePause; this.#emit('cleared'); }
    }
  }

  // Co-op guest: follow the host's phases.
  follow(data) {
    this.level = data.level ?? this.level;
    this.wave = data.wave ?? this.wave;
    this.phase = { warning: 'warning', wave: 'wave', cleared: 'pause' }[data.phase] ?? 'idle';
  }

  tick(dt) { for (const c of this.raiders) c.tick(dt); for (const g of this.guards) g.tick(dt); }

  render(alpha, dt) {
    for (const c of this.raiders) c.render(alpha);
    for (const g of this.guards) g.render(alpha);
    for (const b of this.barricades) b.render(dt);
  }
}

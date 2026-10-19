// Ground creatures (wolves, draugr) share one AI: wander -> chase -> windup -> strike ->
// recover, and give up (return home) when dragged too far. The look and animation come
// from a model module picked by cfg.body. Valley wolves respawn; dungeon creatures stay dead.
// A crouching player is noticed gradually (`notice` 0..1) instead of on sight.
// cfg.team / cfg.hunts turn the same AI into village guards (team 'player', hunting 'beast').
// Raiders (cfg.raider) march on their home (the village) and also attack barricades.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Flash, lerpAngle } from './model.js';
import * as wolfModel from './wolfModel.js';
import * as draugrModel from './draugrModel.js';
import { moveBody, pushOutOfColliders, settleOnGround, turnToward } from '../systems/physics.js';
import { mulberry32 } from '../world/noise.js';

const W = CONFIG.wolf, CB = CONFIG.combat, SN = CONFIG.sneak;
const rand = mulberry32(9001);
const range = ([a, b]) => a + rand() * (b - a);

const MODELS = { wolf: wolfModel, draugr: draugrModel };

export class Creature {
  // opts: { cfg (overrides on CONFIG.wolf), key (stable save id), respawns, spread }
  constructor(scene, level, events, entities, home, pack, opts = {}) {
    this.cfg = { ...W, ...opts.cfg };
    this.key = opts.key ?? null;
    this.respawns = opts.respawns ?? true;
    this.spread = opts.spread ?? this.cfg.packSpread;
    this.level = level;
    this.events = events;
    this.entities = entities;
    this.home = home;
    this.pack = pack;

    this.kind = this.cfg.body;     // 'wolf' | 'draugr'
    this.team = this.cfg.team ?? 'beast';
    this.hunts = this.cfg.hunts ?? 'player';
    this.name = this.cfg.name;
    this.radius = this.cfg.radius;
    this.maxHp = this.cfg.maxHealth;

    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.wanderTo = new THREE.Vector3();

    this.look = MODELS[this.cfg.body];
    this.model = this.look.build(this.cfg);
    this.flash = new Flash(this.model.root);
    scene.add(this.model.root, this.model.shadow);
    this.respawn();
  }

  respawn() {
    const a = rand() * Math.PI * 2, r = rand() * this.spread;
    const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
    this.pos.set(x, this.level.heightAt(x, z), z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.grounded = true;
    this.facing = rand() * Math.PI * 2;
    this.prevFacing = this.facing;
    this.hp = this.maxHp;
    this.alive = true;
    this.staggerTime = 0;
    this.target = null;
    this.notice = 0;
    this.state = 'wander';
    this.stateTime = 0;
    this.timer = range(this.cfg.wanderPause);
    this.wanderTo.copy(this.pos);
    this.walkPhase = 0;
    this.speed = 0;
    this.model.root.visible = this.model.shadow.visible = true;
  }

  get blocking() { return false; }
  // Not hunting anyone: open to a sneak attack. (State-based so co-op guests' mirrors agree.)
  get unaware() { return this.alive && (this.state === 'wander' || this.state === 'return'); }

  #setState(s, timer = 0) {
    this.state = s; this.stateTime = 0; this.timer = timer;
    if (s === 'bite') this.struck = false;
  }

  // Nearest living player within range; packmates share their quarry.
  // Sneaking players have to be noticed first.
  #acquire(dt) {
    const r = this.target ? this.cfg.loseRadius : this.cfg.detectRadius;
    let best = null, bestD = r * r, sneaker = null, sneakD = Infinity;
    for (const e of this.entities) {
      if (e.team !== this.hunts || !e.alive || e.level !== this.level) continue;
      if (e.kind === 'barricade' && !this.cfg.raider) continue;
      if (Math.abs(e.pos.y - this.pos.y) > 2.5) continue;      // out of reach (watchtower)
      const d = this.pos.distanceToSquared(e.pos);
      if (this.target === e) { if (d < bestD) { bestD = d; best = e; } continue; }
      if (d >= bestD || !this.level.lineOfSight(this.pos, e.pos)) continue;
      if (e.crouched) { if (d < sneakD) { sneakD = d; sneaker = e; } continue; }
      bestD = d; best = e;
    }
    if (!best && sneaker && this.#noticing(sneaker, Math.sqrt(sneakD), dt)) best = sneaker;
    else if (!sneaker) this.notice = Math.max(0, this.notice - SN.forget * dt);
    if (best) this.notice = 1;
    if (!best) {
      for (const m of this.pack) {
        const t = m !== this && m.alive && m.target;
        if (t && t.alive && t.level === this.level && this.pos.distanceToSquared(t.pos) < this.cfg.loseRadius * this.cfg.loseRadius) return t;
      }
    }
    return best;
  }

  // Grow awareness of a crouching player; true once fully noticed.
  #noticing(e, dist, dt) {
    const R = this.cfg.detectRadius * SN.radiusMul;
    if (dist < SN.touchRadius) this.notice = 1;
    else if (dist > R) this.notice = Math.max(0, this.notice - SN.forget * dt);
    else {
      const ahead = Math.abs(Math.atan2(Math.sin(Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z) - this.facing),
        Math.cos(Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z) - this.facing))) < 1.3;
      const rate = SN.noticeRate * (0.3 + 2 * (1 - dist / R)) * ((e.speed ?? 0) > 0.5 ? SN.movingMul : SN.stillMul)
        * (ahead ? 1 : SN.behindMul) * (this.level.ceiling ? SN.darkMul : 1) * (e.sneakMul ?? 1);
      this.notice = Math.min(1, this.notice + rate * dt);
    }
    return this.notice >= 1;
  }

  #mayAttack() {
    let busy = 0;
    for (const m of this.pack) if (m !== this && m.alive && (m.state === 'windup' || m.state === 'bite')) busy++;
    return busy < this.cfg.attackersAtOnce;
  }

  tick(dt) {
    this.prevPos.copy(this.pos);
    this.prevFacing = this.facing;
    this.flash.tick(dt);
    this.stateTime += dt;

    if (!this.alive) {
      if (this.stateTime > this.cfg.corpseTime) this.model.root.visible = this.model.shadow.visible = false;
      if (this.respawns && this.stateTime > this.cfg.respawnTime) this.respawn();
      return;
    }

    const homeD = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    if (this.state !== 'return') {
      this.target = this.#acquire(dt);
      if (homeD > this.cfg.leashRadius) { this.target = null; this.#setState('return'); }
    }

    let goal = null, speed = 0, face = null;
    const tgt = this.target;
    const toT = tgt ? Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) : Infinity;
    const faceT = tgt ? Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) : null;

    switch (this.state) {
      case 'wander':
        if (tgt) { this.#setState('chase'); break; }
        if (this.cfg.raider && homeD > 6) { goal = this.home; speed = this.cfg.marchSpeed; break; }   // march on the village
        this.hp = Math.min(this.maxHp, this.hp + this.cfg.healRate * dt);
        if (this.pos.distanceTo(this.wanderTo) > 0.8) { goal = this.wanderTo; speed = this.cfg.walkSpeed; }
        else if ((this.timer -= dt) <= 0) {
          const a = rand() * Math.PI * 2, r = rand() * this.cfg.wanderRadius;
          this.wanderTo.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          this.timer = range(this.cfg.wanderPause);
        }
        break;
      case 'chase':
        if (!tgt) { this.#setState('wander', 0); this.wanderTo.copy(this.pos); break; }
        if (toT < this.cfg.circleRange && !this.#mayAttack()) {   // wait for a turn, circling a little
          face = faceT;
          const side = this.id % 2 ? 1 : -1, a = faceT + side * Math.PI / 2;
          this.wanderTo.set(this.pos.x + Math.sin(a) * 2, 0, this.pos.z + Math.cos(a) * 2);
          if (toT < this.cfg.circleRange - 0.8) this.wanderTo.set(this.pos.x * 2 - tgt.pos.x, 0, this.pos.z * 2 - tgt.pos.z);
          goal = this.wanderTo; speed = this.cfg.walkSpeed;
          break;
        }
        if (toT < this.cfg.attackRange) { this.#setState('windup', range(this.cfg.windup)); break; }
        goal = tgt.pos; speed = this.cfg.runSpeed;
        break;
      case 'windup':
        face = faceT;
        if (!tgt) this.#setState('chase');
        else if (this.stateTime >= this.timer) this.#setState('bite');
        break;
      case 'bite':
        if (this.stateTime < this.cfg.biteAt) {
          this.vel.x = Math.sin(this.facing) * this.cfg.lungeSpeed;
          this.vel.z = Math.cos(this.facing) * this.cfg.lungeSpeed;
        } else if (!this.struck) {
          this.struck = true;
          this.events.emit('attack', { attacker: this, damage: this.cfg.biteDamage, reach: this.cfg.biteReach, arc: this.cfg.biteArc });
        }
        if (this.stateTime >= this.cfg.biteTime) this.#setState('recover', range(this.cfg.recover));
        break;
      case 'recover':
        face = faceT;
        if (tgt && toT < this.cfg.attackRange * 1.4) {   // back off a little before the next bite
          this.vel.x -= Math.sin(this.facing) * 4 * dt;
          this.vel.z -= Math.cos(this.facing) * 4 * dt;
        }
        if (this.stateTime >= this.timer) this.#setState('chase');
        break;
      case 'stagger':
        if (this.stateTime >= this.staggerTime) this.#setState('chase');
        break;
      case 'return':
        goal = this.home; speed = this.cfg.runSpeed;
        if (homeD < 3) { this.hp = this.maxHp; this.#setState('wander', range(this.cfg.wanderPause)); this.wanderTo.copy(this.pos); }
        break;
    }

    // Steer toward the goal
    let wx = 0, wz = 0;
    if (goal) {
      const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.01) { wx = dx / d * speed; wz = dz / d * speed; }
    }
    if (this.state !== 'bite') {
      const k = Math.min(1, this.cfg.accel * dt);
      this.vel.x += (wx - this.vel.x) * k;
      this.vel.z += (wz - this.vel.z) * k;
    }

    moveBody(this, this.vel.x * dt, this.vel.z * dt, this.level, this.cfg.maxClimb);
    pushOutOfColliders(this.pos, this.radius, this.level.colliders);
    this.level.clamp(this.pos);
    settleOnGround(this, dt, this.level, CB.jump.gravity);

    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (face === null && sp > 0.3 && this.state !== 'bite') face = Math.atan2(this.vel.x, this.vel.z);
    if (face !== null) this.facing = turnToward(this.facing, face, this.cfg.turnSpeed * dt);
    this.walkPhase += sp * dt * 2.6;
    this.speed = sp;
  }

  onHit({ attacker }) {
    this.flash.trigger();
    this.notice = 1;
    if (this.state === 'return') return;
    this.target = attacker;
    if (this.state !== 'bite') this.knockback(attacker.pos, CB.stagger.knockback, CB.stagger.enemy);
  }

  // Ice Form: frozen in place (a long stagger) with a frosty tint.
  freeze(time) {
    this.knockback(this.pos, 0, time);
    this.flash.trigger(0x3070ff);
  }

  // Shoved away from `from` (Unrelenting Force, sword hits) and staggered for `time`.
  knockback(from, force, time) {
    if (!this.alive) return;
    this.#setState('stagger');
    this.staggerTime = time;
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    this.vel.x = dx / d * force;
    this.vel.z = dz / d * force;
  }

  die() {
    this.alive = false;
    this.target = null;
    this.#setState('dead');
  }

  // Loaded from a save: already dead, body gone.
  removeForGood() {
    this.die();
    this.respawns = false;
    this.stateTime = this.cfg.corpseTime + 1;
    this.model.root.visible = this.model.shadow.visible = false;
  }

  render(alpha) {
    const { root, shadow } = this.model;
    if (!root.visible) return;
    const out = root.position.lerpVectors(this.prevPos, this.pos, alpha);
    root.rotation.y = lerpAngle(this.prevFacing, this.facing, alpha);
    this.look.animate(this.model, this);
    shadow.position.set(out.x, this.level.heightAt(out.x, out.z) + 0.05, out.z);
  }
}

// Place a pack at a walkable spot ~packDistance from the player's spawn.
export function spawnWolfPack(scene, terrain, events, entities) {
  const [sx, sz] = CONFIG.player.spawn;
  let home = null;
  for (let i = 0; i < 24 && !home; i++) {
    const a = 0.6 + i * 2.39996;           // golden-angle sweep
    const x = sx + Math.cos(a) * W.packDistance, z = sz + Math.sin(a) * W.packDistance;
    if (terrain.slopeAt(x, z) > 0.9 && terrain.heightAt(x, z) < CONFIG.props.treeMaxHeight) home = new THREE.Vector3(x, 0, z);
  }
  home ??= new THREE.Vector3(sx + W.packDistance, 0, sz);

  const pack = [];
  for (let i = 0; i < W.packSize; i++) {
    const w = new Creature(scene, terrain, events, entities, home, pack);
    entities.add(w);
    pack.push(w);
  }
  return pack;
}

// A dungeon's creatures from its map: each map letter names a config section
// (see Dungeon.spawns). Creatures sharing a letter form one pack. Returns all of them
// plus the boss (the one whose config has boss: true), if any.
export function spawnDungeonCreatures(scene, dungeon, events, entities) {
  const all = [];
  let boss = null;
  for (const [cfgKey, homes] of Object.entries(dungeon.spawns)) {
    const pack = [];
    const base = cfgKey === 'wolf' ? {} : CONFIG[cfgKey];
    homes.forEach((home, i) => {
      const c = entities.add(new Creature(scene, dungeon, events, entities, home, pack,
        { cfg: { ...base, ...CONFIG.dungeon.inside }, key: base.boss ? `${dungeon.key}.${base.saveKey}` : `${dungeon.key}.${cfgKey}${i}`,
          respawns: false, spread: 0 }));
      pack.push(c);
      all.push(c);
      if (base.boss) boss = c;
    });
  }
  return { creatures: all, boss };
}

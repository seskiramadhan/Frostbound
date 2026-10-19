// Wolves hunt in packs: wander -> chase -> windup -> bite -> recover, and give up
// (return home) when dragged too far. Dead wolves respawn at the den after a while.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { box, blobShadow, Flash, lerpAngle, clamp01 } from './model.js';
import { moveBody, pushOutOfColliders, clampToWorld, settleOnGround, turnToward } from '../systems/physics.js';
import { mulberry32 } from '../world/noise.js';

const W = CONFIG.wolf, CB = CONFIG.combat;
const rand = mulberry32(9001);
const range = ([a, b]) => a + rand() * (b - a);

function buildModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = 0x8c9096, light = 0xb9bec4, dark = 0x55595f;

  body.add(box(0.42, 0.42, 1.05, fur, 0, 0.78, -0.05));       // torso
  body.add(box(0.52, 0.52, 0.42, light, 0, 0.84, 0.32));      // ruff
  const tail = box(0.12, 0.12, 0.55, fur, 0, 0.86, -0.75);
  tail.rotation.x = 0.5;
  body.add(tail);

  const head = new THREE.Group(); head.position.set(0, 0.98, 0.55);
  head.add(box(0.34, 0.32, 0.36, fur, 0, 0, 0.12));
  head.add(box(0.2, 0.15, 0.28, dark, 0, -0.06, 0.4));         // snout
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), new THREE.MeshLambertMaterial({ color: dark, flatShading: true }));
    ear.position.set(s * 0.1, 0.22, 0.04);
    head.add(ear);
  }
  body.add(head);

  const legs = [[-0.14, 0.32], [0.14, 0.32], [-0.14, -0.4], [0.14, -0.4]].map(([x, z]) => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.62, z);
    pivot.add(box(0.12, 0.62, 0.13, dark, 0, -0.31, 0));
    body.add(pivot);
    return pivot;
  });

  return { root, body, head, legs, shadow: blobShadow(0.6) };
}

export class Wolf {
  constructor(scene, terrain, colliders, events, entities, home, pack) {
    this.terrain = terrain;
    this.colliders = colliders;
    this.events = events;
    this.entities = entities;
    this.home = home;
    this.pack = pack;

    this.kind = 'wolf';
    this.team = 'beast';
    this.name = W.name;
    this.radius = W.radius;
    this.maxHp = W.maxHealth;

    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.wanderTo = new THREE.Vector3();

    this.model = buildModel();
    this.flash = new Flash(this.model.root);
    scene.add(this.model.root, this.model.shadow);
    this.respawn();
  }

  respawn() {
    const a = rand() * Math.PI * 2, r = rand() * W.packSpread;
    const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
    this.pos.set(x, this.terrain.heightAt(x, z), z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.grounded = true;
    this.facing = rand() * Math.PI * 2;
    this.prevFacing = this.facing;
    this.hp = this.maxHp;
    this.alive = true;
    this.target = null;
    this.state = 'wander';
    this.stateTime = 0;
    this.timer = range(W.wanderPause);
    this.wanderTo.copy(this.pos);
    this.walkPhase = 0;
    this.speed = 0;
    this.model.root.visible = this.model.shadow.visible = true;
  }

  get blocking() { return false; }
  get invulnerable() { return false; }

  #setState(s, timer = 0) {
    this.state = s; this.stateTime = 0; this.timer = timer;
    if (s === 'bite') this.struck = false;
  }

  // Nearest living player within range; packmates share their quarry.
  #acquire() {
    const r = this.target ? W.loseRadius : W.detectRadius;
    let best = null, bestD = r * r;
    for (const e of this.entities) {
      if (e.team !== 'player' || !e.alive) continue;
      const d = this.pos.distanceToSquared(e.pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) {
      for (const m of this.pack) {
        const t = m !== this && m.alive && m.target;
        if (t && t.alive && this.pos.distanceToSquared(t.pos) < W.loseRadius * W.loseRadius) return t;
      }
    }
    return best;
  }

  #mayAttack() {
    let busy = 0;
    for (const m of this.pack) if (m !== this && m.alive && (m.state === 'windup' || m.state === 'bite')) busy++;
    return busy < W.attackersAtOnce;
  }

  tick(dt) {
    this.prevPos.copy(this.pos);
    this.prevFacing = this.facing;
    this.flash.tick(dt);
    this.stateTime += dt;

    if (!this.alive) {
      if (this.stateTime > W.corpseTime) this.model.root.visible = this.model.shadow.visible = false;
      if (this.stateTime > W.respawnTime) this.respawn();
      return;
    }

    const homeD = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    if (this.state !== 'return') {
      this.target = this.#acquire();
      if (homeD > W.leashRadius) { this.target = null; this.#setState('return'); }
    }

    let goal = null, speed = 0, face = null;
    const tgt = this.target;
    const toT = tgt ? Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) : Infinity;
    const faceT = tgt ? Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) : null;

    switch (this.state) {
      case 'wander':
        if (tgt) { this.#setState('chase'); break; }
        this.hp = Math.min(this.maxHp, this.hp + W.healRate * dt);
        if (this.pos.distanceTo(this.wanderTo) > 0.8) { goal = this.wanderTo; speed = W.walkSpeed; }
        else if ((this.timer -= dt) <= 0) {
          const a = rand() * Math.PI * 2, r = rand() * W.wanderRadius;
          this.wanderTo.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          this.timer = range(W.wanderPause);
        }
        break;
      case 'chase':
        if (!tgt) { this.#setState('wander', 0); this.wanderTo.copy(this.pos); break; }
        if (toT < W.circleRange && !this.#mayAttack()) {   // wait for a turn, circling a little
          face = faceT;
          const side = this.id % 2 ? 1 : -1, a = faceT + side * Math.PI / 2;
          this.wanderTo.set(this.pos.x + Math.sin(a) * 2, 0, this.pos.z + Math.cos(a) * 2);
          if (toT < W.circleRange - 0.8) this.wanderTo.set(this.pos.x * 2 - tgt.pos.x, 0, this.pos.z * 2 - tgt.pos.z);
          goal = this.wanderTo; speed = W.walkSpeed;
          break;
        }
        if (toT < W.attackRange) { this.#setState('windup', range(W.windup)); break; }
        goal = tgt.pos; speed = W.runSpeed;
        break;
      case 'windup':
        face = faceT;
        if (!tgt) this.#setState('chase');
        else if (this.stateTime >= this.timer) this.#setState('bite');
        break;
      case 'bite':
        if (this.stateTime < W.biteAt) {
          this.vel.x = Math.sin(this.facing) * W.lungeSpeed;
          this.vel.z = Math.cos(this.facing) * W.lungeSpeed;
        } else if (!this.struck) {
          this.struck = true;
          this.events.emit('attack', { attacker: this, damage: W.biteDamage, reach: W.biteReach, arc: W.biteArc });
        }
        if (this.stateTime >= W.biteTime) this.#setState('recover', range(W.recover));
        break;
      case 'recover':
        face = faceT;
        if (tgt && toT < W.attackRange * 1.4) {   // back off a little before the next bite
          this.vel.x -= Math.sin(this.facing) * 4 * dt;
          this.vel.z -= Math.cos(this.facing) * 4 * dt;
        }
        if (this.stateTime >= this.timer) this.#setState('chase');
        break;
      case 'stagger':
        if (this.stateTime >= CB.stagger.enemy) this.#setState('chase');
        break;
      case 'return':
        goal = this.home; speed = W.runSpeed;
        if (homeD < 3) { this.hp = this.maxHp; this.#setState('wander', range(W.wanderPause)); this.wanderTo.copy(this.pos); }
        break;
    }

    // Steer toward the goal
    let wx = 0, wz = 0;
    if (goal) {
      const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.01) { wx = dx / d * speed; wz = dz / d * speed; }
    }
    if (this.state !== 'bite') {
      const k = Math.min(1, W.accel * dt);
      this.vel.x += (wx - this.vel.x) * k;
      this.vel.z += (wz - this.vel.z) * k;
    }

    moveBody(this, this.vel.x * dt, this.vel.z * dt, this.terrain, W.maxClimb);
    pushOutOfColliders(this.pos, this.radius, this.colliders);
    clampToWorld(this.pos, this.terrain, CONFIG.player.worldMargin);
    settleOnGround(this, dt, this.terrain, CB.jump.gravity);

    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (face === null && sp > 0.3 && this.state !== 'bite') face = Math.atan2(this.vel.x, this.vel.z);
    if (face !== null) this.facing = turnToward(this.facing, face, W.turnSpeed * dt);
    this.walkPhase += sp * dt * 2.6;
    this.speed = sp;
  }

  onHit({ attacker }) {
    this.flash.trigger();
    if (this.state === 'return') return;
    this.target = attacker;
    if (this.state !== 'bite') this.#setState('stagger');
    const dx = this.pos.x - attacker.pos.x, dz = this.pos.z - attacker.pos.z, d = Math.hypot(dx, dz) || 1;
    this.vel.x = dx / d * CB.stagger.knockback;
    this.vel.z = dz / d * CB.stagger.knockback;
  }

  die() {
    this.alive = false;
    this.target = null;
    this.#setState('dead');
  }

  render(alpha) {
    const { root, body, head, legs, shadow } = this.model;
    if (!root.visible) return;
    const out = root.position.lerpVectors(this.prevPos, this.pos, alpha);
    root.rotation.y = lerpAngle(this.prevFacing, this.facing, alpha);

    const run = Math.min(1, this.speed / W.walkSpeed * 0.6);
    const s = Math.sin(this.walkPhase) * run * 0.6;
    legs[0].rotation.x = s; legs[3].rotation.x = s;
    legs[1].rotation.x = -s; legs[2].rotation.x = -s;
    body.rotation.set(0, 0, 0);
    body.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.04 * run;
    head.rotation.set(0, 0, 0);

    const t = this.stateTime;
    switch (this.state) {
      case 'windup':                       // crouch, head low: the tell
        body.position.y = -0.12 * clamp01(t / 0.2);
        body.rotation.x = 0.08;
        head.rotation.x = 0.35 * clamp01(t / 0.2);
        break;
      case 'bite':
        head.rotation.x = -0.4;
        body.rotation.x = -0.15;
        break;
      case 'stagger':
        body.rotation.z = Math.sin(t * 30) * 0.15 * (1 - clamp01(t / CB.stagger.enemy));
        break;
      case 'dead':
        body.rotation.z = Math.PI / 2 * clamp01(t / 0.4);
        body.position.y = 0.4 * clamp01(t / 0.4) - 0.1;
        break;
    }
    shadow.position.set(out.x, this.terrain.heightAt(out.x, out.z) + 0.05, out.z);
  }
}

// Place a pack at a walkable spot ~packDistance from the player's spawn.
export function spawnWolfPack(scene, terrain, colliders, events, entities) {
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
    const w = new Wolf(scene, terrain, colliders, events, entities, home, pack);
    entities.add(w);
    pack.push(w);
  }
  return pack;
}

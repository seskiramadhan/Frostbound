// The player: low-poly Nord with a sword, camera-relative movement on the current level (valley or dungeon).
// States: move, block, attack, stagger, dead. Driven by one command object per tick.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { box, blobShadow, Flash, lerpAngle, lerp, clamp01 } from './model.js';
import { moveBody, pushOutOfColliders, settleOnGround, turnToward } from '../systems/physics.js';
import { inArc } from '../systems/combat.js';

const P = CONFIG.player, S = CONFIG.stats, CB = CONFIG.combat;
const A = CB.attack, B = CB.block, J = CB.jump, AIM = CB.autoAim;

// Exported so co-op remote players can reuse the same look.
export function buildModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();   // bobs / leans
  root.add(body);

  // Legs pivot at the hip
  const legs = [-0.15, 0.15].map(x => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.85, 0);
    pivot.add(box(0.22, 0.85, 0.24, 0x3b2f26, 0, -0.42, 0));
    pivot.add(box(0.25, 0.18, 0.32, 0x2a211b, 0, -0.78, 0.04)); // boot
    body.add(pivot);
    return pivot;
  });

  const tunic = box(0.56, 0.7, 0.32, 0x6b4c34, 0, 1.2, 0);   // recoloured by armour
  body.add(tunic);
  body.add(box(0.6, 0.1, 0.36, 0x2e231b, 0, 0.92, 0));        // belt
  body.add(box(0.66, 0.22, 0.4, 0x9a8f80, 0, 1.52, 0));       // fur mantle
  body.add(box(0.6, 0.85, 0.06, 0x4a5560, 0, 1.12, -0.2));    // cloak
  body.add(box(0.3, 0.3, 0.3, 0xd9b08c, 0, 1.8, 0));          // head
  body.add(box(0.34, 0.16, 0.34, 0x7d838c, 0, 1.95, 0));      // helmet
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), new THREE.MeshLambertMaterial({ color: 0xe8dcc0, flatShading: true }));
    horn.position.set(s * 0.2, 2.0, 0); horn.rotation.z = -s * 1.0;
    body.add(horn);
  }

  // Arms pivot at the shoulder. Model faces +z, so arms[0] (-x) is the right arm.
  const arms = [-0.38, 0.38].map(x => {
    const pivot = new THREE.Group(); pivot.position.set(x, 1.5, 0);
    pivot.add(box(0.17, 0.62, 0.2, 0x6b4c34, 0, -0.3, 0));     // sleeve
    pivot.add(box(0.15, 0.14, 0.16, 0xd9b08c, 0, -0.66, 0)); // hand
    body.add(pivot);
    return pivot;
  });

  // Sword in the right hand, blade pointing along the arm
  const sword = new THREE.Group();
  sword.add(box(0.06, 0.08, 0.06, 0x8a7a50, 0, -0.62, 0));    // pommel
  sword.add(box(0.05, 0.2, 0.05, 0x3a2a1e, 0, -0.72, 0));     // grip
  sword.add(box(0.3, 0.05, 0.08, 0x8a7a50, 0, -0.84, 0));     // crossguard
  const blade = box(0.08, 1, 0.03, 0xc9d0d8, 0, -0.86, 0);   // scaled/recoloured per weapon
  blade.geometry.translate(0, -0.5, 0);
  sword.add(blade);
  arms[0].add(sword);

  const shadow = blobShadow(0.55);
  return { root, body, legs, arms, sword, blade, tunic, shadow };
}

export class Player {
  constructor(scene, level, events, entities) {
    this.level = level;
    this.events = events;
    this.entities = entities;

    this.kind = 'player';
    this.team = 'player';
    this.name = 'You';
    this.radius = P.radius;
    this.maxHp = S.maxHealth;
    this.maxStamina = S.maxStamina;

    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();

    this.model = buildModel();
    this.flash = new Flash(this.model.root);
    scene.add(this.model.root, this.model.shadow);
    // Set from equipment + skills by systems/stats.js
    this.attackDamage = A.damage;
    this.armor = 0;
    this.blockReduction = B.reduction;
    this.blockStaminaMul = 1;

    const [sx, sz] = P.spawn;
    this.respawn(level, new THREE.Vector3(sx, 0, sz), Math.PI);
  }

  // Place the player (full health) at `at` on `level`, facing `facing`.
  respawn(level, at, facing) {
    this.level = level;
    this.pos.set(at.x, level.heightAt(at.x, at.z), at.z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.grounded = true;
    this.facing = facing;           // radians, model faces +z at 0
    this.prevFacing = this.facing;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.alive = true;
    this.state = 'move';
    this.stateTime = 0;
    this.staggerTime = 0;
    this.attackBuffer = 0;
    this.attackFacing = 0;
    this.struck = false;
    this.staminaDelay = 0;
    this.sinceHit = 99;
    this.walkPhase = 0;
    this.speed = 0;
  }

  get blocking() { return this.state === 'block'; }
  get canRespawn() { return !this.alive && this.stateTime >= S.respawnDelay; }

  #setState(s) { this.state = s; this.stateTime = 0; }

  #spend(cost) {
    this.stamina = Math.max(0, this.stamina - cost);
    this.staminaDelay = S.staminaRegenDelay;
  }

  // Fixed-step update. cmd = { move: {x, y}, run, attack, block, jump }, yaw = camera yaw.
  tick(dt, cmd, yaw) {
    this.prevPos.copy(this.pos);
    this.prevFacing = this.facing;
    this.flash.tick(dt);
    this.stateTime += dt;

    if (!this.alive) {
      this.vel.set(0, 0, 0);
      settleOnGround(this, dt, this.level, J.gravity);
      return;
    }

    this.#regen(dt);
    this.attackBuffer = cmd.attack ? A.buffer : Math.max(0, this.attackBuffer - dt);

    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);   // camera forward on XZ
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);    // camera right
    const camFacing = Math.atan2(fx, fz);
    const mx = fx * cmd.move.y + rx * cmd.move.x;     // wanted direction (world, length 0..1)
    const mz = fz * cmd.move.y + rz * cmd.move.x;

    this.#advanceState();
    if (this.state === 'move' || this.state === 'block') this.#chooseAction(cmd, mx, mz, camFacing);

    let wx = 0, wz = 0, turnTo = null, turnSpeed = P.turnSpeed;
    switch (this.state) {
      case 'move': {
        const speed = cmd.run ? P.runSpeed : P.walkSpeed;
        wx = mx * speed; wz = mz * speed;
        break;
      }
      case 'block':
        wx = mx * P.walkSpeed * B.moveMul; wz = mz * P.walkSpeed * B.moveMul;
        turnTo = this.#autoAim(camFacing, B.faceRange, Math.PI);
        break;
      case 'attack':
        turnTo = this.attackFacing; turnSpeed = A.turnSpeed;
        break;
    }

    const k = Math.min(1, P.accel * (this.grounded ? 1 : P.airControl) * dt);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;

    moveBody(this, this.vel.x * dt, this.vel.z * dt, this.level, P.maxClimb);
    pushOutOfColliders(this.pos, this.radius, this.level.colliders);
    this.level.clamp(this.pos);
    settleOnGround(this, dt, this.level, J.gravity);

    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (turnTo === null && this.state === 'move' && sp > 0.2) turnTo = Math.atan2(this.vel.x, this.vel.z);
    if (turnTo !== null) this.facing = turnToward(this.facing, turnTo, turnSpeed * dt);
    this.walkPhase += sp * dt * 2.2;
    this.speed = sp;
  }

  // Timed state transitions.
  #advanceState() {
    const t = this.stateTime;
    if (this.state === 'attack') {
      if (!this.struck && t >= A.windup) {
        this.struck = true;
        this.vel.x += Math.sin(this.facing) * A.lunge;
        this.vel.z += Math.cos(this.facing) * A.lunge;
        this.events.emit('attack', { attacker: this, damage: this.attackDamage, reach: A.reach, arc: A.arc });
      }
      if (t >= A.windup + A.recover) this.#setState('move');
    } else if (this.state === 'stagger') {
      if (t >= this.staggerTime) this.#setState('move');
    }
  }

  // From move/block: start an attack or jump, else settle on move/block.
  #chooseAction(cmd, mx, mz, camFacing) {
    if (this.attackBuffer > 0 && this.grounded) {
      this.#spend(A.staminaCost);
      this.attackBuffer = 0;
      this.struck = false;
      const moving = Math.hypot(mx, mz) > 0.3;
      const base = moving ? Math.atan2(mx, mz) : camFacing;
      this.attackFacing = this.#autoAim(base, AIM.range, AIM.arc, null) ?? this.#autoAim(base, AIM.closeRange, Math.PI);
      this.#setState('attack');
      return;
    }
    if (cmd.jump && this.grounded && this.stamina >= J.staminaCost) {
      this.#spend(J.staminaCost);
      this.vy = J.velocity;
      this.grounded = false;
    }
    const want = cmd.block && this.grounded ? 'block' : 'move';
    if (want !== this.state) this.#setState(want);
  }

  // Snap the swing toward the nearest enemy roughly in front (helps a lot on phones).
  // Returns `fallback` when nothing is in range.
  #autoAim(base, range, arc, fallback = base) {
    const probe = { pos: this.pos, facing: base };
    let best = null, bestD = Infinity;
    for (const e of this.entities) {
      if (!e.alive || e.team === this.team) continue;
      if (!inArc(probe, e, range + e.radius, arc)) continue;
      const d = this.pos.distanceToSquared(e.pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best ? Math.atan2(best.pos.x - this.pos.x, best.pos.z - this.pos.z) : fallback;
  }

  #regen(dt) {
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0) {
      const mul = this.state === 'block' ? S.blockRegenMul : 1;
      this.stamina = Math.min(this.maxStamina, this.stamina + S.staminaRegen * mul * dt);
    }
    this.sinceHit += dt;
    if (this.sinceHit > S.healthRegenDelay) this.hp = Math.min(this.maxHp, this.hp + S.healthRegen * dt);
  }

  // Called by combat after damage is applied.
  onHit({ attacker, blocked }) {
    this.sinceHit = 0;
    if (blocked) {
      const cost = B.staminaPerHit * this.blockStaminaMul;
      const broke = this.stamina < cost;
      this.#spend(cost);
      if (broke) this.#stagger(attacker, CB.stagger.guardBreak);
      return;
    }
    this.flash.trigger();
    if (this.state !== 'attack') this.#stagger(attacker, CB.stagger.player);   // swings aren't interrupted
  }

  #stagger(attacker, time) {
    this.#setState('stagger');
    this.staggerTime = time;
    const dx = this.pos.x - attacker.pos.x, dz = this.pos.z - attacker.pos.z, d = Math.hypot(dx, dz) || 1;
    this.vel.x = dx / d * CB.stagger.knockback;
    this.vel.z = dz / d * CB.stagger.knockback;
  }

  // Armour takes a share of incoming damage (called by combat before applying it).
  mitigate(amount) { return amount * (1 - this.armor / 100); }

  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }

  // Teleport within/between levels without resetting health (doors).
  moveTo(level, at, facing) {
    this.level = level;
    this.pos.set(at.x, level.heightAt(at.x, at.z), at.z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.grounded = true;
    this.facing = this.prevFacing = facing;
    this.#setState('move');
  }

  setLook(weapon, armor) {
    const { blade, tunic } = this.model;
    blade.material.color.setHex(weapon.color);
    blade.scale.y = weapon.length;
    tunic.material.color.setHex(armor.color);
  }

  die() {
    this.alive = false;
    this.#setState('dead');
  }

  // Render-time: interpolate between fixed steps and animate.
  render(alpha, out) {
    out.lerpVectors(this.prevPos, this.pos, alpha);
    const { root, body, legs, arms, shadow } = this.model;
    root.position.copy(out);
    root.rotation.y = lerpAngle(this.prevFacing, this.facing, alpha);

    const walk = Math.min(1, this.speed / P.walkSpeed);
    const swing = Math.sin(this.walkPhase) * walk * 0.7;
    const [armR, armL] = arms;
    legs[0].rotation.set(swing, 0, 0); legs[1].rotation.set(-swing, 0, 0);
    armR.rotation.set(-0.45 - swing * 0.3, 0, 0);
    armL.rotation.set(swing * 0.8, 0, 0);
    body.rotation.set(0, 0, 0);
    body.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.05 * walk;

    const t = this.stateTime;
    switch (this.state) {
      case 'attack': {
        if (t < A.windup) {
          armR.rotation.x = lerp(-0.45, -2.7, clamp01(t / A.windup));
        } else {
          const k = clamp01((t - A.windup) / (A.recover * 0.35));
          const back = clamp01((t - A.windup - A.recover * 0.5) / (A.recover * 0.5));
          armR.rotation.x = lerp(lerp(-2.7, -1.0, 1 - (1 - k) * (1 - k)), -0.45, back);
          body.rotation.x = 0.18 * (1 - back);
        }
        break;
      }
      case 'block':
        armR.rotation.set(-1.4, 0, 0.8);
        armL.rotation.set(-1.1, 0, -0.5);
        break;
      case 'stagger':
        body.rotation.x = -0.35 * (1 - clamp01(t / this.staggerTime));
        break;
      case 'dead':
        body.rotation.x = -Math.PI / 2 * clamp01(t / 0.5);
        body.position.y = 0.2 * clamp01(t / 0.5);
        armR.rotation.x = -2.5; armL.rotation.x = -2.5;
        break;
    }
    if (!this.grounded) { legs[0].rotation.x = 0.6; legs[1].rotation.x = -0.2; }

    shadow.position.set(out.x, this.level.heightAt(out.x, out.z) + 0.05, out.z);
    return out;
  }
}

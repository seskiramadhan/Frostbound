// The player: low-poly Nord with a sword, camera-relative movement on the current level (valley or dungeon).
// States: move, block, attack, draw (bow), shot, cast (firebolt), flames, shout, stagger, dead.
// Driven by one command object per tick. Can crouch (sneak) in any state.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { box, blobShadow, Flash, lerpAngle, lerp, clamp01 } from './model.js';
import { moveBody, pushOutOfColliders, settleOnGround, turnToward } from '../systems/physics.js';
import { inArc } from '../systems/combat.js';

const P = CONFIG.player, S = CONFIG.stats, CB = CONFIG.combat;
const A = CB.attack, B = CB.block, J = CB.jump, AIM = CB.autoAim, BW = CONFIG.bow, SN = CONFIG.sneak, MG = CONFIG.magic;

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

  // Hunting bow in the left hand (shown in bow mode). Grip at the hand, limbs along local z.
  const bow = new THREE.Group();
  bow.position.set(0, -0.68, 0);
  bow.rotation.y = Math.PI / 2;
  const R = 0.6, ARC = Math.PI * 0.75;
  const limbs = new THREE.Mesh(new THREE.TorusGeometry(R, 0.035, 4, 10, ARC), new THREE.MeshLambertMaterial({ color: 0x6a4a2a, flatShading: true }));
  limbs.rotation.z = -Math.PI / 2 - ARC / 2;
  limbs.position.y = R;
  bow.add(limbs);
  bow.add(box(2 * R * Math.sin(ARC / 2), 0.012, 0.012, 0xe8e0c8, 0, R - R * Math.cos(ARC / 2), 0));   // string
  bow.visible = false;
  arms[1].add(bow);

  // Fire in the left hand (spell mode)
  const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
  flame.position.set(0, -0.8, 0.05);
  flame.visible = false;
  arms[1].add(flame);

  const shadow = blobShadow(0.55);
  return { root, body, legs, arms, sword, blade, tunic, bow, flame, shadow };
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
    this.maxMagicka = S.maxMagicka;

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
    this.bowDamage = 0;
    this.hasBow = false;
    this.bowMode = false;
    this.knowsFire = false;     // read the fire spell tome
    this.spellMode = false;     // fire in the left hand: tap = Firebolt, hold = Flames
    this.spellCostMul = 1;
    this.fireDamage = MG.firebolt.damage;
    this.sneakMul = 1;          // < 1 with Sneak skill: enemies notice you slower
    this.crouched = false;
    this.aimHeight = 1.2;

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
    this.magicka = this.maxMagicka;
    this.magickaDelay = 0;
    this.crouched = false;
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

  // Can a shout start now? (main checks the shout cooldown separately)
  get canShout() { return this.alive && ['move', 'block', 'draw'].includes(this.state); }
  startShout(base) {
    this.facing = this.prevFacing = this.#autoAim(base, 10, 1.0);   // turn to the nearest enemy roughly ahead
    this.drawTime = 0;
    this.#setState('shout');
  }

  // Pay magicka for a spell. Returns false if there isn't enough.
  #cast(cost) {
    if (this.magicka < cost) { this.events.emit('noMagicka'); return false; }
    this.magicka -= cost;
    this.magickaDelay = S.magickaRegenDelay;
    return true;
  }

  #spend(cost) {
    this.stamina = Math.max(0, this.stamina - cost);
    this.staminaDelay = S.staminaRegenDelay;
  }

  // Fixed-step update. cmd = { move: {x, y}, run, attack, block, draw, jump, toggleBow, crouch }, yaw = camera yaw.
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

    if (cmd.crouch) { this.crouched = !this.crouched; this.events.emit('crouch', { crouched: this.crouched }); }
    if (cmd.toggleBow && ['move', 'block'].includes(this.state)) this.#nextMode();
    this.#advanceState();
    if (this.state === 'draw') {
      this.drawTime += dt;
      if (!cmd.draw) this.#shoot(this.drawTime);
    } else if (this.state === 'flames') {
      this.magicka = Math.max(0, this.magicka - MG.flames.costPerSec * this.spellCostMul * dt);
      this.magickaDelay = S.magickaRegenDelay;
      if (!cmd.draw || this.magicka <= 0) this.#setState('move');
    }
    if (this.state === 'move' || this.state === 'block') this.#chooseAction(cmd, mx, mz, camFacing);

    let wx = 0, wz = 0, turnTo = null, turnSpeed = P.turnSpeed;
    switch (this.state) {
      case 'move': {
        const speed = this.crouched ? P.walkSpeed * SN.speedMul : cmd.run ? P.runSpeed : P.walkSpeed;
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
      case 'draw':
      case 'flames':
        wx = mx * P.walkSpeed * BW.moveMul; wz = mz * P.walkSpeed * BW.moveMul;
        turnTo = camFacing; turnSpeed = A.turnSpeed;
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
    } else if (this.state === 'shot') {
      if (t >= 0.25) this.#setState('move');
    } else if (this.state === 'cast') {
      if (t >= MG.castTime) this.#setState('move');
    } else if (this.state === 'shout') {
      if (t >= 0.5) this.#setState('move');
    }
  }

  // Release an arrow. Power grows with draw time; main.js aims it and spawns the projectile.
  #shoot(drawTime) {
    const k = Math.min(1, Math.max(0, (drawTime - BW.minDraw) / (BW.fullDraw - BW.minDraw)));
    const power = BW.minPower + (1 - BW.minPower) * k;
    this.events.emit('shootArrow', { shooter: this, power, damage: this.bowDamage * power });
    this.#setState('shot');
  }

  // Sword -> bow -> fire -> sword, skipping what you don't have.
  #nextMode() {
    const modes = ['sword', ...(this.hasBow ? ['bow'] : []), ...(this.knowsFire ? ['spell'] : [])];
    if (modes.length < 2) return;
    const cur = this.bowMode ? 'bow' : this.spellMode ? 'spell' : 'sword';
    const next = modes[(modes.indexOf(cur) + 1) % modes.length];
    this.bowMode = next === 'bow';
    this.spellMode = next === 'spell';
    this.events.emit('bowToggled', { bowMode: this.bowMode, spellMode: this.spellMode });
  }

  // From move/block: start an attack or jump, else settle on move/block.
  #chooseAction(cmd, mx, mz, camFacing) {
    if (this.spellMode) {
      if (cmd.draw && this.grounded && this.magicka > 1) { this.#setState('flames'); return; }
      if (this.attackBuffer > 0 && this.grounded) {
        this.attackBuffer = 0;
        if (this.#cast(MG.firebolt.cost * this.spellCostMul)) {
          this.facing = this.prevFacing = this.#autoAim(camFacing, 12, 0.6);
          this.events.emit('castBolt', { caster: this, damage: this.fireDamage });
          this.#setState('cast');
          return;
        }
      }
    } else if (this.bowMode) {
      if (cmd.draw && this.grounded) { this.drawTime = 0; this.#setState('draw'); return; }
      if (this.attackBuffer > 0 && this.grounded) { this.attackBuffer = 0; this.#shoot(0); return; }   // quick tap
    } else if (this.attackBuffer > 0 && this.grounded) {
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
    const want = cmd.block && this.grounded && !this.bowMode && !this.spellMode ? 'block' : 'move';
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
    if ((this.magickaDelay -= dt) <= 0) this.magicka = Math.min(this.maxMagicka, this.magicka + S.magickaRegen * dt);
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

  setLook(weapon, armor) { applyLook(this.model, weapon, armor); }

  die() {
    this.alive = false;
    this.#setState('dead');
  }

  // Render-time: interpolate between fixed steps and animate.
  render(alpha, out) {
    out.lerpVectors(this.prevPos, this.pos, alpha);
    const { root, shadow } = this.model;
    root.position.copy(out);
    root.rotation.y = lerpAngle(this.prevFacing, this.facing, alpha);

    animate(this.model, this);

    shadow.position.set(out.x, this.level.heightAt(out.x, out.z) + 0.05, out.z);
    return out;
  }
}

// Pose the model for a frame. `s` needs: speed, walkPhase, bowMode, spellMode, crouched, state,
// stateTime, drawTime, staggerTime, grounded. Shared with co-op remote players.
export function animate(model, s) {
  const { body, legs, arms } = model;
  const walk = Math.min(1, s.speed / P.walkSpeed);
  const swing = Math.sin(s.walkPhase) * walk * 0.7;
  const [armR, armL] = arms;
  legs[0].rotation.set(swing, 0, 0); legs[1].rotation.set(-swing, 0, 0);
  armR.rotation.set(-0.45 - swing * 0.3, 0, 0);
  armL.rotation.set(swing * 0.8, 0, 0);
  body.rotation.set(0, 0, 0);
  body.position.y = Math.abs(Math.cos(s.walkPhase)) * 0.05 * walk;

  model.sword.visible = !s.bowMode;
  model.bow.visible = s.bowMode;
  model.flame.visible = !!s.spellMode;
  if (s.spellMode) model.flame.rotation.y += 0.15;
  if (s.bowMode && s.state !== 'draw' && s.state !== 'shot') armL.rotation.x = -0.5 + swing * 0.4;

  const t = s.stateTime;
  switch (s.state) {
    case 'draw': {
      const k = clamp01(s.drawTime / BW.fullDraw);
      armL.rotation.set(-1.55, 0, -0.15);                     // bow arm straight out
      armR.rotation.set(-1.45, 0, lerp(-0.2, -1.1, k));       // string hand pulled back
      body.rotation.y = -0.25;
      break;
    }
    case 'shot':
      armL.rotation.set(-1.55, 0, -0.15);
      armR.rotation.set(-1.2, 0, -0.3);
      break;
    case 'flames':                                            // fire hand held out, flickering
      armL.rotation.set(-1.5 + Math.sin(t * 30) * 0.04, 0, -0.1);
      break;
    case 'cast': {                                            // throw the firebolt
      const k = Math.sin(clamp01(t / MG.castTime) * Math.PI);
      armL.rotation.set(-0.4 - 1.2 * k, 0, -0.1);
      body.rotation.y = 0.2 * k;
      break;
    }
    case 'shout': {
      const k = Math.sin(clamp01(t / 0.5) * Math.PI);
      body.rotation.x = 0.35 * k;
      armR.rotation.set(0.6 * k, 0, 0.5 * k);
      armL.rotation.set(0.6 * k, 0, -0.5 * k);
      break;
    }
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
      body.rotation.x = -0.35 * (1 - clamp01(t / s.staggerTime));
      break;
    case 'dead':
      body.rotation.x = -Math.PI / 2 * clamp01(t / 0.5);
      body.position.y = 0.2 * clamp01(t / 0.5);
      armR.rotation.x = -2.5; armL.rotation.x = -2.5;
      break;
  }
  if (!s.grounded) { legs[0].rotation.x = 0.6; legs[1].rotation.x = -0.2; }
  if (s.crouched && s.state !== 'dead') {                     // sneaking: low, leaning in, knees bent
    body.position.y -= 0.32;
    body.rotation.x += 0.3;
    legs[0].rotation.x -= 0.9; legs[1].rotation.x -= 0.9;
  }

}

// Recolour/resize the sword blade and tunic for the equipped gear.
export function applyLook({ blade, tunic }, weapon, armor) {
  blade.material.color.setHex(weapon.color);
  blade.scale.y = weapon.length;
  tunic.material.color.setHex(armor.color);
}

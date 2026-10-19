// Resolves 'attack' events into hits: distance + swing arc, frontal block.
// Emits 'damage', 'blocked' and 'death' (each with `source`: melee | arrow | shout | fire),
// and 'sneakAttack' when a crouching player hits an enemy that hasn't noticed them.
// Also 'areaAttack': everything hostile within a radius of a point. In co-op only the host runs this.
import { CONFIG } from '../config.js';

const B = CONFIG.combat.block, SN = CONFIG.sneak;

// Is `b` within `reach` of `a` and inside a's facing arc (half-angle, radians)?
export function inArc(a, b, reach, arc) {
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > reach || Math.abs(b.pos.y - a.pos.y) > 2) return false;
  if (d < 0.01) return true;
  const fx = Math.sin(a.facing), fz = Math.cos(a.facing);
  return Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d))) <= arc;
}

export class Combat {
  constructor(events, entities) {
    this.events = events;
    this.entities = entities;
    this.enemyDamageScale = 1;   // co-op host: < 1 so enemies take more hits with more players
    this.forwardHit = null;      // co-op guest: (target, damage, source) => send to the host instead
    events.on('attack', a => this.#resolve(a));
    events.on('areaAttack', a => this.#resolveArea(a));
  }

  #resolve({ attacker, damage, reach, arc }) {
    for (const t of this.entities) {
      if (t === attacker || !t.alive || t.team === attacker.team) continue;
      if (inArc(attacker, t, reach + t.radius, arc)) this.applyHit(attacker, t, damage);
    }
  }

  // { attacker, x, y, z, radius, damage }: ground-level blast (dragon fire, tail sweep).
  #resolveArea({ attacker, x, y, z, radius, damage }) {
    for (const t of this.entities) {
      if (t === attacker || !t.alive || t.team === attacker.team) continue;
      if (Math.abs(t.pos.y - y) > 3) continue;
      if (Math.hypot(t.pos.x - x, t.pos.z - z) <= radius + t.radius) this.applyHit(attacker, t, damage);
    }
  }

  applyHit(attacker, target, damage, source = 'melee') {
    const ev = this.events;
    // Sneak attack (a co-op guest already multiplied its own hit before sending it)
    if (attacker.crouched && !attacker.remote && target.unaware && SN.attackMul[source]) {
      const mul = SN.attackMul[source] * (attacker.sneakAttackMul ?? 1);
      damage *= mul;
      ev.emit('sneakAttack', { attacker, target, mul });
    }
    if (this.forwardHit && target.team !== 'player') {          // co-op guest: the host decides
      this.forwardHit(target, damage, source);
      ev.emit('damage', { target, attacker, amount: damage, source, forwarded: true });
      return;
    }
    const blocked = !!target.blocking && inArc(target, attacker, Infinity, B.arc);
    if (target.remote) { target.hurt(damage, blocked, attacker); return; }   // another player: their game applies it
    if (target.team !== 'player') damage *= this.enemyDamageScale;
    let amount = blocked ? damage * (1 - (target.blockReduction ?? B.reduction)) : damage;
    if (target.mitigate) amount = target.mitigate(amount);
    target.hp = Math.max(0, target.hp - amount);
    target.onHit({ amount, attacker, blocked });
    ev.emit(blocked ? 'blocked' : 'damage', { target, attacker, amount, source });

    if (target.hp <= 0) {
      target.die(attacker);
      ev.emit('death', { target, killer: attacker, source });
    }
  }
}

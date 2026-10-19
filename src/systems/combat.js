// Resolves 'attack' events into hits: distance + swing arc, frontal block.
// Emits 'damage', 'blocked' and 'death'. In co-op only the host runs this.
import { CONFIG } from '../config.js';

const B = CONFIG.combat.block;

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
    events.on('attack', a => this.#resolve(a));
  }

  #resolve({ attacker, damage, reach, arc }) {
    for (const t of this.entities) {
      if (t === attacker || !t.alive || t.team === attacker.team) continue;
      if (inArc(attacker, t, reach + t.radius, arc)) this.applyHit(attacker, t, damage);
    }
  }

  applyHit(attacker, target, damage) {
    const ev = this.events;
    const blocked = !!target.blocking && inArc(target, attacker, Infinity, B.arc);
    let amount = blocked ? damage * (1 - (target.blockReduction ?? B.reduction)) : damage;
    if (target.mitigate) amount = target.mitigate(amount);
    target.hp = Math.max(0, target.hp - amount);
    target.onHit({ amount, attacker, blocked });
    ev.emit(blocked ? 'blocked' : 'damage', { target, attacker, amount });

    if (target.hp <= 0) {
      target.die(attacker);
      ev.emit('death', { target, killer: attacker });
    }
  }
}

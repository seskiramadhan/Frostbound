// Shouts (Thu'um): learned at word walls and from dragon souls. One shout is selected;
// using it starts that shout's cooldown. Slow Time scales enemy time (never players).
// Emits 'shoutLearned' { id, def } and 'shout' { id, def }.
import { CONFIG } from '../config.js';
import { inArc } from './combat.js';

const SH = CONFIG.shouts;
export const SHOUT_IDS = ['push', 'slowTime', 'fireBreath'];

export class Shouts {
  constructor(events, entities, combat, fx) {
    this.events = events;
    this.entities = entities;
    this.combat = combat;
    this.fx = fx;
    this.reset();
  }

  reset() {
    this.known = new Set();
    this.selected = null;
    this.cooldown = 0;       // seconds left
    this.cooldownMax = 1;
    this.slowLeft = 0;
  }

  get timeScale() { return this.slowLeft > 0 ? SH.slowTime.scale : 1; }
  get ready() { return !!this.selected && this.cooldown <= 0; }

  learn(id, quiet = false) {
    if (this.known.has(id)) return;
    this.known.add(id);
    this.selected ??= id;
    if (!quiet) { this.selected = id; this.events.emit('shoutLearned', { id, def: SH[id] }); }
  }

  select(id) { if (this.known.has(id)) this.selected = id; }

  // Returns true if a shout went off.
  use(player) {
    if (!this.ready || !player.alive) return false;
    const id = this.selected, def = SH[id];
    this.cooldown = this.cooldownMax = def.cooldown;
    if (id === 'push') this.#push(player, def);
    else if (id === 'fireBreath') this.#fire(player, def);
    else if (id === 'slowTime') this.slowLeft = def.duration;
    this.events.emit('shout', { id, def });
    return true;
  }

  #targets(player) {
    const out = [];
    for (const e of this.entities) if (e.alive && e.team !== player.team && e.level === player.level) out.push(e);
    return out;
  }

  #push(player, def) {
    this.fx.shout(player.pos, player.facing, def.range);
    for (const e of this.#targets(player)) {
      if (e.flying) {                         // a dragon in the air: reach further, ignore height
        const probe = { pos: { x: player.pos.x, y: e.pos.y, z: player.pos.z }, facing: player.facing };
        if (inArc(probe, e, def.range * 3, def.arc * 1.3)) e.forceDown?.();
        continue;
      }
      if (!inArc(player, e, def.range + e.radius, def.arc)) continue;
      this.combat.applyHit(player, e, def.damage, 'shout');
      if (e.alive) e.knockback?.(player.pos, def.force, def.stagger);
    }
  }

  #fire(player, def) {
    const f = player.facing, dir = { x: Math.sin(f), y: -0.05, z: Math.cos(f) };
    this.fx.fire({ x: player.pos.x + dir.x, y: player.pos.y + 1.6, z: player.pos.z + dir.z }, dir, def.range, 60);
    for (const e of this.#targets(player)) {
      if (inArc(player, e, def.range + e.radius, def.arc)) this.combat.applyHit(player, e, def.damage, 'shout');
    }
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.slowLeft > 0) this.slowLeft = Math.max(0, this.slowLeft - dt);
  }

  toJSON() { return { known: [...this.known], selected: this.selected }; }

  load(data) {
    if (!data) return;
    for (const id of data.known ?? []) if (SH[id]) this.learn(id, true);
    if (data.selected) this.select(data.selected);
  }
}

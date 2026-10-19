// Sneak: the stealth meter (how close nearby enemies are to noticing you), Sneak XP for
// creeping around unaware enemies, and witnesses when stealing in the village.
// The noticing itself happens in each creature's AI (entities/creature.js).
import { CONFIG } from '../config.js';

const K = CONFIG.skills.sneak, ST = CONFIG.steal;

export class Stealth {
  // isGuest(): co-op guest (enemies are mirrors without targets; judge by their state)
  constructor(player, creatures, skills, isGuest) {
    this.player = player;
    this.creatures = creatures;
    this.skills = skills;
    this.isGuest = isGuest;
    this.notice = 0;        // 0 hidden .. 1 detected (meter)
    this.detected = false;
  }

  update(dt) {
    const p = this.player;
    this.notice = 0;
    this.detected = false;
    if (!p.crouched || !p.alive) return;
    let near = false;
    for (const c of this.creatures) {
      if (!c.alive || c.level !== p.level) continue;
      const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
      const hunting = this.isGuest() ? !c.unaware && d < c.cfg.loseRadius : c.target === p;
      if (hunting) { this.detected = true; continue; }
      if (d < c.cfg.detectRadius) { near = true; this.notice = Math.max(this.notice, this.isGuest() ? 0 : c.notice); }
    }
    if (this.detected) this.notice = 1;
    else if (near) this.skills.addXp('sneak', K.xpPerSecond * dt);   // creeping past enemies teaches Sneak
  }
}

// The villager who sees you take from a strongbox, or null.
// Standing: anyone close enough sees. Crouched: only someone near you who is facing you.
export function witness(npcs, player) {
  for (const n of npcs) {
    if (n.level !== player.level) continue;
    const dx = player.pos.x - n.pos.x, dz = player.pos.z - n.pos.z, d = Math.hypot(dx, dz);
    if (!player.crouched) { if (d < ST.seeRadius) return n; continue; }
    if (d > ST.seeRadiusCrouched * player.sneakMul) continue;
    const off = Math.atan2(dx, dz) - n.facing;
    if (Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) < ST.viewArc) return n;
  }
  return null;
}

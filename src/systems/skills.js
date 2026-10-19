// Learn by doing: skills gain XP from combat events and level up; maxing one unlocks its perk.
// Emits 'skillUp' { id, name, level } and 'perk' { id, perk }.
import { CONFIG } from '../config.js';

const K = CONFIG.skills;
export const SKILL_IDS = ['oneHanded', 'block'];

export function xpToNext(level) {
  return K.xpBase * K.xpGrowth ** (level - 1);
}

export class Skills {
  constructor(events, player) {
    this.events = events;
    this.reset();
    events.on('damage', ({ attacker }) => { if (attacker === player) this.addXp('oneHanded', K.oneHanded.xpPerHit); });
    events.on('blocked', ({ target }) => { if (target === player) this.addXp('block', K.block.xpPerBlock); });
  }

  reset() {
    this.data = {};
    for (const id of SKILL_IDS) this.data[id] = { level: 1, xp: 0 };
  }

  level(id) { return this.data[id].level; }
  maxed(id) { return this.data[id].level >= K.maxLevel; }
  progress(id) { return this.maxed(id) ? 1 : this.data[id].xp / xpToNext(this.data[id].level); }

  addXp(id, amount) {
    const s = this.data[id];
    if (s.level >= K.maxLevel) return;
    s.xp += amount;
    while (s.level < K.maxLevel && s.xp >= xpToNext(s.level)) {
      s.xp -= xpToNext(s.level);
      s.level++;
      this.events.emit('skillUp', { id, name: K[id].name, level: s.level });
      if (s.level >= K.maxLevel) { s.xp = 0; this.events.emit('perk', { id, perk: K[id].perk }); }
    }
  }

  toJSON() { return this.data; }

  load(data) {
    if (!data) return;
    for (const id of SKILL_IDS) if (data[id]) this.data[id] = { level: Math.min(K.maxLevel, data[id].level | 0 || 1), xp: +data[id].xp || 0 };
  }
}

// Push equipment + skill bonuses into the player's combat numbers.
export function applyStats(player, inventory, skills) {
  const I = CONFIG.items, B = CONFIG.combat.block;
  const weapon = I[inventory.equipped.weapon] ?? I.ironSword;
  const armor = I[inventory.equipped.armor] ?? I.clothes;
  const oh = K.oneHanded, bl = K.block;

  player.attackDamage = weapon.damage * (1 + oh.damagePerLevel * (skills.level('oneHanded') - 1))
    * (skills.maxed('oneHanded') ? oh.perk.damageMul : 1);
  player.armor = armor.armor;
  player.blockReduction = Math.min(0.95, B.reduction + bl.reductionPerLevel * (skills.level('block') - 1));
  player.blockStaminaMul = skills.maxed('block') ? bl.perk.staminaMul : 1;
  player.setLook(weapon, armor);
}

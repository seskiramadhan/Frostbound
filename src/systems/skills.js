// Learn by doing: skills gain XP from combat events and level up; maxing one unlocks its perk.
// Emits 'skillUp' { id, name, level } and 'perk' { id, perk }.
import { CONFIG } from '../config.js';

const K = CONFIG.skills;
export const SKILL_IDS = ['oneHanded', 'archery', 'block', 'destruction', 'sneak'];

export function xpToNext(level) {
  return K.xpBase * K.xpGrowth ** (level - 1);
}

export class Skills {
  constructor(events, player) {
    this.events = events;
    this.reset();
    events.on('damage', ({ attacker, source }) => {
      if (attacker !== player) return;
      if (source === 'melee') this.addXp('oneHanded', K.oneHanded.xpPerHit);
      else if (source === 'arrow') this.addXp('archery', K.archery.xpPerHit);
      else if (source === 'fire') this.addXp('destruction', K.destruction.xpPerHit);
    });
    events.on('sneakAttack', ({ attacker }) => { if (attacker === player) this.addXp('sneak', K.sneak.xpPerSneakAttack); });
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
  const oh = K.oneHanded, bl = K.block, ar = K.archery, de = K.destruction, sn = K.sneak, MG = CONFIG.magic;
  const bow = I[inventory.equipped.bow];

  player.attackDamage = weapon.damage * (1 + oh.damagePerLevel * (skills.level('oneHanded') - 1))
    * (skills.maxed('oneHanded') ? oh.perk.damageMul : 1);
  player.armor = armor.armor;
  player.blockReduction = Math.min(0.95, B.reduction + bl.reductionPerLevel * (skills.level('block') - 1));
  player.blockStaminaMul = skills.maxed('block') ? bl.perk.staminaMul : 1;
  player.hasBow = !!bow && inventory.count(inventory.equipped.bow) > 0;
  player.bowDamage = bow ? bow.damage * (1 + ar.damagePerLevel * (skills.level('archery') - 1))
    * (skills.maxed('archery') ? ar.perk.damageMul : 1) : 0;
  if (!player.hasBow) player.bowMode = false;
  const fireMul = 1 + de.damagePerLevel * (skills.level('destruction') - 1);
  player.fireDamage = MG.firebolt.damage * fireMul;
  player.flamesDamage = MG.flames.damagePerSec * fireMul;
  player.spellCostMul = skills.maxed('destruction') ? de.perk.costMul : 1;
  if (!player.knowsFire) player.spellMode = false;
  player.sneakMul = 1 - sn.noticePerLevel * (skills.level('sneak') - 1);
  player.sneakAttackMul = skills.maxed('sneak') ? sn.perk.attackMul : 1;
  player.setLook(weapon, armor);
}

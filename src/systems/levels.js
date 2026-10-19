// Levels. The player's level comes from their skills (no XP bar of its own). Each enemy has a
// design level (`cfg.lvl`). "Fixed" enemies stay at it; "scaling" ones (`cfg.scales`, or anything
// in a refilled dungeon) match the player's level + `cfg.lvlOffset`, never below the design level.
// Stats grow with every level above the design level.
import { CONFIG } from '../config.js';
import { SKILL_IDS } from './skills.js';

const L = CONFIG.levels;

export function playerLevel(skills) {
  let ups = 0;
  for (const id of SKILL_IDS) ups += skills.level(id) - 1;
  return Math.min(L.max, 1 + Math.floor(ups / L.skillUpsPerLevel));
}

// The level an enemy with config `cfg` fights at, for a player of level `pl`.
export function enemyLevel(cfg, pl, forceScale = false) {
  const base = cfg.lvl ?? 1;
  if (!cfg.scales && !forceScale) return base;
  return Math.max(base, Math.min(L.max, pl + (cfg.lvlOffset ?? 0)));
}

// Health / damage multipliers for fighting at `lvl` instead of the design level.
export function levelMul(cfg, lvl) {
  const k = Math.max(0, lvl - (cfg.lvl ?? 1));
  return { hp: 1 + L.hpPerLevel * k, dmg: 1 + L.dmgPerLevel * k };
}

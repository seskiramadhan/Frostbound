// Boot + game loop (fixed timestep logic, render every frame).
import * as THREE from 'three';
import { CONFIG, IS_TOUCH } from './config.js';
import { Input } from './input.js';
import { Terrain } from './world/terrain.js';
import { buildProps } from './world/props.js';
import { setupEnvironment, applyAmbience, Snow } from './world/environment.js';
import { Dungeon, FROSTFANG_DEN, BLEAKROCK_BARROW, buildEntrance } from './world/dungeon.js';
import { Chest } from './world/chest.js';
import { Fx } from './world/fx.js';
import { buildVillage } from './world/village.js';
import { Summit } from './world/summit.js';
import { Npc, VILLAGERS } from './entities/npc.js';
import { talk } from './systems/dialogue.js';
import { Dialog } from './ui/dialog.js';
import { GameAudio } from './audio.js';
import { Player } from './entities/player.js';
import { spawnWolfPack, spawnDungeonCreatures } from './entities/creature.js';
import { Dragon } from './entities/dragon.js';
import { EventBus } from './systems/events.js';
import { EntityRegistry } from './systems/entities.js';
import { Combat } from './systems/combat.js';
import { separateBodies } from './systems/physics.js';
import { Inventory, ITEMS } from './systems/inventory.js';
import { Skills, applyStats } from './systems/skills.js';
import { Shouts } from './systems/shouts.js';
import { Projectiles } from './systems/projectiles.js';
import { Quests } from './systems/quests.js';
import { loadSave, writeSave, clearSave } from './systems/save.js';
import { ThirdPersonCamera } from './camera.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { CoopPanel } from './ui/coop.js';
import { Session } from './net/session.js';

const R = CONFIG.render;
const $ = id => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? R.maxPixelRatioMobile : R.maxPixelRatioDesktop));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(R.fov, innerWidth / innerHeight, R.near, R.far);
const env = setupEnvironment(scene);

// Levels: the valley plus dungeons (each built far away; fog hides one from another)
const valley = new Terrain();
scene.add(valley.mesh);
const props = buildProps(valley);
scene.add(props.group);
valley.colliders = props.colliders;
const dungeons = {}, entrances = {};
for (const def of [FROSTFANG_DEN, BLEAKROCK_BARROW]) {
  const d = new Dungeon(def);
  scene.add(d.group);
  dungeons[def.key] = d;
  const e = buildEntrance(valley, CONFIG.dungeon.entrances[def.key]);
  scene.add(e.group);
  valley.colliders.push(...e.colliders);
  entrances[def.key] = e;
}
const { den, barrow } = dungeons;
const village = buildVillage(valley);
scene.add(village.mesh);
valley.colliders.push(...village.colliders);
const summit = new Summit();
scene.add(summit.group);
entrances.summit = buildEntrance(valley, CONFIG.dungeon.entrances.summit);
scene.add(entrances.summit.group);
valley.colliders.push(...entrances.summit.colliders);
const levels = { valley, ...dungeons, summit };
const snow = new Snow(scene);
const fx = new Fx(scene);

const events = new EventBus();
const entities = new EntityRegistry();
const combat = new Combat(events, entities);

const player = entities.add(new Player(scene, valley, events, entities));
const creatures = spawnWolfPack(scene, valley, events, entities);
const bosses = {};
for (const d of Object.values(dungeons)) {
  const r = spawnDungeonCreatures(scene, d, events, entities);
  creatures.push(...r.creatures);
  bosses[d.key] = r.boss;
}
const dragon = entities.add(new Dragon(scene, valley, events, fx, entities));          // the story dragon
const huntDragon = entities.add(new Dragon(scene, valley, events, fx, entities));      // dragon hunts / attacks
const WE = CONFIG.worldEater;
const worldEater = entities.add(new Dragon(scene, summit, events, fx, entities, { scale: WE.scale, colors: WE.colors }));
const chests = Object.values(dungeons).flatMap(d => d.chests.map(c => new Chest(scene, d, c.pos, c.lootKey, Math.PI)));
const projectiles = new Projectiles(scene, entities, combat);
const tpCam = new ThirdPersonCamera(camera, valley);
tpCam.yaw = player.facing + Math.PI; // start behind the player

const inventory = new Inventory(events);
const skills = new Skills(events, player);
const shouts = new Shouts(events, entities, combat, fx);
const npcs = VILLAGERS.map(def => new Npc(scene, valley, { ...def, spots: village.spots[def.id] }));
const visited = {};
const flags = {};        // story switches set in conversations (metJarl, reportedDen, ...)
const world = {
  valley, den, barrow, summit, entrances, inventory, visited, flags, shouts, dragon, worldEater,
  alpha: bosses.den, wight: bosses.barrow, summitCentre: new THREE.Vector3(summit.ox, 0, summit.oz),
  chest: key => chests.find(c => c.key === key),
  npc: id => npcs.find(n => n.id === id).pos,
};
const quests = new Quests(events, world);

const hud = new Hud();
const session = new Session({
  events, scene, player, inventory, entities, combat, shouts, levels, dragon,
  enemies: [...creatures, dragon, huntDragon, worldEater], onHurt: guestHurt,
});
const coopPanel = new CoopPanel(session, {
  blocker: () => huntBlocker(), start: () => startHunt(), level: () => huntsWon + 1, active: () => huntDragon.active,
});
const menu = new Menu(inventory, skills, player, shouts, coopPanel, quests);
const dialog = new Dialog();
const audio = new GameAudio();
const SOUND_LABEL = { all: '♪ On', sfx: '♪ FX only', off: '♪ Off' };
$('menu-sound').textContent = SOUND_LABEL[audio.pref];
$('menu-sound').addEventListener('click', () => { $('menu-sound').textContent = SOUND_LABEL[audio.cyclePref()]; });
const input = new Input(renderer.domElement, $('joy'), $('joy-knob'), {
  jump: $('btn-jump'), interact: $('btn-interact'), menu: $('btn-bag'), shout: $('btn-shout'), bow: $('btn-bow'),
});

// ---- Travel between levels ----
let busy = false;   // fading between levels
function travel(level, at, facing) {
  busy = true;
  audio.play('door');
  hud.fade(() => {
    player.moveTo(level, at, facing);
    enterLevel(level, facing);
    busy = false;
    save();
  }, CONFIG.interact.fadeTime);
}

function enterLevel(level, facing) {
  const outdoors = level === valley || level.outdoor;
  audio.setAmbience(outdoors ? 'valley' : 'dungeon');
  tpCam.level = level;
  tpCam.yaw = facing + Math.PI;
  tpCam.snap();
  applyAmbience(env, level === valley ? 'valley' : level.key === 'summit' ? 'summit' : level.name, !!flags.victory);
  snow.points.visible = level.key === 'summit' || (level === valley && !flags.victory);
  if (level.key) visited[level.key] = true;
  if (dungeons[level.key]) maybeRefillDungeon(level);
}

function openChest(chest) {
  chest.open();
  audio.play('chest');
  const tl = CONFIG.postGame.tierLoot;
  const loot = chest.tier ? { items: tl.items, gold: tl.goldPerTier * chest.tier } : CONFIG.loot[chest.lootKey];
  for (const [id, n] of Object.entries(loot.items)) inventory.add(id, n);
  if (loot.gold) inventory.addGold(loot.gold);
  save();
}

function learnWord(d, w = d.wordWall) {
  fx.soul({ x: w.pos.x, y: 1, z: w.pos.z }, player.pos, 30);
  shouts.learn(w.shout);
  if (w === d.secretWall) d.setSecretState(true, true);
  else d.setWordLearned(true);
  const other = Object.values(dungeons).find(o => o.wordWall && !shouts.known.has(o.wordWall.shout));
  if (other) setTimeout(() => hud.toast(`Legends tell of another word wall in ${other.name}`), 3500);
  save();
}

// Things you can walk up to and press E / Use on
const interactables = [
  ...Object.values(dungeons).flatMap(d => {
    const e = entrances[d.key];
    const list = [
      { level: valley, pos: e.front, label: `Enter ${d.name}`, use: () => travel(d, d.start, 0) },
      { level: d, pos: d.exit, label: `Leave ${d.name}`, use: () => travel(valley, e.outside, e.facing) },
    ];
    if (d.wordWall) {
      const def = CONFIG.shouts[d.wordWall.shout];
      list.push({ level: d, pos: d.wordWall.pos, label: `Learn the word: ${def.word}`,
        enabled: () => !shouts.known.has(d.wordWall.shout), use: () => learnWord(d) });
    }
    if (d.secretWall) {   // hidden 4th shout: only after the World-Eater falls
      const def = CONFIG.shouts[d.secretWall.shout];
      list.push({ level: d, pos: d.secretWall.pos, label: `Learn the word: ${def.word}`,
        enabled: () => !!flags.victory && !shouts.known.has(d.secretWall.shout), use: () => learnWord(d, d.secretWall) });
    }
    return list;
  }),
  { level: valley, pos: entrances.summit.front, label: 'Climb to the summit',
    enabled: () => quests.has('worldEater'), use: () => travel(summit, summit.start, Math.PI) },
  { level: summit, pos: summit.exit, label: 'Descend the mountain',
    use: () => travel(valley, entrances.summit.outside, entrances.summit.facing) },
  ...chests.map(c => ({ level: c.level, pos: c.pos, label: 'Open chest', enabled: () => !c.opened, use: () => openChest(c) })),
  ...npcs.map(n => ({ level: valley, pos: n.pos, label: `Talk to ${n.name}`, use: () => openDialog(n) })),
];

function nearestInteractable() {
  let best = null, bestD = CONFIG.interact.radius ** 2;
  for (const it of interactables) {
    if (it.level !== player.level || (it.enabled && !it.enabled())) continue;
    const d = (it.pos.x - player.pos.x) ** 2 + (it.pos.z - player.pos.z) ** 2;
    if (d < bestD) { bestD = d; best = it; }
  }
  return best;
}

// ---- Bow aiming: auto-aim at the best enemy near the camera direction (with lead on fast flyers) ----
const BW = CONFIG.bow;
const aimFrom = new THREE.Vector3(), aimAt = new THREE.Vector3(), camDir = new THREE.Vector3();
events.on('shootArrow', ({ shooter, power, damage }) => {
  const f = shooter.facing;
  aimFrom.set(shooter.pos.x + Math.sin(f) * 0.5, shooter.pos.y + 1.45, shooter.pos.z + Math.cos(f) * 0.5);
  camera.getWorldDirection(camDir);
  const yawF = Math.atan2(camDir.x, camDir.z);
  let best = null, bestScore = Infinity;
  for (const e of entities) {
    if (!e.alive || e.team === shooter.team || e.level !== shooter.level) continue;
    const dx = e.pos.x - shooter.pos.x, dz = e.pos.z - shooter.pos.z, d = Math.hypot(dx, dz);
    if (d > BW.aimRange) continue;
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - yawF), Math.cos(Math.atan2(dx, dz) - yawF)));
    if (off > BW.aimArc) continue;
    if (!shooter.level.lineOfSight(shooter.pos, e.pos)) continue;
    const score = off * 30 + d;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  if (best) {
    aimAt.set(best.pos.x, best.pos.y + (best.aimHeight ?? 0.8), best.pos.z);
    const t = aimFrom.distanceTo(aimAt) / (BW.speed * (0.55 + 0.45 * power));
    aimAt.addScaledVector(best.vel, t * (best.flying ? 1 : 0.5));   // lead moving targets
  } else {
    aimAt.copy(camera.position).addScaledVector(camDir, 60);
  }
  projectiles.fire(shooter, aimFrom, aimAt, power, damage);
});

// ---- Feedback ----
const SHAKE = CONFIG.combat.shake;
events.on('damage', ({ target }) => {
  if (target === player) { hud.hurt(); tpCam.shake(SHAKE.hit); }
  else if (target !== dragon) hud.showTarget(target);
});
events.on('blocked', ({ target }) => { if (target === player) tpCam.shake(SHAKE.block); });
events.on('death', ({ target, killer }) => {
  if (target === player) { hud.showDeath(true); return; }
  // Loot is per-player: in co-op everyone in the same place gets their own drop
  if (target.kind === 'wolf' && target.level === player.level && (killer === player || session.active)) {
    inventory.add(target === world.alpha ? CONFIG.loot.alphaDrop : CONFIG.loot.wolfDrop);
  }
});
events.on('inventory', () => applyStats(player, inventory, skills));
events.on('itemAdded', ({ id, count }) => hud.toast(`${ITEMS[id].name}${count > 1 ? ` (${count})` : ''} added`));
events.on('goldAdded', ({ amount }) => hud.toast(`${amount} gold added`));
events.on('potionUsed', ({ id }) => hud.toast(`${ITEMS[id].name} used`));
events.on('skillUp', ({ id, name, level }) => {
  applyStats(player, inventory, skills);
  if (!skills.maxed(id)) hud.announce(`${name} increased to ${level}`);
});
events.on('perk', ({ id, perk }) => hud.announce(`${CONFIG.skills[id].name} mastered`, `Perk unlocked: ${perk.name}. ${perk.desc}`));
events.on('questStarted', ({ name, text }) => { hud.announce(`Quest started: ${name}`, text); save(); });
events.on('questStep', ({ text }) => { hud.toast(`New objective: ${text}`); save(); });
events.on('questDone', ({ name }) => {
  hud.announce(`Quest completed: ${name}`);
  if (quests.isDone('dragonRising')) hud.announce('More of the story awaits', 'The tale continues in a future update.');
  save();
});
events.on('shoutLearned', ({ def }) => hud.announce(`Word of Power: ${def.word}`, `${def.name}. ${IS_TOUCH ? 'Tap the shout button' : 'Press Q'} to use it.`));
events.on('shout', ({ id }) => tpCam.shake(id === 'slowTime' ? 0.15 : 0.35));
events.on('bowToggled', ({ bowMode }) => hud.toast(bowMode ? 'Bow drawn: hold to aim, release to shoot' : 'Sword drawn'));
events.on('netPlayerJoined', ({ name }) => { hud.toast(`${name} joined the game`); if (menu.open) menu.render(); });
events.on('netPlayerLeft', ({ name }) => { hud.toast(`${name} left the game`); if (menu.open) menu.render(); });
events.on('netJoined', () => { guestWorld = worldJSON(); });
events.on('netEnded', ({ reason, wasGuest }) => {
  hud.toast(reason);
  if (menu.open) menu.render();
  if (wasGuest) {           // back to our own world: keep the character, reload our world
    save();
    resetting = true;
    hud.fade(() => location.reload(), 1.2);
  }
});
events.on('dragonRoar', ({ dragon: d }) => {
  if (d === worldEater) {
    hud.announce('The World-Eater!', 'Bow and Slow Time while it flies. FUS or IIZ bring it down.');
    tpCam.shake(0.7);
  } else {
    hud.announce('A dragon approaches!');
    tpCam.shake(0.45);
  }
  audio.play('roar');
});
events.on('bossPhase2', () => { hud.announce('The World-Eater is forced down!', 'Finish it!'); tpCam.shake(0.8); audio.play('thud'); });

// ---- Sound effects from game events ----
events.on('attack', ({ attacker }) => {
  if (attacker === player) audio.play('swing');
  else if (attacker.kind === 'wolf') audio.play('bite', attacker.pos);
  else if (attacker.kind === 'draugr') audio.play('heavySwing', attacker.pos);
  else if (attacker.kind === 'dragon') audio.play('bite', attacker.pos);
});
events.on('damage', ({ target, source }) => {
  if (target === player) audio.play('hurt');
  else audio.play(source === 'arrow' ? 'arrowHit' : 'hit', target.pos);
});
events.on('blocked', ({ target }) => audio.play('block', target.pos));
events.on('shootArrow', () => audio.play('bow'));
events.on('shout', ({ id }) => audio.play(id));
events.on('dragonDowned', ({ dragon: d }) => audio.play('thud', d?.pos));
events.on('skillUp', () => audio.play('levelUp'));
events.on('questDone', () => audio.play('quest'));
events.on('questStarted', () => audio.play('questStart'));
events.on('shoutLearned', () => audio.play('word'));
events.on('death', ({ target }) => { if (target === player) audio.play('death'); });
events.on('dragonDowned', () => hud.toast('The dragon crashes to the ground!'));
events.on('dragonDead', ({ dragon: d }) => {
  if (d === huntDragon) { huntWon(); return; }
  if (d === worldEater) { victory(); return; }
  dragon.char();
  shouts.learn('fireBreath', true);
  shouts.select('fireBreath');
  hud.announce('Dragon soul absorbed', `Word of Power: ${CONFIG.shouts.fireBreath.word}. ${CONFIG.shouts.fireBreath.name}`);
  save();
});

// ---- Co-op dragon hunts (N3) ----
const HUNT = CONFIG.hunt;
let huntsWon = 0;        // this player's hunts; the host's count sets the next hunt's level

// Why the host can't start a hunt right now, or null if they can.
function huntBlocker() {
  if (session.role !== 'host') return 'Only the host can start a dragon hunt';
  if (!quests.isDone('dragonRising')) return 'Slay your first dragon (Dragon Rising) to unlock hunts';
  if (huntDragon.active) return 'A hunt is already on';
  if (player.level !== valley) return 'Go out into the valley first';
  return null;
}

function startHunt(attack = false) {
  if (!attack && huntBlocker()) return;
  const level = huntsWon + 1;
  const data = {
    level,
    name: HUNT.names[Math.min(level - 1, HUNT.names.length - 1)],
    maxHp: Math.round(CONFIG.dragon.maxHealth * (1 + HUNT.hpPerLevel * (level - 1)) * ngHp()),
    attack,
  };
  huntDragon.activate(player, { name: data.name, maxHp: data.maxHp, dmgMul: (1 + HUNT.dmgPerLevel * (level - 1)) * ngDmg() });
  events.emit('huntStart', { dragon: huntDragon, data });
}

events.on('huntStart', ({ data }) => {
  huntDragon.name = data.name;          // guests learn the name/health from the host
  huntDragon.maxHp = data.maxHp;
  huntDragon.huntLevel = data.level;
  hud.announce(data.attack ? 'A dragon attacks!' : 'Dragon hunt!', `${data.name} (level ${data.level}) is coming`);
  if (menu.open) menu.render();
});

function huntWon() {
  huntDragon.char();
  huntsWon++;
  const gold = HUNT.goldPerLevel * (huntDragon.huntLevel ?? 1);
  hud.announce(`${huntDragon.name} slain!`, `Hunt reward: ${gold} gold`);
  inventory.addGold(gold);
  save();
}

// ---- The World-Eater and the ending ----
let weTimer = 0;
function victory() {
  worldEater.char();
  flags.victory = true;
  hud.announce('The World-Eater is no more', 'Its soul is yours, Dragonborn');
  save();
  setTimeout(() => hud.fade(() => {
    player.moveTo(valley, SPAWN, Math.PI);
    enterLevel(valley, Math.PI);
    hud.showEnding(() => {
      hud.toast('Post-game: dragons still roam, dungeons refill, and a hidden word wall stirs in Bleakrock Barrow.');
      hud.toast('Talk to Jarl Hrolf to begin New Game+.');
    });
    save();
  }, 1.2), 4500);
}

// ---- Post-game & New Game+ ----
const PG = CONFIG.postGame;
let ng = 0;                    // New Game+ level (enemies tougher)
const tiers = {}, refills = {}; // per dungeon: respawn tier, last refill time (ms)
const ngHp = () => 1 + PG.ngHp * ng;
const ngDmg = () => 1 + PG.ngDmg * ng;
let attackTimer = PG.dragonEvery[0];

// Scale a creature for NG+ and its dungeon's respawn tier (from its original stats).
function scaleCreature(c) {
  c.baseCfg ??= { ...c.cfg };
  const tier = tiers[c.level.key] ?? 0;
  const hp = ngHp() * (1 + PG.tierHp * tier), dmg = ngDmg() * (1 + PG.tierDmg * tier);
  c.cfg = { ...c.baseCfg, maxHealth: c.baseCfg.maxHealth * hp, biteDamage: c.baseCfg.biteDamage * dmg };
  c.maxHp = c.cfg.maxHealth;
  if (c.alive) c.hp = Math.min(c.hp, c.maxHp) || c.maxHp;
}

// After victory: a cleared dungeon refills (tougher, better loot) when you come back later.
function maybeRefillDungeon(d) {
  if (!flags.victory || session.role === 'guest') return;
  const mine = creatures.filter(c => c.level === d);
  if (mine.some(c => c.alive) || Date.now() - (refills[d.key] ?? 0) < PG.dungeonRespawn * 1000) return;
  tiers[d.key] = (tiers[d.key] ?? 0) + 1;
  refills[d.key] = Date.now();
  for (const c of mine) { scaleCreature(c); c.respawns = false; c.respawn(); }
  for (const ch of chests) if (ch.level === d) { ch.opened = false; ch.openT = 0; ch.tier = tiers[d.key]; }
  hud.toast(`${d.name} has new occupants... and new treasure`);
}

function newGamePlus() {
  resetting = true;
  writeSave({ ng: ng + 1, hunts: huntsWon, skills: skills.toJSON(), shouts: { known: [], selected: null } });
  hud.fade(() => location.reload(), 0.8);
}

// Co-op guest: an enemy (run by the host) hit us. Apply it with our own armour and block skill.
function guestHurt(damage, blocked, from) {
  if (!player.alive) return;
  const attacker = { pos: from };
  let amount = blocked ? damage * (1 - player.blockReduction) : damage;
  amount = player.mitigate(amount);
  player.hp = Math.max(0, player.hp - amount);
  player.onHit({ amount, attacker, blocked });
  events.emit(blocked ? 'blocked' : 'damage', { target: player, attacker, amount, source: 'melee' });
  if (player.hp <= 0) { player.die(); events.emit('death', { target: player, killer: attacker }); }
}

// ---- Save / load ----
let resetting = false;
let guestWorld = null;   // while a co-op guest: our own world, kept as it was before joining
function worldJSON() {
  return {
    chests: chests.filter(c => c.opened).map(c => c.key),
    chestTiers: Object.fromEntries(chests.filter(c => c.tier).map(c => [c.key, c.tier])),
    dead: creatures.filter(w => w.key && !w.alive).map(w => w.key),
    dragonDead: dragon.state === 'dead',
    worldEaterDead: worldEater.state === 'dead',
    tiers, refills,
    visited,
  };
}
function save() {
  if (resetting || !started || !player.alive) return;
  writeSave({
    ng,
    hunts: huntsWon,
    flags,
    player: { level: player.level.key ?? 'valley', pos: player.pos.toArray(), facing: player.facing, hp: player.hp, bowMode: player.bowMode },
    inventory: inventory.toJSON(),
    skills: skills.toJSON(),
    shouts: shouts.toJSON(),
    quests: quests.toJSON(),
    world: session.role === 'guest' && guestWorld ? guestWorld : worldJSON(),
  });
}

function applySave(s) {
  inventory.load(s.inventory);
  skills.load(s.skills);
  shouts.load(s.shouts);
  huntsWon = Math.max(0, s.hunts | 0);
  ng = Math.max(0, s.ng | 0);
  Object.assign(tiers, s.world?.tiers);
  Object.assign(refills, s.world?.refills);
  for (const [key, t] of Object.entries(s.world?.chestTiers ?? {})) { const c = world.chest(key); if (c) c.tier = t; }
  for (const c of creatures) scaleCreature(c);   // NG+ and refill tiers
  quests.load(s.quests);
  Object.assign(visited, s.world?.visited);
  Object.assign(flags, s.flags);
  for (const key of s.world?.chests ?? []) world.chest(key)?.open(true);
  for (const key of s.world?.dead ?? []) creatures.find(w => w.key === key)?.removeForGood();
  if (s.world?.dragonDead) dragon.setDead();
  if (s.world?.worldEaterDead) worldEater.setDead();
  const level = levels[s.player?.level] ?? valley;
  const [x, , z] = s.player?.pos ?? [0, 0, 0];
  player.moveTo(level, new THREE.Vector3(x, 0, z), s.player?.facing ?? Math.PI);
  player.hp = Math.max(1, Math.min(player.maxHp, s.player?.hp ?? player.maxHp));
  player.bowMode = !!s.player?.bowMode;
  enterLevel(level, player.facing);
}

const saved = loadSave();
if (saved) applySave(saved);
for (const d of Object.values(dungeons)) {
  if (d.wordWall) d.setWordLearned(shouts.known.has(d.wordWall.shout));
  if (d.secretWall) d.setSecretState(!!flags.victory, shouts.known.has(d.secretWall.shout));
}
if (ng) hud.setStartText(true, `New Game+ ${ng}`);
applyStats(player, inventory, skills);
hud.setStartText(!!saved);
const joinCode = new URLSearchParams(location.search).get('join');   // invite link: ?join=CODE
if (joinCode) $('cta').textContent = `${IS_TOUCH ? 'Tap' : 'Click'} to join room ${joinCode.toUpperCase()}`;

// ---- Start / pause / menu ----
let started = false;
function startGame(lock = true) {
  audio.start();   // browsers only allow sound after a tap
  if (!started) {
    started = true;
    if (!quests.has('howlingDen')) quests.start('arrival');   // new game: meet the Jarl first
  }
  if (IS_TOUCH) {
    hud.showOverlay(false);
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else if (lock) {
    input.requestLock();
  }
}
hud.overlay.addEventListener('click', e => {
  if (e.target.id === 'newgame' || e.target.id === 'coop-start') return;
  const firstJoin = joinCode && !started && !session.active;
  startGame(!firstJoin);
  if (firstJoin) { hud.showOverlay(false); openMenu('coop'); coopPanel.join(joinCode, () => menu.open && menu.render()); }
});
$('coop-start').addEventListener('click', e => {
  e.stopPropagation();
  startGame(false);
  hud.showOverlay(false);
  openMenu('coop');
});
$('newgame').addEventListener('click', e => {
  e.stopPropagation();
  resetting = true;
  clearSave();
  location.reload();
});

// ---- Villagers: talk, trade, rest ----
const VIL = CONFIG.village;
const talkCtx = {
  quests, inventory, flags, player, newGamePlus,
  get ng() { return ng; },
  done: line => dialog.say(line),
  trade: () => { tradeMode = true; },
  rest: () => {
    if (!inventory.spend(VIL.roomPrice)) { dialog.say('You can\'t afford a room.'); return true; }
    player.heal(player.maxHp);
    player.stamina = player.maxStamina;
    hud.toast(`Rested at the inn (-${VIL.roomPrice} gold). Fully healed.`);
    save();
    return false;
  },
};
let tradeMode = false;

function tradeView() {
  const opts = [{ label: 'Buy', cls: 'head', run: () => true, disabled: true }];
  for (const [id, price] of VIL.stock) {
    opts.push({ label: ITEMS[id].name, note: `${price} g`, disabled: inventory.gold < price, run: () => {
      if (inventory.spend(price)) { inventory.add(id, 1, true); hud.toast(`Bought ${ITEMS[id].name}`); audio.play('coin'); save(); }
      return true;
    } });
  }
  opts.push({ label: 'Sell', cls: 'head', run: () => true, disabled: true });
  for (const g of inventory.grouped()) {
    for (const e of g.entries) {
      if (e.def.type === 'quest' || !e.def.value || (e.equipped && e.count <= 1)) continue;
      const price = Math.round(e.def.value * VIL.sellRate);
      opts.push({ label: `${e.def.name}${e.count > 1 ? ` (${e.count})` : ''}`, note: `+${price} g`, run: () => {
        inventory.remove(e.id);
        inventory.addGold(price, true);
        hud.toast(`Sold ${e.def.name} for ${price} gold`);
        audio.play('coin');
        return true;
      } });
    }
  }
  opts.push({ label: 'Done trading', run: () => { tradeMode = false; save(); return true; } });
  return { text: `You have ${inventory.gold} gold.`, options: opts };
}

function openDialog(npc) {
  if (dialog.open || menu.open) return;
  tradeMode = false;
  talkCtx.confirmNg = false;
  dialog.show(npc, () => (tradeMode ? tradeView() : talk(npc.id, talkCtx)));
  if (!IS_TOUCH) document.exitPointerLock?.();
}
dialog.onClose = () => {
  tradeMode = false;
  save();
  if (!IS_TOUCH) { hud.showOverlay(true); input.requestLock(); }
};

function openMenu(tab) {
  if (!started || menu.open || dialog.open || !player.alive) return;
  menu.show(true, tab);
  if (!IS_TOUCH) document.exitPointerLock?.();
}
function closeMenu() {
  if (!menu.open) return;
  menu.show(false);
  if (!IS_TOUCH) { hud.showOverlay(true); input.requestLock(); }   // overlay hides once the lock is back
}
input.onMenu = () => (menu.open ? closeMenu() : openMenu());
input.onEscape = () => (dialog.open ? dialog.close() : closeMenu());
menu.onClose = closeMenu;
input.onLockChange = locked => { if (!menu.open && !dialog.open) hud.showOverlay(!locked); };

addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);

// ---- Fixed-step logic ----
let saveTimer = 0, dragonTimer = 0;
const SPAWN = new THREE.Vector3(CONFIG.player.spawn[0], 0, CONFIG.player.spawn[1]);
const IDLE_CMD = { move: { x: 0, y: 0 }, run: false, attack: false, block: false, draw: false, jump: false, interact: false, shout: false, toggleBow: false };
function tick(dt, controls) {
  const cmd = controls ? input.update() : IDLE_CMD;   // co-op: the world keeps going while you're in a menu
  if (player.canRespawn && cmd.attack) {
    const inDungeon = player.level !== valley;
    player.respawn(player.level, inDungeon ? player.level.start : SPAWN, inDungeon ? 0 : Math.PI);
    enterLevel(player.level, player.facing);
    hud.showDeath(false);
    cmd.attack = false;
  }

  const near = player.alive && !busy ? nearestInteractable() : null;
  hud.setPrompt(near?.label ?? null);
  if (near && cmd.interact) near.use();

  if (cmd.shout && player.canShout && shouts.ready) {
    player.startShout(tpCam.yaw + Math.PI);
    shouts.use(player);
  }

  // Enemies run on slowed time while Slow Time is active; players never do
  const edt = dt * shouts.timeScale;
  player.tick(dt, cmd, tpCam.yaw);
  if (session.role !== 'guest') {   // co-op guests mirror the host's enemies instead
    for (const c of creatures) c.tick(edt);
    dragon.tick(edt);
    huntDragon.tick(edt);
    worldEater.tick(edt);
  }
  projectiles.update(dt);
  shouts.update(dt);
  separateBodies(entities);

  // Quest flow: Dragon Rising follows The Howling Den; the dragon comes when you're back outside
  if (quests.isDone('howlingDen')) quests.start('dragonRising');
  if (session.role !== 'guest' && quests.stepText('dragonRising') === 'Slay the dragon' && dragon.state === 'inactive'
    && player.level === valley && player.alive) {
    if ((dragonTimer += dt) > CONFIG.dragon.arriveDelay) dragon.activate(player);
  }
  // The World-Eater wakes when you reach the summit
  if (session.role !== 'guest' && quests.stepText('worldEater') === 'Defeat the World-Eater' && worldEater.state === 'inactive'
    && player.level === summit && player.alive) {
    if ((weTimer += dt) > WE.arriveDelay) {
      worldEater.activate(player, { name: WE.name, maxHp: Math.round(WE.maxHealth * ngHp()), dmgMul: WE.dmgMul * ngDmg(),
        boss: { phase2At: WE.phase2At, enrageGap: WE.enrageGap } });
    }
  }
  // Post-game: dragons attack the valley now and then
  if (flags.victory && session.role !== 'guest' && player.level === valley && !huntDragon.active && !dragon.alive) {
    if ((attackTimer -= dt) <= 0) {
      attackTimer = PG.dragonEvery[0] + Math.random() * (PG.dragonEvery[1] - PG.dragonEvery[0]);
      startHunt(true);
    }
  }
  quests.update();

  if ((saveTimer += dt) >= CONFIG.save.autosaveInterval) { saveTimer = 0; save(); }
}

// ---- Per-frame sound: footsteps, enemy tells, dragon fire, music mood ----
let lastStep = 0, fireTimer = 0;
const tellState = new Map();
function updateSound(dt) {
  audio.setListener(player.pos);
  const step = Math.floor(player.walkPhase / Math.PI);
  if (step !== lastStep) { lastStep = step; if (player.grounded && player.speed > 0.8 && player.alive) audio.play('step'); }
  for (const c of creatures) {        // growl / groan as they wind up an attack (their tell)
    const was = tellState.get(c);
    if (c.state === 'windup' && was !== 'windup' && c.alive && c.level === player.level) audio.play(c.kind === 'draugr' ? 'groan' : 'growl', c.pos);
    tellState.set(c, c.state);
  }
  fireTimer -= dt;
  for (const d of [dragon, huntDragon, worldEater]) {
    if (d.breathing > 0 && d.alive && fireTimer <= 0 && player.level === d.level) { audio.play('fire', d.pos); fireTimer = 0.28; }
  }
  const boss = (player.level === valley && (dragon.alive || huntDragon.alive)) || (player.level === summit && worldEater.alive);
  audio.setMood(boss ? 'boss' : 'explore');
}

// ---- Loop ----
const STEP = 1 / CONFIG.loop.tickRate;
const renderPos = new THREE.Vector3();
const TORCH = CONFIG.dungeon.torch;
let acc = 0, last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, CONFIG.loop.maxFrameTime);
  last = now;

  // Single player pauses in menus; co-op never pauses
  const controls = input.active && !menu.open && !dialog.open;
  const playing = started && (controls || session.active);
  if (playing) {
    const look = input.consumeLook();
    if (controls) tpCam.look(look.x, look.y);
    acc += dt;
    while (acc >= STEP) {
      tick(STEP, controls);
      acc -= STEP;
    }
  } else {
    input.consumeLook();
    acc = 0;
  }

  const alpha = playing ? acc / STEP : 1;
  if (started) session.update(dt);   // sends our pose; on guests, moves enemies to the host's state
  player.render(alpha, renderPos);
  for (const c of creatures) c.render(alpha);
  dragon.render(alpha);
  huntDragon.render(alpha);
  worldEater.render(alpha);
  for (const c of chests) c.update(dt);
  for (const n of npcs) n.update(dt, player, dialog.npc === n);
  for (const d of Object.values(dungeons)) d.update(dt);
  if (playing) fx.update(dt * (shouts.timeScale < 1 ? 0.6 : 1));
  session.render(dt, player.level.key ?? 'valley', levels);
  hud.setCoop(session);
  tpCam.update(dt, renderPos);
  // Carried light sits between player and camera so the side you see is lit
  env.torch.position.set(renderPos.x, renderPos.y + TORCH.height, renderPos.z).lerp(camera.position, 0.45);
  if (snow.points.visible) snow.update(dt, renderPos);

  // Objective + marker (points at a door when the target is on another level)
  let obj = started ? quests.active() : null;
  let mark = null;
  const inDungeon = player.level !== valley;
  if (huntDragon.alive && player.level === valley) obj = { name: 'Dragon hunt', text: `Slay the ${huntDragon.name}`, target: { level: valley, pos: huntDragon.pos } };
  if (obj?.target) {
    if (obj.target.level === player.level) mark = obj.target.pos;
    else mark = inDungeon ? player.level.exit : entrances[obj.target.level.key].front;
  } else if (started && inDungeon) {
    // Nothing (more) to do down here: show the way out
    obj ??= { name: player.level.name, text: `Leave ${player.level.name}` };
    mark = player.level.exit;
  }
  hud.setObjective(obj);
  hud.setMarker(mark, camera, player.pos);
  hud.setShout(shouts);
  hud.setBow(player);
  hud.setSlow(shouts.slowLeft > 0 || (session.role === 'guest' && session.mirror.slow));
  if (session.role === 'guest') {
    for (const d of [dragon, huntDragon, worldEater]) if (d.state === 'soul' && Math.random() < 0.5) fx.soul({ x: d.pos.x, y: d.pos.y + 2, z: d.pos.z }, player.pos, 2);
  }
  hud.setBoss(player.level === summit ? (worldEater.alive ? worldEater : null)
    : player.level !== valley ? null : dragon.alive ? dragon : huntDragon.alive ? huntDragon : null);

  updateSound(dt);
  hud.frame(dt, player);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Debug handle for testing in the console
window.frostbound = {
  player, creatures, dragon, huntDragon, worldEater, summit, entities, npcs, dialog, flags, village, audio, events, inventory, skills, shouts, quests, chests, dungeons, den, barrow,
  valley, entrances, interactables, projectiles, fx, save, menu, session, coopPanel,
  tpCam,
  go: (level, at, facing = 0) => { player.moveTo(level, at, facing); enterLevel(level, facing); },
  dragonAttack: () => startHunt(true), get ng() { return ng; }, tiers, refills,
};

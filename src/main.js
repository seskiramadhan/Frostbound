// Boot + game loop (fixed timestep logic, render every frame).
import * as THREE from 'three';
import { CONFIG, IS_TOUCH } from './config.js';
import { Input } from './input.js';
import { Terrain } from './world/terrain.js';
import { buildProps } from './world/props.js';
import { setupEnvironment, applyAmbience, applyDayNight, dayLight, Snow } from './world/environment.js';
import { Dungeon, FROSTFANG_DEN, BLEAKROCK_BARROW, USTENGRAV, buildEntrance } from './world/dungeon.js';
import { Monastery } from './world/monastery.js';
import { Chest } from './world/chest.js';
import { Fx } from './world/fx.js';
import { buildVillage } from './world/village.js';
import { Summit } from './world/summit.js';
import { Npc, VILLAGERS, GREYBEARDS } from './entities/npc.js';
import { talk } from './systems/dialogue.js';
import { Dialog } from './ui/dialog.js';
import { GameAudio } from './audio.js';
import { Player } from './entities/player.js';
import { Creature, spawnWolfPack, spawnDungeonCreatures } from './entities/creature.js';
import { Dragon } from './entities/dragon.js';
import { EventBus } from './systems/events.js';
import { EntityRegistry } from './systems/entities.js';
import { Combat } from './systems/combat.js';
import { separateBodies } from './systems/physics.js';
import { Inventory, ITEMS } from './systems/inventory.js';
import { Skills, applyStats } from './systems/skills.js';
import { Shouts } from './systems/shouts.js';
import { Projectiles } from './systems/projectiles.js';
import { Magic } from './systems/magic.js';
import { Stealth, witness } from './systems/stealth.js';
import { Raid } from './systems/raid.js';
import { Jobs } from './systems/jobs.js';
import { buildBell, buildTower } from './world/defenses.js';
import { buildCamp } from './world/camp.js';
import { playerLevel, enemyLevel, levelMul } from './systems/levels.js';
import { Quests } from './systems/quests.js';
import { loadSave, writeSave, clearSave } from './systems/save.js';
import { ThirdPersonCamera } from './camera.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { CoopPanel } from './ui/coop.js';
import { Session } from './net/session.js';
import { BUILD, checkUpdate } from './version.js';
import { updateGame } from './updater.js';

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
for (const p of props.platforms) valley.addPlatform(p);   // rocks you can jump onto
const dungeons = {}, entrances = {};
for (const def of [FROSTFANG_DEN, BLEAKROCK_BARROW, USTENGRAV]) {
  const d = new Dungeon(def);
  scene.add(d.group);
  dungeons[def.key] = d;
  const e = buildEntrance(valley, CONFIG.dungeon.entrances[def.key]);
  scene.add(e.group);
  valley.colliders.push(...e.colliders);
  entrances[def.key] = e;
}
const { den, barrow, ustengrav } = dungeons;
const village = buildVillage(valley);
scene.add(village.mesh);
valley.colliders.push(...village.colliders);
const summit = new Summit();
scene.add(summit.group);
entrances.summit = buildEntrance(valley, CONFIG.dungeon.entrances.summit);
scene.add(entrances.summit.group);
valley.colliders.push(...entrances.summit.colliders);
const monastery = new Monastery();            // High Hrothgar, the Greybeards' terrace
scene.add(monastery.group);
entrances.monastery = buildEntrance(valley, CONFIG.dungeon.entrances.monastery);
scene.add(entrances.monastery.group);
valley.colliders.push(...entrances.monastery.colliders);
const levels = { valley, ...dungeons, summit, monastery };
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
const raid = new Raid(scene, valley, events, entities);     // raiders, guards, barricades (after the dragons: fixed ids)
const bell = buildBell(scene, valley);
const tower = buildTower(scene, valley);
const RD = CONFIG.raid;
// The bandit camp in the western forest: bandits, archers and their chief (scale with your level)
const camp = buildCamp(scene, valley);
const campPack = [];
const banditCfg = { ...CONFIG.bandit };
for (const [cfg, n] of [[banditCfg, CONFIG.camp.bandits], [{ ...banditCfg, ...CONFIG.banditArcher }, CONFIG.camp.archers], [{ ...banditCfg, ...CONFIG.banditChief }, 1]]) {
  for (let i = 0; i < n; i++) {
    const c = entities.add(new Creature(scene, valley, events, entities, camp.center, campPack, { cfg }));
    campPack.push(c);
    creatures.push(c);
  }
}
const banditChief = campPack[campPack.length - 1];
const campChest = new Chest(scene, valley, camp.chest, 'banditChest', Math.PI / 2);
campChest.key = 'valley.banditChest';
const chests = Object.values(dungeons).flatMap(d => d.chests.map(c => new Chest(scene, d, c.pos, c.lootKey, Math.PI)));
const projectiles = new Projectiles(scene, entities, combat);
const magic = new Magic(scene, entities, combat, fx);
// Village strongboxes: stealing (see systems/stealth.js witness)
const ST = CONFIG.steal;
const strongboxes = ST.boxes.map(([lootKey, owner, x, z, facing]) => {
  const c = new Chest(scene, valley, new THREE.Vector3(x, valley.heightAt(x, z), z), lootKey, facing);
  c.key = `valley.${lootKey}`;
  c.owner = owner;
  return c;
});
const tpCam = new ThirdPersonCamera(camera, valley);
tpCam.yaw = player.facing + Math.PI; // start behind the player

const inventory = new Inventory(events);
const skills = new Skills(events, player);
const shouts = new Shouts(events, entities, combat, fx);
const npcs = [
  ...VILLAGERS.map(def => new Npc(scene, valley, { ...def, spots: village.spots[def.id] })),
  ...GREYBEARDS.map(def => new Npc(scene, monastery, { ...def, spots: monastery.spots[def.id] })),
];
const stealth = new Stealth(player, creatures, skills, () => session.role === 'guest');
const visited = {};
const flags = {};        // story switches set in conversations (metJarl, reportedDen, ...)
const world = {
  valley, den, barrow, ustengrav, summit, monastery, entrances, inventory, visited, flags, shouts, dragon, worldEater, huntDragon, raid,
  blessVoice: () => blessVoice(),
  bellPos: bell.pos, camp, banditChief, campBandits: () => campPack,
  creaturesIn: level => creatures.filter(c => c.level === level),
  valleyWolves: () => creatures.filter(c => c.level === valley && c.kind === 'wolf'),
  alpha: bosses.den, wight: bosses.barrow, summitCentre: new THREE.Vector3(summit.ox, 0, summit.oz),
  chest: key => chests.find(c => c.key === key),
  npc: id => npcs.find(n => n.id === id).pos,
};
const quests = new Quests(events, world);
world.quests = quests;
const jobs = new Jobs(world, {
  begin: type => {
    if (type === 'den' || type === 'barrow') refillDungeon(dungeons[type], true);
    else if (type === 'bandits') { for (const c of campPack) if (!c.alive) c.respawn(); }
    else if (type === 'dragon') startHunt(true);
    else if (type === 'raid') startRaid();
  },
  failed: () => hud.toast('The Jarl\'s request failed. Ask him for new work.'),
});
world.jobs = jobs;

const hud = new Hud();
const session = new Session({
  events, scene, player, inventory, entities, combat, shouts, levels, dragon,
  enemies: [...creatures, dragon, huntDragon, worldEater, ...raid.units], onHurt: guestHurt,
  time: () => dayTime, setTime: t => { dayTime = t; },
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
  jump: $('btn-jump'), interact: $('btn-interact'), menu: $('btn-bag'), shout: $('btn-shout'), bow: $('btn-bow'), crouch: $('btn-crouch'),
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
  applyAmbience(env, level === valley ? 'valley' : level.outdoor ? 'summit' : level.name, !!flags.victory);
  snow.points.visible = !!level.outdoor || (level === valley && !flags.victory);
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

// Take from a villager's strongbox: fined if someone sees you, else the loot is yours.
function steal(box) {
  const seen = witness(npcs, player);
  if (seen) {
    const fine = Math.min(ST.fine, inventory.gold);
    if (fine) inventory.spend(fine);
    hud.announce(`${seen.name} caught you stealing!`, fine ? `You pay a ${fine} gold fine.` : 'You have no gold to pay the fine.');
    audio.play('block');
    save();
    return;
  }
  box.open();
  box.stolenAt = Date.now();
  audio.play('chest');
  const loot = CONFIG.loot[box.lootKey];
  for (const [id, n] of Object.entries(loot.items)) inventory.add(id, n);
  if (loot.gold) inventory.addGold(loot.gold);
  skills.addXp('sneak', CONFIG.skills.sneak.xpPerSteal);
  hud.toast('Stolen, and nobody saw.');
  save();
}

// The bandits' chest: free loot (they stole it anyway), refills after a while.
function openCampChest() {
  campChest.open();
  campChest.openedAt = Date.now();
  audio.play('chest');
  const loot = CONFIG.loot.banditChest;
  for (const [id, n] of Object.entries(loot.items)) inventory.add(id, n);
  inventory.addGold(loot.gold + 10 * (pLevel() - 1));
  save();
}

// ---- The Way of the Voice (the Greybeards) ----
function readHornNote() {
  flags.hornNote = true;
  inventory.add('strangeNote');
  hud.announce('The horn is gone!', 'A note lies in its place: "Dragonborn, we need to talk. Find me at the Sleeping Bear in Frosthollow. A friend."');
  save();
}

function blessVoice() {
  flags.voiceBlessing = true;
  shouts.cooldownMul = CONFIG.monastery.voiceBlessing;
  hud.announce('Blessing of the Greybeards', `Your shouts recharge ${Math.round((1 - CONFIG.monastery.voiceBlessing) * 100)}% faster`);
  quests.start('worldEater');
}

events.on('questStarted', ({ id }) => {
  if (id !== 'wayOfTheVoice') return;
  setTimeout(() => {                              // the summons thunders down from the mountain
    hud.announce('DOVAHKIIN!', 'A great voice thunders down from the mountain. The Greybeards summon you.');
    tpCam.shake(1.0);
    audio.play('dovahkiin');
  }, 2500);
});

events.on('shout', () => {
  if (player.level === monastery && quests.stepText('wayOfTheVoice') === 'Show the Greybeards your Voice') {
    flags.voiceTested = true;
    setTimeout(() => hud.announce('The Greybeards answer', '"Dovahkiin." The mountain itself trembles. Your Voice is true.'), 800);
  }
});

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
  { level: valley, pos: entrances.monastery.front, label: 'Climb to High Hrothgar',
    enabled: () => quests.has('wayOfTheVoice') || !!visited.monastery, use: () => travel(monastery, monastery.start, Math.PI) },
  { level: monastery, pos: monastery.exit, label: 'Descend the mountain',
    use: () => travel(valley, entrances.monastery.outside, entrances.monastery.facing) },
  { level: ustengrav, pos: ustengrav.markers.horn, label: 'Examine the empty pedestal',
    enabled: () => quests.stepText('wayOfTheVoice') === 'Retrieve the Horn of Jurgen Windcaller from Ustengrav', use: () => readHornNote() },
  { level: summit, pos: summit.exit, label: 'Descend the mountain',
    use: () => travel(valley, entrances.summit.outside, entrances.summit.facing) },
  ...chests.map(c => ({ level: c.level, pos: c.pos, label: 'Open chest', enabled: () => !c.opened, use: () => openChest(c) })),
  ...strongboxes.map(b => ({ level: valley, pos: b.pos, label: `Steal from ${npcs.find(n => n.id === b.owner).name}'s strongbox`,
    enabled: () => !b.opened, use: () => steal(b) })),
  ...npcs.map(n => ({ level: n.level, pos: n.pos, label: `Talk to ${n.name}`, enabled: () => n.level !== valley || !raid.active, use: () => openDialog(n) })),
  { level: valley, pos: campChest.pos, label: 'Open the bandits\' chest', enabled: () => !campChest.opened, use: () => openCampChest() },
  // Raids: the alarm bell, the watchtower, repairing barricades mid-raid
  { level: valley, pos: bell.pos, label: 'Ring the bell (start a raid)', enabled: () => !raidBlocker(), use: () => startRaid() },
  { level: valley, pos: tower.base, label: 'Climb the watchtower', enabled: () => player.pos.y < tower.height - 1,
    use: () => player.moveTo(valley, tower.top, player.facing) },
  { level: valley, pos: tower.top, label: 'Climb down', enabled: () => player.pos.y > tower.height - 1,
    use: () => player.moveTo(valley, tower.base, player.facing) },
  ...raid.barricades.map(b => ({ level: valley, pos: b.pos, label: `Repair barricade (${RD.repairCost} gold)`,
    enabled: () => raid.active && session.role !== 'guest' && b.hp < b.maxHp, use: () => repairBarricade(b) })),
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
// Sets aimFrom/aimAt for a shot from `shooter` travelling at `speed` m/s.
function aim(shooter, speed) {
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
    const t = aimFrom.distanceTo(aimAt) / speed;
    aimAt.addScaledVector(best.vel, t * (best.flying ? 1 : 0.5));   // lead moving targets
  } else {
    aimAt.copy(camera.position).addScaledVector(camDir, 60);
  }
}
events.on('shootArrow', ({ shooter, power, damage }) => {
  aim(shooter, BW.speed * (0.55 + 0.45 * power));
  projectiles.fire(shooter, aimFrom, aimAt, power, damage);
});
// Bandit archers: aim at the target (with a little lead and spread). Co-op guests get a
// harmless copy of the arrow to see.
const shotFrom = new THREE.Vector3(), shotAt = new THREE.Vector3();
events.on('creatureShoot', ({ shooter, target, damage }) => {
  shotFrom.set(shooter.pos.x + Math.sin(shooter.facing) * 0.5, shooter.pos.y + 1.4, shooter.pos.z + Math.cos(shooter.facing) * 0.5);
  shotAt.set(target.pos.x, target.pos.y + (target.aimHeight ?? 1), target.pos.z);
  const t = shotFrom.distanceTo(shotAt) / (BW.speed * 0.775);
  if (target.vel) shotAt.addScaledVector(target.vel, t * 0.4);
  shotAt.x += (Math.random() - 0.5) * 1.2; shotAt.y += (Math.random() - 0.5) * 0.6; shotAt.z += (Math.random() - 0.5) * 1.2;
  projectiles.fire(shooter, shotFrom, shotAt, 0.5, damage);
  audio.play('bow', shooter.pos);
  events.emit('enemyShot', { data: { lv: shooter.level.key ?? 'valley', f: shotFrom.toArray().map(v => +v.toFixed(2)), t: shotAt.toArray().map(v => +v.toFixed(2)) } });
});
events.on('enemyShot', ({ data, net }) => {
  if (!net || !data?.f || !data?.t) return;            // guests only: just the arrow to look at
  const lv = levels[data.lv];
  if (!lv) return;
  projectiles.fire({ team: 'beast', level: lv }, shotFrom.fromArray(data.f), shotAt.fromArray(data.t), 0.5, 0, true);
  audio.play('bow', shotFrom);
});

events.on('castBolt', ({ caster, damage }) => {
  aim(caster, CONFIG.magic.firebolt.speed);
  magic.fire(caster, aimFrom, aimAt, damage);
});

// ---- Feedback ----
const SHAKE = CONFIG.combat.shake;
events.on('damage', ({ target, attacker }) => {
  if (target === player) { hud.hurt(); tpCam.shake(SHAKE.hit); }
  else if (attacker === player && target !== dragon) hud.showTarget(target);
});
events.on('blocked', ({ target }) => { if (target === player) tpCam.shake(SHAKE.block); });
events.on('death', ({ target, killer }) => {
  if (target === player) { hud.showDeath(true); return; }
  // Loot is per-player: in co-op everyone in the same place gets their own drop
  if (target.kind === 'wolf' && target.level === player.level && (killer === player || session.active)) {
    inventory.add(target === world.alpha ? CONFIG.loot.alphaDrop : CONFIG.loot.wolfDrop);
  }
  if (target.kind === 'wolf' && target.level === valley && !target.cfg.raider && killer === player) jobs.onWolfKilled();
  if (target === banditChief) flags.chiefSlain = true;
  const gd = target.cfg?.goldDrop;
  if (gd && target.level === player.level && (killer === player || session.active)) inventory.addGold(Math.round(gd[0] + Math.random() * (gd[1] - gd[0])));
});
events.on('inventory', () => applyStats(player, inventory, skills));
events.on('itemAdded', ({ id, count }) => hud.toast(`${ITEMS[id].name}${count > 1 ? ` (${count})` : ''} added`));
events.on('goldAdded', ({ amount }) => hud.toast(`${amount} gold added`));
events.on('potionUsed', ({ id }) => hud.toast(`${ITEMS[id].name} used`));
let shownLevel = 1;
events.on('skillUp', ({ id, name, level }) => {
  applyStats(player, inventory, skills);
  if (!skills.maxed(id)) hud.announce(`${name} increased to ${level}`);
  const lv = pLevel();
  if (lv > shownLevel) { shownLevel = lv; hud.announce(`You reached level ${lv}`, 'Bandits, raiders and dragons grow stronger with you.'); }
});
events.on('perk', ({ id, perk }) => hud.announce(`${CONFIG.skills[id].name} mastered`, `Perk unlocked: ${perk.name}. ${perk.desc}`));
events.on('questStarted', ({ name, text }) => { hud.announce(`Quest started: ${name}`, text); save(); });
events.on('questStep', ({ text }) => { hud.toast(`New objective: ${text}`); save(); });
events.on('questDone', ({ name }) => {
  hud.announce(`Quest completed: ${name}`);
  save();
});
events.on('shoutLearned', ({ def }) => hud.announce(`Word of Power: ${def.word}`, `${def.name}. ${IS_TOUCH ? 'Tap the shout button' : 'Press Q'} to use it.`));
events.on('shout', ({ id }) => tpCam.shake(id === 'slowTime' ? 0.15 : 0.35));
events.on('bowToggled', ({ bowMode, spellMode }) => hud.toast(bowMode ? 'Bow drawn: hold to aim, release to shoot'
  : spellMode ? `Fire in hand: ${IS_TOUCH ? 'tap' : 'click'} for Firebolt, hold for Flames` : 'Sword drawn'));
events.on('sneakAttack', ({ attacker, mul }) => { if (attacker === player) hud.toast(`Sneak attack for ${mul}x damage!`); });
let noMagickaAt = 0;
events.on('noMagicka', () => { if (performance.now() - noMagickaAt > 1500) { noMagickaAt = performance.now(); hud.toast('Not enough magicka'); } });
events.on('readTome', ({ spell }) => {
  if (spell !== 'fire') return;
  if (player.knowsFire) { hud.toast('You already know these spells.'); return; }
  player.knowsFire = true;
  applyStats(player, inventory, skills);
  hud.announce('Spells learned: Firebolt, Flames', `Switch to fire with ${IS_TOUCH ? 'the weapon button' : 'B'}. ${IS_TOUCH ? 'Tap' : 'Click'} to throw, hold to burn.`);
  audio.play('word');
  save();
});
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
events.on('castBolt', () => audio.play('firebolt'));
events.on('sneakAttack', () => audio.play('thud'));
events.on('shout', ({ id }) => audio.play(id));
events.on('dragonDowned', ({ dragon: d }) => audio.play('thud', d?.pos));
events.on('skillUp', () => audio.play('levelUp'));
events.on('questDone', () => audio.play('quest'));
events.on('questStarted', () => audio.play('questStart'));
events.on('shoutLearned', () => audio.play('word'));
events.on('death', ({ target }) => { if (target === player) audio.play('death'); });
events.on('dragonDowned', () => hud.toast('The dragon crashes to the ground!'));
events.on('dragonDead', ({ dragon: d }) => {
  if (d === huntDragon) { huntWon(); jobs.onDragonSlain(); return; }
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
  const level = huntsWon + 1;                       // hunt number: name + gold
  const dcfg = { lvl: HUNT.lvl, scales: true }, lvl = enemyLevel(dcfg, pLevel()), mul = levelMul(dcfg, lvl);
  const data = {
    level, lvl,
    name: HUNT.names[Math.min(level - 1, HUNT.names.length - 1)],
    maxHp: Math.round(CONFIG.dragon.maxHealth * mul.hp * ngHp()),
    attack,
  };
  huntDragon.activate(player, { name: data.name, maxHp: data.maxHp, dmgMul: mul.dmg * ngDmg() });
  events.emit('huntStart', { dragon: huntDragon, data });
}

events.on('huntStart', ({ data }) => {
  huntDragon.name = data.name;          // guests learn the name/health from the host
  huntDragon.maxHp = data.maxHp;
  huntDragon.huntLevel = data.level;
  huntDragon.lvl = data.lvl;
  hud.announce(data.attack ? 'A dragon attacks!' : 'Dragon hunt!', `${data.name} (level ${data.lvl ?? data.level}) is coming`);
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

// ---- Day and night (the valley). The host runs the clock; co-op guests follow it. ----
const DN = CONFIG.dayNight;
let dayTime = DN.start, wasNight = null;

// Called every frame: advance time, light the valley, announce nightfall/dawn, maybe a night raid.
function updateDayNight(dt, playing) {
  if (playing && session.role !== 'guest') dayTime = (dayTime + dt / DN.length) % 1;
  const night = dayLight(dayTime).day < 0.35;
  valley.night = night;
  if (player.level === valley) applyDayNight(env, dayTime, !!flags.victory);
  hud.setClock(player.level === valley || player.level.outdoor ? (night ? '☾ Night' : '☀ Day') : '');
  if (wasNight !== null && night !== wasNight && started) {
    if (player.level === valley) hud.toast(night ? 'Night falls over the valley' : 'Dawn breaks over the valley');
    if (night && !raidBlocker() && player.pos.length() < 70 && Math.random() < DN.nightRaidChance) {   // only near the village
      hud.announce('Raiders under cover of night!', 'The bell rings in Frosthollow');
      startRaid();
    }
  }
  wasNight = night;
}

// ---- Raids on Frosthollow ----
let raidsWon = 0, shopClosedUntil = 0;
const anyPlayerUp = () => player.alive || [...session.players.values()].some(p => p.body?.alive && p.body.level === valley);

// Why a raid can't start now (null = it can). Host / solo only.
function raidBlocker() {
  if (session.role === 'guest') return 'Only the host can start a raid';
  if (raid.active) return 'A raid is already on';
  if (!quests.isDone('howlingDen')) return 'Finish the Jarl\'s first task first';
  if (player.level !== valley || !player.alive) return 'Be in the valley';
  if (dragon.alive || huntDragon.alive) return 'Not while a dragon is up';
  return null;
}

function startRaid() {
  const why = raidBlocker();
  if (why) { hud.toast(why); return; }
  raid.start(raidsWon + 1);
  bellTime = 0;
}

function repairBarricade(b) {
  if (!inventory.spend(RD.repairCost)) { hud.toast(`You need ${RD.repairCost} gold to repair it`); return; }
  b.repair();
  audio.play('chest', b.pos);
  hud.toast('Barricade repaired');
}

let bellTime = 99;
const RAID_WAVES = RD.waves.length;
events.on('raid', ({ data }) => {
  if (session.role === 'guest') raid.follow(data);
  const lv = data.level ?? 1;
  if (data.phase === 'warning') {
    bellTime = 0;
    hud.announce('Raiders approach Frosthollow!', `Raid level ${lv}. Defend the barricades! Wave 1 in ${RD.warning} seconds.`);
    audio.play('roar');
  } else if (data.phase === 'wave') {
    hud.announce(`Wave ${data.wave + 1} of ${RAID_WAVES}`, data.wave === RAID_WAVES - 1 ? 'The Draugr Warlord leads them!' : `${data.count} raiders incoming`);
    tpCam.shake(0.3);
  } else if (data.phase === 'cleared') {
    hud.announce(`Wave ${data.wave + 1} beaten`, `Next wave in ${RD.wavePause} seconds. Repair the barricades!`);
  } else if (data.phase === 'won') {
    if (player.level === valley) {
      const gold = RD.reward.gold + RD.reward.goldPerLevel * (lv - 1);
      hud.announce('Frosthollow stands!', `The raiders are beaten. Reward: ${gold} gold`);
      inventory.addGold(gold);
      if (!flags.raidWon) { flags.raidWon = true; inventory.add(RD.reward.firstWinItem); }
    }
    raidsWon++;
    audio.play('quest');
    jobs.onRaid(true);
    save();
  } else if (data.phase === 'lost') {
    shopClosedUntil = Date.now() + RD.shopClosed * 1000;
    hud.announce('Frosthollow has been plundered', 'Ingrid\'s shop burned. The village will rebuild. Ring the bell to try again.');
    jobs.onRaid(false);
    save();
  }
});

// HUD objective during a raid: wave, raiders left, barricades standing; marker on the nearest raider.
function raidObjective() {
  const left = raid.raidersLeft(), up = raid.barricadesUp, n = raid.barricades.length;
  const text = raid.phase === 'warning' ? `Get ready! Barricades ${up}/${n}`
    : raid.phase === 'pause' ? `Wave ${raid.wave + 1} beaten. Next wave soon · barricades ${up}/${n}`
      : `Wave ${raid.wave + 1}/${RAID_WAVES}: ${left} raider${left === 1 ? '' : 's'} left · barricades ${up}/${n}`;
  const near = raid.nearestRaider(player.pos);
  return { name: 'Raid on Frosthollow', text, target: { level: valley, pos: near ? near.pos : bell.pos } };
}

// ---- Post-game & New Game+ ----
const PG = CONFIG.postGame;
let ng = 0;                    // New Game+ level (enemies tougher)
const tiers = {}, refills = {}; // per dungeon: respawn tier, last refill time (ms)
const ngHp = () => 1 + PG.ngHp * ng;
const ngDmg = () => 1 + PG.ngDmg * ng;
let attackTimer = PG.dragonEvery[0];

// Set a creature's level and stats from its original config: fixed or scaling with your level
// (anything in a refilled dungeon scales too), plus New Game+ for enemies.
const pLevel = () => playerLevel(skills);
function scaleCreature(c) {
  c.baseCfg ??= { ...c.cfg };
  const b = c.baseCfg, refilled = (tiers[c.level.key] ?? 0) > 0;
  c.lvl = enemyLevel(b, pLevel(), refilled);
  const m = levelMul(b, c.lvl), enemy = c.team !== 'player';
  c.cfg = { ...b, maxHealth: b.maxHealth * m.hp * (enemy ? ngHp() : 1), biteDamage: b.biteDamage * m.dmg * (enemy ? ngDmg() : 1) };
  c.maxHp = c.cfg.maxHealth;
  if (c.alive) c.hp = Math.min(c.hp, c.maxHp) || c.maxHp;
}
for (const c of [...creatures, ...raid.raiders, ...raid.guards]) c.onRespawn = u => { scaleCreature(u); u.hp = u.maxHp; };

// After victory: a cleared dungeon refills (tougher, better loot) when you come back later.
function maybeRefillDungeon(d) {
  if (!flags.victory || session.role === 'guest') return;
  const mine = creatures.filter(c => c.level === d);
  if (mine.some(c => c.alive) || Date.now() - (refills[d.key] ?? 0) < PG.dungeonRespawn * 1000) return;
  refillDungeon(d);
}

// Refill a dungeon one tier tougher, with closed chests (post-game, or a Jarl's request).
function refillDungeon(d, quiet = false) {
  const mine = creatures.filter(c => c.level === d);
  tiers[d.key] = (tiers[d.key] ?? 0) + 1;
  refills[d.key] = Date.now();
  for (const c of mine) { c.respawns = false; c.respawn(); }
  for (const ch of chests) if (ch.level === d) { ch.opened = false; ch.openT = 0; ch.tier = tiers[d.key]; }
  if (!quiet) hud.toast(`${d.name} has new occupants... and new treasure`);
}

function newGamePlus() {
  resetting = true;
  writeSave({ ng: ng + 1, hunts: huntsWon, skills: skills.toJSON(), spells: player.knowsFire ? ['fire'] : [], shouts: { known: [], selected: null } });
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
    stolen: Object.fromEntries(strongboxes.filter(b => b.opened).map(b => [b.key, b.stolenAt ?? Date.now()])),
    campChest: campChest.opened ? campChest.openedAt ?? Date.now() : 0,
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
    raids: raidsWon,
    dayTime,
    shopClosedUntil,
    jobs: jobs.toJSON(),
    flags,
    player: { level: player.level.key ?? 'valley', pos: player.pos.toArray(), facing: player.facing, hp: player.hp,
      bowMode: player.bowMode, spellMode: player.spellMode },
    spells: player.knowsFire ? ['fire'] : [],
    inventory: inventory.toJSON(),
    skills: skills.toJSON(),
    shouts: shouts.toJSON(),
    quests: quests.toJSON(),
    world: session.role === 'guest' && guestWorld ? guestWorld : worldJSON(),
  });
}

function applySave(s) {
  inventory.load(s.inventory);
  player.knowsFire = !!s.spells?.includes('fire');
  skills.load(s.skills);
  shouts.load(s.shouts);
  huntsWon = Math.max(0, s.hunts | 0);
  raidsWon = Math.max(0, s.raids | 0);
  if (Number.isFinite(s.dayTime)) dayTime = ((s.dayTime % 1) + 1) % 1;
  shopClosedUntil = +s.shopClosedUntil || 0;
  ng = Math.max(0, s.ng | 0);
  Object.assign(tiers, s.world?.tiers);
  Object.assign(refills, s.world?.refills);
  for (const [key, t] of Object.entries(s.world?.chestTiers ?? {})) { const c = world.chest(key); if (c) c.tier = t; }
  for (const c of creatures) scaleCreature(c);   // NG+ and refill tiers
  quests.load(s.quests);
  jobs.load(s.jobs);
  Object.assign(visited, s.world?.visited);
  Object.assign(flags, s.flags);
  if (flags.voiceBlessing) shouts.cooldownMul = CONFIG.monastery.voiceBlessing;
  for (const key of s.world?.chests ?? []) world.chest(key)?.open(true);
  if (s.world?.campChest) { campChest.open(true); campChest.openedAt = +s.world.campChest; }
  for (const [key, t] of Object.entries(s.world?.stolen ?? {})) {
    const b = strongboxes.find(x => x.key === key);
    if (b) { b.open(true); b.stolenAt = +t || Date.now(); }
  }
  for (const key of s.world?.dead ?? []) creatures.find(w => w.key === key)?.removeForGood();
  if (s.world?.dragonDead) dragon.setDead();
  if (s.world?.worldEaterDead) worldEater.setDead();
  const level = levels[s.player?.level] ?? valley;
  const [x, , z] = s.player?.pos ?? [0, 0, 0];
  player.moveTo(level, new THREE.Vector3(x, 0, z), s.player?.facing ?? Math.PI);
  player.hp = Math.max(1, Math.min(player.maxHp, s.player?.hp ?? player.maxHp));
  player.bowMode = !!s.player?.bowMode;
  player.spellMode = !player.bowMode && player.knowsFire && !!s.player?.spellMode;
  enterLevel(level, player.facing);
}

const saved = loadSave();
if (saved) applySave(saved);
shownLevel = pLevel();
for (const d of Object.values(dungeons)) {
  if (d.wordWall) d.setWordLearned(shouts.known.has(d.wordWall.shout));
  if (d.secretWall) d.setSecretState(!!flags.victory, shouts.known.has(d.secretWall.shout));
}
applyStats(player, inventory, skills);
hud.setStartText(!!saved, ng ? `New Game+ ${ng}` : '');
const joinCode = new URLSearchParams(location.search).get('join');   // invite link: ?join=CODE
if (joinCode) $('cta').textContent = `${IS_TOUCH ? 'Tap' : 'Click'} to join room ${joinCode.toUpperCase()}`;

// ---- Start / pause / menu ----
let started = false;
function startGame(lock = true) {
  audio.start();   // browsers only allow sound after a tap
  if (!started) {
    started = true;
    if (!quests.has('howlingDen')) quests.start('arrival');   // new game: meet the Jarl first
    setTimeout(updateNotice, 1500);
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
  quests, inventory, flags, player, newGamePlus, jobs,
  get ng() { return ng; },
  get isGuest() { return session.role === 'guest'; },
  get shopClosed() { return Date.now() < shopClosedUntil; },
  done: line => dialog.say(line),
  trade: () => { tradeMode = true; },
  rest: () => {
    if (!inventory.spend(VIL.roomPrice)) { dialog.say('You can\'t afford a room.'); return true; }
    player.heal(player.maxHp);
    player.stamina = player.maxStamina;
    if (session.role !== 'guest' && dayLight(dayTime).day < 0.5) { dayTime = DN.morning; wasNight = false; }   // sleep till morning
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
  talkCtx.jobOffer = null;
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

// ---- Updates: one button fetches the newest version past the browser cache ----
function runUpdate(btn) {
  btn.textContent = 'Updating…';
  btn.disabled = true;
  save();
  updateGame();
}
$('build').textContent = `Build ${BUILD}`;
$('menu-update').addEventListener('click', e => runUpdate(e.currentTarget));
$('update-now').addEventListener('click', e => { e.stopPropagation(); runUpdate(e.currentTarget); });
let updateReady = false, updateToast = false;
function updateNotice() {
  if (!updateReady || !started || updateToast) return;
  updateToast = true;
  hud.toast('A new version is out: open the Bag and tap ↻ to update');
}
async function pollUpdate() {
  if (!(await checkUpdate()).newer) return;
  updateReady = true;
  $('update-now').style.display = 'inline-block';
  updateNotice();
}
pollUpdate();
setInterval(pollUpdate, 10 * 60 * 1000);

addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);

// ---- Fixed-step logic ----
let saveTimer = 0, dragonTimer = 0;
const SPAWN = new THREE.Vector3(CONFIG.player.spawn[0], 0, CONFIG.player.spawn[1]);
const IDLE_CMD = { move: { x: 0, y: 0 }, run: false, attack: false, block: false, draw: false, jump: false, interact: false, shout: false, toggleBow: false, crouch: false, cycleShout: false };
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

  if (cmd.cycleShout && shouts.cycle()) {
    const def = CONFIG.shouts[shouts.selected];
    hud.toast(`Shout: ${def.word} · ${def.name}`);
  }
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
    raid.tick(edt);
    raid.update(dt, anyPlayerUp());
  }
  projectiles.update(dt);
  magic.update(dt, [player]);
  shouts.update(dt);
  stealth.update(dt);
  for (const b of strongboxes) {   // strongboxes fill up again after a while
    if (b.opened && Date.now() - (b.stolenAt ?? 0) > ST.refill * 1000) { b.opened = false; b.openT = 0; }
  }
  if (campChest.opened && Date.now() - (campChest.openedAt ?? 0) > CONFIG.camp.chestRefill * 1000) { campChest.opened = false; campChest.openT = 0; }
  if (!visited.camp && player.level === valley && player.pos.distanceTo(camp.center) < 22) {
    visited.camp = true;
    hud.toast(`Discovered: ${CONFIG.camp.name}`);
  }
  separateBodies(entities);

  // Quest flow: Dragon Rising follows The Howling Den; the dragon comes when you're back outside.
  // After reporting the dragon, the Greybeards summon you (old saves already past that skip it).
  if (quests.isDone('howlingDen')) quests.start('dragonRising');
  if (quests.isDone('dragonRising') && !quests.has('worldEater')) quests.start('wayOfTheVoice');
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
  if (player.state === 'flames' && fireTimer <= 0) { audio.play('fire'); fireTimer = 0.28; }
  for (const d of [dragon, huntDragon, worldEater]) {
    if (d.breathing > 0 && d.alive && fireTimer <= 0 && player.level === d.level) { audio.play('fire', d.pos); fireTimer = 0.28; }
  }
  const boss = (player.level === valley && (dragon.alive || huntDragon.alive || raid.active)) || (player.level === summit && worldEater.alive);
  audio.setMood(boss ? 'boss' : 'explore');
}

// ---- Loop ----
const STEP = 1 / CONFIG.loop.tickRate;
const renderPos = new THREE.Vector3();
const TORCH = CONFIG.dungeon.torch;
const culled = [];
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
  campChest.update(dt);
  if (playing && player.level === valley && Math.random() < 0.3 && player.pos.distanceToSquared(camp.center) < 3600) fx.burn(camp.fire, 0.4, 1);
  raid.render(alpha, dt);
  bell.swing(bellTime += dt);
  if (playing && player.level === valley && Date.now() < shopClosedUntil && Math.random() < 0.25) fx.burn({ x: 14 + (Math.random() - 0.5) * 6, y: 3.2, z: -4 }, 1.5, 2);
  for (const b of strongboxes) b.update(dt);
  for (const p of session.players.values()) {   // co-op players holding Flames
    const r = p.remote, root = r.model.root;
    if (playing && root.visible && r.pose?.state === 'flames' && Math.random() < 0.5) magic.flameFx(root.position, root.rotation.y);
  }
  for (const n of npcs) {                          // villagers hide in the longhouse during a raid
    n.update(dt, player, dialog.npc === n);
    if (n.level === valley) n.model.root.visible = n.model.shadow.visible = !raid.active;
  }
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
  if (raid.active) obj = raidObjective();
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
  hud.setStealth(player, stealth);
  hud.setSlow(shouts.slowLeft > 0 || (session.role === 'guest' && session.mirror.slow));
  if (session.role === 'guest') {
    for (const d of [dragon, huntDragon, worldEater]) if (d.state === 'soul' && Math.random() < 0.5) fx.soul({ x: d.pos.x, y: d.pos.y + 2, z: d.pos.z }, player.pos, 2);
  }
  hud.setBoss(raid.active && player.level === valley ? raid.warlord : player.level === summit ? (worldEater.alive ? worldEater : null)
    : player.level !== valley ? null : dragon.alive ? dragon : huntDragon.alive ? huntDragon : null);

  updateDayNight(dt, playing);
  updateSound(dt);
  hud.frame(dt, player);
  // Creatures beyond the fog can't be seen anyway: skip their draw calls this frame
  const fogFar2 = (scene.fog.far + 4) ** 2;
  for (const c of creatures) {
    const { root, shadow } = c.model;
    if (root.visible && root.position.distanceToSquared(camera.position) > fogFar2) { root.visible = shadow.visible = false; culled.push(c); }
  }
  renderer.render(scene, camera);
  for (const c of culled) c.model.root.visible = c.model.shadow.visible = true;
  culled.length = 0;
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
  valley, entrances, interactables, projectiles, magic, stealth, strongboxes, fx, save, menu, session, coopPanel,
  tpCam, renderer,
  go: (level, at, facing = 0) => { player.moveTo(level, at, facing); enterLevel(level, facing); },
  dragonAttack: () => startHunt(true), get ng() { return ng; }, tiers, refills, raid, jobs, tower, bell, startRaid,
  get raidsWon() { return raidsWon; }, combat, get dayTime() { return dayTime; }, set dayTime(t) { dayTime = t; }, camp, banditChief, campChest, monastery, ustengrav, get playerLevel() { return pLevel(); },
};

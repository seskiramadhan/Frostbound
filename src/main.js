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
const levels = { valley, ...dungeons };
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
const dragon = entities.add(new Dragon(scene, valley, events, fx));
const chests = Object.values(dungeons).flatMap(d => d.chests.map(c => new Chest(scene, d, c.pos, c.lootKey, Math.PI)));
const projectiles = new Projectiles(scene, entities, combat);
const tpCam = new ThirdPersonCamera(camera, valley);
tpCam.yaw = player.facing + Math.PI; // start behind the player

const inventory = new Inventory(events);
const skills = new Skills(events, player);
const shouts = new Shouts(events, entities, combat, fx);
const visited = {};
const world = {
  valley, den, barrow, entrances, inventory, visited, shouts, dragon, alpha: bosses.den,
  chest: key => chests.find(c => c.key === key),
};
const quests = new Quests(events, world);

const hud = new Hud();
const session = new Session(events, scene, player, inventory);
const coopPanel = new CoopPanel(session);
const menu = new Menu(inventory, skills, player, shouts, coopPanel);
const input = new Input(renderer.domElement, $('joy'), $('joy-knob'), {
  jump: $('btn-jump'), interact: $('btn-interact'), menu: $('btn-bag'), shout: $('btn-shout'), bow: $('btn-bow'),
});

// ---- Travel between levels ----
let busy = false;   // fading between levels
function travel(level, at, facing) {
  busy = true;
  hud.fade(() => {
    player.moveTo(level, at, facing);
    enterLevel(level, facing);
    busy = false;
    save();
  }, CONFIG.interact.fadeTime);
}

function enterLevel(level, facing) {
  tpCam.level = level;
  tpCam.yaw = facing + Math.PI;
  tpCam.snap();
  applyAmbience(env, level.name);
  snow.points.visible = level === valley;
  if (level.key) visited[level.key] = true;
}

function openChest(chest) {
  chest.open();
  const loot = CONFIG.loot[chest.lootKey];
  for (const [id, n] of Object.entries(loot.items)) inventory.add(id, n);
  if (loot.gold) inventory.addGold(loot.gold);
  save();
}

function learnWord(d) {
  const w = d.wordWall;
  fx.soul({ x: w.pos.x, y: 1, z: w.pos.z }, player.pos, 30);
  shouts.learn(w.shout);
  d.setWordLearned(true);
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
    return list;
  }),
  ...chests.map(c => ({ level: c.level, pos: c.pos, label: 'Open chest', enabled: () => !c.opened, use: () => openChest(c) })),
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
  if (target.kind === 'wolf' && killer === player) {
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
events.on('questDone', ({ name }) => { hud.announce(`Quest completed: ${name}`); save(); });
events.on('shoutLearned', ({ def }) => hud.announce(`Word of Power: ${def.word}`, `${def.name}. ${IS_TOUCH ? 'Tap the shout button' : 'Press Q'} to use it.`));
events.on('shout', ({ id }) => tpCam.shake(id === 'slowTime' ? 0.15 : 0.35));
events.on('bowToggled', ({ bowMode }) => hud.toast(bowMode ? 'Bow drawn: hold to aim, release to shoot' : 'Sword drawn'));
events.on('netPlayerJoined', ({ name }) => { hud.toast(`${name} joined the game`); if (menu.open) menu.render(); });
events.on('netPlayerLeft', ({ name }) => { hud.toast(`${name} left the game`); if (menu.open) menu.render(); });
events.on('netEnded', ({ reason }) => { hud.toast(reason); if (menu.open) menu.render(); });
events.on('dragonRoar', () => { hud.announce('A dragon approaches!'); tpCam.shake(0.45); });
events.on('dragonDowned', () => hud.toast('The dragon crashes to the ground!'));
events.on('dragonDead', () => {
  dragon.char();
  shouts.learn('fireBreath', true);
  shouts.select('fireBreath');
  hud.announce('Dragon soul absorbed', `Word of Power: ${CONFIG.shouts.fireBreath.word}. ${CONFIG.shouts.fireBreath.name}`);
  save();
});

// ---- Save / load ----
let resetting = false;
function save() {
  if (resetting || !started || !player.alive) return;
  writeSave({
    player: { level: player.level.key ?? 'valley', pos: player.pos.toArray(), facing: player.facing, hp: player.hp, bowMode: player.bowMode },
    inventory: inventory.toJSON(),
    skills: skills.toJSON(),
    shouts: shouts.toJSON(),
    quests: quests.toJSON(),
    world: {
      chests: chests.filter(c => c.opened).map(c => c.key),
      dead: creatures.filter(w => w.key && !w.alive).map(w => w.key),
      dragonDead: dragon.state === 'dead',
      visited,
    },
  });
}

function applySave(s) {
  inventory.load(s.inventory);
  skills.load(s.skills);
  shouts.load(s.shouts);
  quests.load(s.quests);
  Object.assign(visited, s.world?.visited);
  for (const key of s.world?.chests ?? []) world.chest(key)?.open(true);
  for (const key of s.world?.dead ?? []) creatures.find(w => w.key === key)?.removeForGood();
  if (s.world?.dragonDead) dragon.setDead();
  const level = levels[s.player?.level] ?? valley;
  const [x, , z] = s.player?.pos ?? [0, 0, 0];
  player.moveTo(level, new THREE.Vector3(x, 0, z), s.player?.facing ?? Math.PI);
  player.hp = Math.max(1, Math.min(player.maxHp, s.player?.hp ?? player.maxHp));
  player.bowMode = !!s.player?.bowMode;
  enterLevel(level, player.facing);
}

const saved = loadSave();
if (saved) applySave(saved);
for (const d of Object.values(dungeons)) if (d.wordWall) d.setWordLearned(shouts.known.has(d.wordWall.shout));
applyStats(player, inventory, skills);
hud.setStartText(!!saved);
const joinCode = new URLSearchParams(location.search).get('join');   // invite link: ?join=CODE
if (joinCode) $('cta').textContent = `${IS_TOUCH ? 'Tap' : 'Click'} to join room ${joinCode.toUpperCase()}`;

// ---- Start / pause / menu ----
let started = false;
function startGame(lock = true) {
  if (!started) {
    started = true;
    quests.start('howlingDen');   // no-op when loaded from a save
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

function openMenu(tab) {
  if (!started || menu.open || !player.alive) return;
  menu.show(true, tab);
  if (!IS_TOUCH) document.exitPointerLock?.();
}
function closeMenu() {
  if (!menu.open) return;
  menu.show(false);
  if (!IS_TOUCH) { hud.showOverlay(true); input.requestLock(); }   // overlay hides once the lock is back
}
input.onMenu = () => (menu.open ? closeMenu() : openMenu());
input.onEscape = closeMenu;
menu.onClose = closeMenu;
input.onLockChange = locked => { if (!menu.open) hud.showOverlay(!locked); };

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
  for (const c of creatures) c.tick(edt);
  dragon.tick(edt);
  projectiles.update(dt);
  shouts.update(dt);
  separateBodies(entities);

  // Quest flow: Dragon Rising follows The Howling Den; the dragon comes when you're back outside
  if (quests.isDone('howlingDen')) quests.start('dragonRising');
  if (quests.stepText('dragonRising') === 'Slay the dragon' && dragon.state === 'inactive'
    && player.level === valley && player.alive) {
    if ((dragonTimer += dt) > CONFIG.dragon.arriveDelay) dragon.activate(player);
  }
  quests.update();

  if ((saveTimer += dt) >= CONFIG.save.autosaveInterval) { saveTimer = 0; save(); }
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
  const controls = input.active && !menu.open;
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
  player.render(alpha, renderPos);
  for (const c of creatures) c.render(alpha);
  dragon.render(alpha);
  for (const c of chests) c.update(dt);
  for (const d of Object.values(dungeons)) d.update(dt);
  if (playing) fx.update(dt * (shouts.timeScale < 1 ? 0.6 : 1));
  if (started) session.update(dt);
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
  hud.setSlow(shouts.slowLeft > 0);
  hud.setBoss(dragon.alive && player.level === valley ? dragon : null);

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
  player, creatures, dragon, entities, events, inventory, skills, shouts, quests, chests, dungeons, den, barrow,
  valley, entrances, interactables, projectiles, fx, save, menu, session, coopPanel,
  tpCam,
  go: (level, at, facing = 0) => { player.moveTo(level, at, facing); enterLevel(level, facing); },
};

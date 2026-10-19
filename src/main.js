// Boot + game loop (fixed timestep logic, render every frame).
import * as THREE from 'three';
import { CONFIG, IS_TOUCH } from './config.js';
import { Input } from './input.js';
import { Terrain } from './world/terrain.js';
import { buildProps } from './world/props.js';
import { setupEnvironment, applyAmbience, Snow } from './world/environment.js';
import { Dungeon, FROSTFANG_DEN, buildCaveEntrance } from './world/dungeon.js';
import { Chest } from './world/chest.js';
import { Player } from './entities/player.js';
import { spawnWolfPack, spawnDungeonWolves } from './entities/wolf.js';
import { EventBus } from './systems/events.js';
import { EntityRegistry } from './systems/entities.js';
import { Combat } from './systems/combat.js';
import { separateBodies } from './systems/physics.js';
import { Inventory, ITEMS } from './systems/inventory.js';
import { Skills, applyStats } from './systems/skills.js';
import { Quests } from './systems/quests.js';
import { loadSave, writeSave, clearSave } from './systems/save.js';
import { ThirdPersonCamera } from './camera.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';

const R = CONFIG.render;
const $ = id => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? R.maxPixelRatioMobile : R.maxPixelRatioDesktop));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(R.fov, innerWidth / innerHeight, R.near, R.far);
const env = setupEnvironment(scene);

// Levels: the valley and Frostfang Den (built far away; fog hides one from the other)
const valley = new Terrain();
scene.add(valley.mesh);
const props = buildProps(valley);
scene.add(props.group);
valley.colliders = props.colliders;
const entrance = buildCaveEntrance(valley);
scene.add(entrance.group);
valley.colliders.push(...entrance.colliders);
const den = new Dungeon(FROSTFANG_DEN);
scene.add(den.group);
const levels = { valley, den };
const snow = new Snow(scene);

const events = new EventBus();
const entities = new EntityRegistry();
new Combat(events, entities);

const player = entities.add(new Player(scene, valley, events, entities));
const denWolves = spawnDungeonWolves(scene, den, events, entities);
const wolves = [...spawnWolfPack(scene, valley, events, entities), ...denWolves.wolves];
const chests = den.chests.map(c => new Chest(scene, den, c.pos, c.lootKey, Math.PI));
const tpCam = new ThirdPersonCamera(camera, valley);
tpCam.yaw = player.facing + Math.PI; // start behind the player

const inventory = new Inventory(events);
const skills = new Skills(events, player);
const visited = {};
const world = {
  valley, den, entrance, inventory, visited, alpha: denWolves.alpha,
  chest: key => chests.find(c => c.key === key),
};
const quests = new Quests(events, world);

const hud = new Hud();
const menu = new Menu(inventory, skills, player);
const input = new Input(renderer.domElement, $('joy'), $('joy-knob'),
  { jump: $('btn-jump'), interact: $('btn-interact'), menu: $('btn-bag') });

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

// Things you can walk up to and press E / Use on
const interactables = [
  { level: valley, pos: entrance.front, label: `Enter ${den.name}`, use: () => travel(den, den.start, 0) },
  { level: den, pos: den.exit, label: `Leave ${den.name}`, use: () => travel(valley, entrance.outside, entrance.facing) },
  ...chests.map(c => ({ level: den, pos: c.pos, label: 'Open chest', enabled: () => !c.opened, use: () => openChest(c) })),
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

// ---- Feedback ----
const SHAKE = CONFIG.combat.shake;
events.on('damage', ({ target }) => {
  if (target === player) { hud.hurt(); tpCam.shake(SHAKE.hit); }
  else hud.showTarget(target);
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

// ---- Save / load ----
let resetting = false;
function save() {
  if (resetting || !started || !player.alive) return;
  writeSave({
    player: { level: player.level === den ? 'den' : 'valley', pos: player.pos.toArray(), facing: player.facing, hp: player.hp },
    inventory: inventory.toJSON(),
    skills: skills.toJSON(),
    quests: quests.toJSON(),
    world: {
      chests: chests.filter(c => c.opened).map(c => c.key),
      dead: wolves.filter(w => w.key && !w.alive).map(w => w.key),
      visited,
    },
  });
}

function applySave(s) {
  inventory.load(s.inventory);
  skills.load(s.skills);
  quests.load(s.quests);
  Object.assign(visited, s.world?.visited);
  for (const key of s.world?.chests ?? []) world.chest(key)?.open(true);
  for (const key of s.world?.dead ?? []) wolves.find(w => w.key === key)?.removeForGood();
  const level = levels[s.player?.level] ?? valley;
  const [x, , z] = s.player?.pos ?? [0, 0, 0];
  player.moveTo(level, new THREE.Vector3(x, 0, z), s.player?.facing ?? Math.PI);
  player.hp = Math.max(1, Math.min(player.maxHp, s.player?.hp ?? player.maxHp));
  enterLevel(level, player.facing);
}

const saved = loadSave();
if (saved) applySave(saved);
applyStats(player, inventory, skills);
hud.setStartText(!!saved);

// ---- Start / pause / menu ----
let started = false;
hud.overlay.addEventListener('click', e => {
  if (e.target.id === 'newgame') return;
  if (!started) {
    started = true;
    quests.start('howlingDen');   // no-op when loaded from a save
  }
  if (IS_TOUCH) {
    hud.showOverlay(false);
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    input.requestLock();
  }
});
$('newgame').addEventListener('click', e => {
  e.stopPropagation();
  resetting = true;
  clearSave();
  location.reload();
});

function openMenu() {
  if (!started || menu.open || !player.alive) return;
  menu.show(true);
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
let saveTimer = 0;
const SPAWN = new THREE.Vector3(CONFIG.player.spawn[0], 0, CONFIG.player.spawn[1]);
function tick(dt) {
  const cmd = input.update();
  if (player.canRespawn && cmd.attack) {
    const inDen = player.level === den;
    player.respawn(player.level, inDen ? den.start : SPAWN, inDen ? 0 : Math.PI);
    enterLevel(player.level, player.facing);
    hud.showDeath(false);
    cmd.attack = false;
  }

  const near = player.alive && !busy ? nearestInteractable() : null;
  hud.setPrompt(near?.label ?? null);
  if (near && cmd.interact) near.use();

  player.tick(dt, cmd, tpCam.yaw);
  for (const w of wolves) w.tick(dt);
  separateBodies(entities);
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

  const playing = started && input.active && !menu.open;
  if (playing) {
    const look = input.consumeLook();
    tpCam.look(look.x, look.y);
    acc += dt;
    while (acc >= STEP) {
      tick(STEP);
      acc -= STEP;
    }
  } else {
    input.consumeLook();
    acc = 0;
  }

  const alpha = playing ? acc / STEP : 1;
  player.render(alpha, renderPos);
  for (const w of wolves) w.render(alpha);
  for (const c of chests) c.update(dt);
  den.update(dt);
  tpCam.update(dt, renderPos);
  // Carried light sits between player and camera so the side you see is lit
  env.torch.position.set(renderPos.x, renderPos.y + TORCH.height, renderPos.z).lerp(camera.position, 0.45);
  if (snow.points.visible) snow.update(dt, renderPos);

  // Objective + marker (points at the door when the target is on another level)
  let obj = started ? quests.active() : null;
  let mark = null;
  if (obj?.target) {
    if (obj.target.level === player.level) mark = obj.target.pos;
    else mark = player.level === den ? den.exit : entrance.front;
  } else if (started && player.level === den) {
    // Nothing left to do down here: show the way out
    obj = { name: den.name, text: `Leave ${den.name}` };
    mark = den.exit;
  }
  hud.setObjective(obj);
  hud.setMarker(mark, camera, player.pos);

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
window.frostbound = { player, wolves, entities, events, inventory, skills, quests, chests, den, valley, entrance, interactables, save, menu };

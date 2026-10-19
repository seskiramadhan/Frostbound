// Boot + game loop (fixed timestep logic, render every frame).
import * as THREE from 'three';
import { CONFIG, IS_TOUCH } from './config.js';
import { Input } from './input.js';
import { Terrain } from './world/terrain.js';
import { buildProps } from './world/props.js';
import { setupEnvironment, Snow } from './world/environment.js';
import { Player } from './entities/player.js';
import { ThirdPersonCamera } from './camera.js';
import { Hud } from './ui/hud.js';

const R = CONFIG.render;

const renderer = new THREE.WebGLRenderer({ antialias: !IS_TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? R.maxPixelRatioMobile : R.maxPixelRatioDesktop));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(R.fov, innerWidth / innerHeight, R.near, R.far);
setupEnvironment(scene);

const terrain = new Terrain();
scene.add(terrain.mesh);
const props = buildProps(terrain);
scene.add(props.group);
const snow = new Snow(scene);

const player = new Player(scene, terrain, props.colliders);
const tpCam = new ThirdPersonCamera(camera, terrain);
tpCam.yaw = player.facing + Math.PI; // start behind the player

const hud = new Hud();
const input = new Input(renderer.domElement, document.getElementById('joy'), document.getElementById('joy-knob'));

// Start / pause
let started = false;
hud.overlay.addEventListener('click', () => {
  started = true;
  if (IS_TOUCH) {
    hud.showOverlay(false);
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    input.requestLock();
  }
});
input.onLockChange = locked => hud.showOverlay(!locked);

// Loop
const STEP = 1 / CONFIG.loop.tickRate;
const renderPos = new THREE.Vector3();
let acc = 0, last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, CONFIG.loop.maxFrameTime);
  last = now;

  const playing = started && input.active;
  if (playing) {
    const look = input.consumeLook();
    tpCam.look(look.x, look.y);
    acc += dt;
    while (acc >= STEP) {
      input.update();
      player.tick(STEP, input.move, input.run, tpCam.yaw);
      acc -= STEP;
    }
  } else {
    input.consumeLook();
    acc = 0;
  }

  player.render(playing ? acc / STEP : 1, renderPos);
  tpCam.update(dt, renderPos);
  snow.update(dt, renderPos);
  hud.frame(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

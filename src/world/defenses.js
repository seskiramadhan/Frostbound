// Frosthollow's defences for raids: barricades (breakable, repairable), the alarm bell and a
// watchtower you can stand on. Each piece is one merged, vertex-coloured mesh.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { mergeColored } from './props.js';

const R = CONFIG.raid;
const C = { wood: 0x6b4a2e, dark: 0x3c2c1e, tip: 0xc8b48a, iron: 0x4a4c50, bell: 0xa8863a, snow: 0xeef2f6 };

// Collect transformed boxes/cones into one mesh. part(geo, color, x, y, z, rx, ry, rz)
function kit() {
  const parts = [], M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const part = (geo, color, x, y, z, rx = 0, ry = 0, rz = 0) => {
    geo.applyMatrix4(M.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), one));
    parts.push({ geo, color });
  };
  const mesh = () => {
    const m = new THREE.Mesh(mergeColored(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.matrixAutoUpdate = false;
    return m;
  };
  return { part, mesh };
}

// Wooden spike wall across a lane. A combat entity on the players' side (team 'player',
// kind 'barricade'): raiders attack it, it never moves, and it can be repaired with gold.
export class Barricade {
  constructor(scene, level, x, z) {
    this.kind = 'barricade';
    this.team = 'player';
    this.name = 'Barricade';
    this.fixed = true;
    this.radius = 1.3;
    this.aimHeight = 0.8;
    this.level = level;
    this.pos = new THREE.Vector3(x, level.heightAt(x, z), z);
    this.prevPos = this.pos.clone();
    this.vel = new THREE.Vector3();
    this.facing = this.prevFacing = Math.atan2(x, z);        // stakes lean out, away from the village
    this.maxHp = this.hp = R.barricadeHp;
    this.alive = true;
    this.state = 'up';
    this.stateTime = 0;
    this.collider = { x, z, r: 1.2 };
    level.colliders.push(this.collider);

    const up = kit(), down = kit();
    for (let k = -2; k <= 2; k++) {                          // five stakes leaning outward
      up.part(new THREE.BoxGeometry(0.18, 2.2, 0.18), C.wood, k * 0.55, 0.9, 0, 0.5, 0, 0);
      up.part(new THREE.ConeGeometry(0.12, 0.35, 4), C.tip, k * 0.55, 1.95, 0.48, 0.5, 0, 0);
      down.part(new THREE.BoxGeometry(0.18, 2.2, 0.18), C.dark, k * 0.55 + 0.1, 0.12, 0.3 * (k % 2), Math.PI / 2, 0.3 * k, 0);
    }
    up.part(new THREE.BoxGeometry(3, 0.16, 0.16), C.dark, 0, 0.55, -0.2);
    up.part(new THREE.BoxGeometry(3, 0.16, 0.16), C.dark, 0, 1.0, 0.05);
    this.model = { root: new THREE.Group(), shadow: new THREE.Object3D() };
    this.upMesh = up.mesh();
    this.downMesh = down.mesh();
    this.downMesh.visible = false;
    this.model.root.add(this.upMesh, this.downMesh);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.facing;
    scene.add(this.model.root);
    this.shake = 0;
  }

  get blocking() { return false; }

  onHit() { this.shake = 0.25; }
  die() { this.alive = false; this.state = 'broken'; }
  repair() { this.hp = this.maxHp; this.alive = true; this.state = 'up'; }

  // Also keeps the collider in step with alive (co-op guests get `alive` from the host).
  render(dt) {
    this.collider.r = this.alive ? 1.2 : -99;              // broken: raiders walk through
    this.upMesh.visible = this.alive;
    this.downMesh.visible = !this.alive;
    this.shake = Math.max(0, this.shake - dt);
    this.model.root.rotation.z = this.shake > 0 ? Math.sin(this.shake * 60) * 0.04 : 0;
  }
}

// The alarm bell in the square: a timber frame with a bronze bell. Returns { mesh, pos, swing(t) }.
export function buildBell(scene, level) {
  const [x, z] = R.bell, y = level.heightAt(x, z);
  const k = kit();
  for (const s of [-0.7, 0.7]) k.part(new THREE.BoxGeometry(0.18, 2.6, 0.18), C.wood, s, 1.3, 0);
  k.part(new THREE.BoxGeometry(1.8, 0.2, 0.25), C.dark, 0, 2.6, 0);
  k.part(new THREE.BoxGeometry(1.9, 0.08, 0.35), C.snow, 0, 2.74, 0);
  const frame = k.mesh();
  frame.position.set(x, y, z);
  frame.updateMatrix();
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.38, 0.55, 8, 1, true).translate(0, -0.35, 0),
    new THREE.MeshLambertMaterial({ color: C.bell, flatShading: true, side: THREE.DoubleSide }));
  bell.position.set(x, y + 2.5, z);
  scene.add(frame, bell);
  level.colliders.push({ x, z, r: 0.8 });
  return { pos: new THREE.Vector3(x, y, z), swing: t => { bell.rotation.z = Math.sin(t * 9) * 0.5 * Math.max(0, 1 - t / 3); } };
}

// Watchtower: four posts, an open railed platform you can stand on (a valley platform), a ladder.
// Returns { base, top } positions for the climb interactions.
export function buildTower(scene, level) {
  const T = R.tower, h = T.height, s = T.size / 2, y = level.heightAt(T.x, T.z);
  const k = kit();
  for (const sx of [-s, s]) for (const sz of [-s, s]) {                                  // open top: no roof, so the camera can see
    k.part(new THREE.BoxGeometry(0.28, h + 1.1, 0.28), C.wood, sx, (h + 1.1) / 2, sz);
    level.colliders.push({ x: T.x + sx, z: T.z + sz, r: 0.25 });
  }
  k.part(new THREE.BoxGeometry(T.size + 0.4, 0.22, T.size + 0.4), C.dark, 0, h - 0.11, 0);   // floor
  for (const [w, d, px, pz] of [[T.size, 0.1, 0, -s], [T.size, 0.1, 0, s], [0.1, T.size, -s, 0], [0.1, T.size, s, 0]]) {
    k.part(new THREE.BoxGeometry(w, 0.1, d), C.wood, px, h + 0.9, pz);                   // railing
  }
  for (let r = 0; r < 7; r++) k.part(new THREE.BoxGeometry(0.7, 0.08, 0.08), C.dark, 0, 0.5 + r * (h / 7), -s - 0.05);  // ladder rungs
  for (const lx of [-0.35, 0.35]) k.part(new THREE.BoxGeometry(0.08, h, 0.08), C.wood, lx, h / 2, -s - 0.05);
  const mesh = k.mesh();
  mesh.position.set(T.x, y, T.z);
  mesh.updateMatrix();
  scene.add(mesh);
  level.platforms.push({ x: T.x, z: T.z, hw: s + 0.2, hd: s + 0.2, y: y + h });
  return {
    base: new THREE.Vector3(T.x, y, T.z - s - 1.2),
    top: new THREE.Vector3(T.x, y + h, T.z),
    height: y + h,
  };
}

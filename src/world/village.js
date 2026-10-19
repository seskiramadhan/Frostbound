// Frosthollow: a small Nord village on the flat valley floor around the player spawn.
// Every building, fence and prop is merged into one vertex-coloured mesh (one draw call).
// Buildings are axis-aligned boxes for collision. Returns NPC spots for the villagers.
import * as THREE from 'three';
import { mergeColored } from './props.js';

const C = {
  stone: 0x6f7377, timber: 0x6b4a2e, dark: 0x3c2c1e, roof: 0x4f3d2c, snow: 0xeef2f6,
  door: 0x2e2117, banner: 0x7a2a22, fire: 0xffa040, sign: 0x8a6a44, cloth: 0x9a8f80,
};

const ROOF_PITCH = 0.62;   // radians

// One building: stone footing, timber walls, gable roof with snow, door on one side.
// side: which way the door faces ('+z' | '-z' | '+x' | '-x').
function building(parts, x, z, w, d, h, side, extra = {}) {
  const add = (geo, color, m) => { geo.applyMatrix4(m); parts.push({ geo, color }); };
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
  const at = (px, py, pz, rx = 0, ry = 0, rz = 0) => M.compose(new THREE.Vector3(x + px, py, z + pz), q.setFromEuler(e.set(rx, ry, rz)), s);

  add(new THREE.BoxGeometry(w + 0.4, 0.6, d + 0.4), C.stone, at(0, 0.3, 0));
  add(new THREE.BoxGeometry(w, h, d), C.timber, at(0, 0.6 + h / 2, 0));
  // Corner posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(new THREE.BoxGeometry(0.35, h + 0.2, 0.35), C.dark, at(sx * w / 2, 0.6 + h / 2, sz * d / 2));
  }
  // Gable roof along x: two sloped planks + snow, triangular ends
  const top = 0.6 + h, hd = d / 2, rise = Math.tan(ROOF_PITCH) * hd, len = hd / Math.cos(ROOF_PITCH) + 0.5;
  for (const sz of [-1, 1]) {
    add(new THREE.BoxGeometry(w + 1, 0.25, len), C.roof, at(0, top + rise / 2, sz * hd / 2, sz * ROOF_PITCH, 0, 0));
    add(new THREE.BoxGeometry(w + 1.05, 0.08, len * 0.85), C.snow, at(0, top + rise / 2 + 0.17, sz * hd / 2 - sz * 0.15, sz * ROOF_PITCH, 0, 0));
  }
  for (const sx of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      sx * w / 2, top, -hd, sx * w / 2, top, hd, sx * w / 2, top + rise, 0,
    ], 3));
    g.setIndex(sx > 0 ? [0, 2, 1] : [0, 1, 2]);
    add(g, C.timber, new THREE.Matrix4().makeTranslation(x, 0, z));
  }
  // Door (+ awning) on the chosen side
  const dw = extra.doorWidth ?? 1.4;
  const [dx, dz, ry] = { '+z': [0, hd, 0], '-z': [0, -hd, Math.PI], '+x': [w / 2, 0, Math.PI / 2], '-x': [-w / 2, 0, -Math.PI / 2] }[side];
  add(new THREE.BoxGeometry(dw, 2.2, 0.15), C.door, at(dx, 0.6 + 1.1, dz, 0, ry));
  const ox = Math.sin(ry) * 0.6, oz = Math.cos(ry) * 0.6;
  add(new THREE.BoxGeometry(dw + 1.2, 0.15, 1.2), C.roof, at(dx + ox, 0.6 + 2.6, dz + oz, 0.25 * Math.cos(ry), ry, 0));
  if (extra.sign) {
    const sx = Math.sin(ry), sz2 = Math.cos(ry);
    add(new THREE.BoxGeometry(1.2, 0.6, 0.08), extra.sign, at(dx + sx * 0.3 + Math.cos(ry) * (dw / 2 + 0.9), 0.6 + 2.2, dz + sz2 * 0.3 - Math.sin(ry) * (dw / 2 + 0.9), 0, ry));
  }
  if (extra.chimney) add(new THREE.BoxGeometry(0.7, 1.6, 0.7), C.stone, at(w * 0.3, top + rise * 0.6, -hd * 0.3));
  return { x, z, hw: w / 2 + 0.2, hd: d / 2 + 0.2 };
}

export function buildVillage(terrain) {
  const parts = [];
  const colliders = [];
  const y = (x, z) => terrain.heightAt(x, z);   // flat here, but stay honest

  colliders.push(building(parts, 0, -18, 14, 8, 3.6, '+z', { doorWidth: 2, chimney: true }));      // Jarl's longhouse
  colliders.push(building(parts, -14, -4, 9, 8, 3, '+x', { sign: 0x7a5634, chimney: true }));      // The Sleeping Bear (inn)
  colliders.push(building(parts, 14, -4, 8, 7, 2.8, '-x', { sign: 0x2e5a3a }));                    // Ingrid's shop
  colliders.push(building(parts, -13, 12, 6, 6, 2.6, '+x'));                                         // hunter's lodge
  colliders.push(building(parts, 13, 12, 7, 6, 2.6, '-x', { chimney: true }));                       // Sven's house

  const M = new THREE.Matrix4();
  const put = (geo, color, x, py, z, ry = 0) => {
    geo.applyMatrix4(M.makeRotationY(ry).setPosition(x, py, z));
    parts.push({ geo, color });
  };
  // Banners on the longhouse
  for (const sx of [-4, 4]) put(new THREE.BoxGeometry(1, 2.2, 0.08), C.banner, sx, y(sx, -13.8) + 2.6, -13.8);
  // Fire pit at the side of the square (clear of the spawn view)
  const FP = { x: 5, z: 4 };
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    put(new THREE.BoxGeometry(0.5, 0.4, 0.45), C.stone, FP.x + Math.cos(a) * 1.1, y(FP.x, FP.z) + 0.2, FP.z + Math.sin(a) * 1.1, a);
  }
  put(new THREE.ConeGeometry(0.55, 1.2, 5), C.fire, FP.x, y(FP.x, FP.z) + 0.6, FP.z);
  colliders.push({ x: FP.x, z: FP.z, r: 1.3 });
  // Market stall in front of the shop
  put(new THREE.BoxGeometry(2.6, 0.9, 1.1), C.timber, 9.2, y(9.2, -4) + 0.45, -4, Math.PI / 2);
  put(new THREE.BoxGeometry(3, 0.12, 1.8), C.cloth, 9.4, y(9.2, -4) + 2.3, -4, Math.PI / 2);
  for (const sz of [-1.3, 1.3]) put(new THREE.BoxGeometry(0.15, 2.3, 0.15), C.dark, 9.0, y(9, -4) + 1.15, -4 + sz);
  colliders.push({ x: 9.2, z: -4, hw: 0.7, hd: 1.4 });
  // Drying rack with pelts at the hunter's lodge
  for (const sz of [-1, 1]) put(new THREE.BoxGeometry(0.15, 2, 0.15), C.dark, -8.6, y(-8.6, 12) + 1, 12 + sz * 1.3);
  put(new THREE.BoxGeometry(0.12, 0.12, 3), C.dark, -8.6, y(-8.6, 12) + 1.95, 12);
  for (const sz of [-0.7, 0.5]) put(new THREE.BoxGeometry(0.06, 1.1, 0.8), 0x8c9096, -8.6, y(-8.6, 12) + 1.35, 12 + sz);
  colliders.push({ x: -8.6, z: 12, hw: 0.3, hd: 1.5 });
  // Fence posts along the edges
  for (let k = -5; k <= 5; k++) {
    for (const fz of [24]) put(new THREE.BoxGeometry(0.2, 1.2, 0.2), C.dark, k * 3, y(k * 3, fz) + 0.6, fz);
    put(new THREE.BoxGeometry(3, 0.12, 0.1), C.dark, k * 3 + 1.5, y(k * 3, 24) + 0.9, 24);
  }

  const mesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  mesh.matrixAutoUpdate = false;

  // Where each villager stands / wanders (world positions)
  const V = (x, z) => new THREE.Vector3(x, y(x, z), z);
  const spots = {
    jarl: [V(0, -12.2), V(2.5, -12)],
    merchant: [V(8.2, -4), V(8.4, -2.4)],
    innkeeper: [V(-8.6, -4), V(-8.4, -1.6)],
    hunter: [V(-7.4, 10.4), V(-6.6, 13.4)],
    sven: [V(8.6, 12.2), V(7, 14)],
  };
  return { mesh, colliders, spots, firePit: V(FP.x, FP.z) };
}

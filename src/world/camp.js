// The bandit camp in the western forest: hide tents around a campfire, crates, a lookout post.
// One merged vertex-coloured mesh. Returns where things are; main.js spawns the bandits and chest.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { mergeColored } from './props.js';

const C = { hide: 0x8a6a48, hideDark: 0x6a5038, pole: 0x3c2c1e, crate: 0x7a5634, stone: 0x6f7377, fire: 0xffa040, red: 0x7a2a22 };

export function buildCamp(scene, terrain) {
  const [cx, cz] = CONFIG.camp.at;
  const parts = [], colliders = [];
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const y = (x, z) => terrain.heightAt(x, z);
  const put = (geo, color, x, py, z, ry = 0, rx = 0, rz = 0) => {
    geo.applyMatrix4(M.compose(new THREE.Vector3(x, y(x, z) + py, z), q.setFromEuler(e.set(rx, ry, rz)), one));
    parts.push({ geo, color });
  };

  // Three tents around the fire, doors facing it
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 + 0.4, x = cx + Math.cos(a) * 7, z = cz + Math.sin(a) * 7;
    put(new THREE.ConeGeometry(2, 2.6, 4), k % 2 ? C.hide : C.hideDark, x, 1.3, z, a + Math.PI / 4);
    put(new THREE.BoxGeometry(0.1, 3.1, 0.1), C.pole, x, 1.55, z);
    colliders.push({ x, z, r: 1.6 });
  }
  // Campfire: stone ring + flames
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2;
    put(new THREE.BoxGeometry(0.45, 0.35, 0.4), C.stone, cx + Math.cos(a), 0.17, cz + Math.sin(a), a);
  }
  put(new THREE.ConeGeometry(0.5, 1.1, 5), C.fire, cx, 0.55, cz);
  colliders.push({ x: cx, z: cz, r: 1.2 });
  // Crates and a lookout post with a red rag
  for (const [dx, dz, s] of [[4, -4, 0.9], [4.8, -3.2, 0.7], [-5, 3, 0.8]]) {
    put(new THREE.BoxGeometry(s, s, s), C.crate, cx + dx, s / 2, cz + dz, dx);
    colliders.push({ x: cx + dx, z: cz + dz, r: s * 0.7 });
  }
  put(new THREE.BoxGeometry(0.2, 4, 0.2), C.pole, cx - 2, 2, cz - 6);
  put(new THREE.BoxGeometry(0.06, 0.9, 0.7), C.red, cx - 2, 3.4, cz - 5.6);
  colliders.push({ x: cx - 2, z: cz - 6, r: 0.3 });

  const mesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  terrain.colliders.push(...colliders);
  return {
    center: new THREE.Vector3(cx, y(cx, cz), cz),
    fire: new THREE.Vector3(cx, y(cx, cz) + 0.6, cz),
    chest: new THREE.Vector3(cx - 4.5, y(cx - 4.5, cz - 3), cz - 3),
  };
}

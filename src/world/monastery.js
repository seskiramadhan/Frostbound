// High Hrothgar: the Greybeards' monastery on a snowy terrace halfway up the peak. An outdoor
// level like the summit (own origin far from the valley), reached by a mountain path. The great
// stone hall closes the north side; the Greybeards stand in the courtyard.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { mergeColored } from './props.js';
import { makeNoise2D } from './noise.js';

const H = CONFIG.monastery;
const C = { stone: 0x7a7d80, dark: 0x55585c, roof: 0x4a4d52, snow: 0xeef2f6, ground: 0xdfe5ea, door: 0x2e2117, fire: 0xffa040, gold: 0xb89a4a };

export class Monastery {
  constructor() {
    this.name = H.name;
    this.key = 'monastery';
    this.outdoor = true;
    this.ox = H.origin[0];
    this.oz = H.origin[2];
    this.radius = H.radius;
    this.noise = makeNoise2D(4711);
    this.colliders = [];
    const at = (x, z) => { const v = new THREE.Vector3(this.ox + x, 0, this.oz + z); v.y = this.heightAt(v.x, v.z); return v; };
    this.start = at(0, this.radius - 5);
    this.exit = at(0, this.radius - 2);
    this.center = at(0, 0);
    this.spots = {
      arngeir: [at(0, -5), at(1.5, -4.5)],
      borri: [at(-7, -3), at(-6, -1)],
      einarth: [at(7, -3), at(6, -1)],
    };
    this.group = this.#build();
  }

  heightAt(x, z) {
    const dx = x - this.ox, dz = z - this.oz, r = Math.hypot(dx, dz);
    const rim = Math.max(0, r - this.radius);
    return this.noise(dx * 0.06, dz * 0.06, 2) * 0.25 + rim * rim * 0.2;
  }

  clamp(pos) {
    const dx = pos.x - this.ox, dz = pos.z - this.oz, r = Math.hypot(dx, dz), max = this.radius - 1.5;
    if (r > max) { pos.x = this.ox + dx / r * max; pos.z = this.oz + dz / r * max; }
  }

  lineOfSight() { return true; }

  #build() {
    const parts = [];
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    const put = (geo, color, x, y, z, ry = 0, rx = 0) => {
      geo.applyMatrix4(M.compose(new THREE.Vector3(this.ox + x, this.heightAt(this.ox + x, this.oz + z) + y, this.oz + z), q.setFromEuler(e.set(rx, ry, 0)), one));
      parts.push({ geo, color });
    };

    // Snowy ground disc, rising into rock at the rim
    const R = this.radius + 14, seg = 48, rings = 8, pos = [], col = [], c = new THREE.Color();
    const pt = (i, j) => { const a = i / seg * Math.PI * 2, r = j / rings * R, x = this.ox + Math.cos(a) * r, z = this.oz + Math.sin(a) * r; return [x, this.heightAt(x, z), z]; };
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const quad = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
      for (const tri of [[0, 2, 1], [0, 3, 2]]) {
        c.setHex(j >= rings - 2 ? 0x8a8d92 : C.ground).multiplyScalar(0.94 + ((i * 7 + j * 3) % 5) * 0.015);
        for (const k of tri) { pos.push(...quad[k]); col.push(c.r, c.g, c.b); }
      }
    }
    const ground = new THREE.BufferGeometry();
    ground.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ground.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    ground.computeVertexNormals();

    // The great hall on the north side
    const hw = 13, hd = 6, hz = -this.radius + 9;
    put(new THREE.BoxGeometry(hw * 2, 9, hd * 2), C.stone, 0, 4.5, hz);
    put(new THREE.BoxGeometry(hw * 2 + 1, 0.6, hd * 2 + 1), C.dark, 0, 9.2, hz);
    for (const s of [-1, 1]) {
      put(new THREE.BoxGeometry(hw * 2 + 2, 0.5, hd + 1.5), C.roof, 0, 10.6, hz + s * hd / 2, 0, s * 0.45);
      put(new THREE.BoxGeometry(hw * 2 + 2.1, 0.12, hd + 1.2), C.snow, 0, 10.95, hz + s * hd / 2, 0, s * 0.45);
    }
    put(new THREE.BoxGeometry(3.2, 5, 0.3), C.door, 0, 2.5, hz + hd + 0.05);
    for (const s of [-1, 1]) {
      put(new THREE.BoxGeometry(1.6, 7, 1.6), C.dark, s * 3, 3.5, hz + hd + 0.6);     // door pillars
      put(new THREE.BoxGeometry(1.2, 2.2, 0.4), C.gold, s * 8, 6, hz + hd + 0.1);     // banners
    }
    for (let k = 0; k < 4; k++) put(new THREE.BoxGeometry(8, 0.35, 1.2), C.dark, 0, 0.17 + k * 0.0, hz + hd + 1.2 + k * 1.1);   // steps
    this.colliders.push({ x: this.ox, z: this.oz + hz, hw: hw + 0.3, hd: hd + 0.4 });
    // Braziers lining the courtyard
    for (const [x, z] of [[-9, -2], [9, -2], [-9, 8], [9, 8]]) {
      put(new THREE.CylinderGeometry(0.25, 0.4, 1.1, 6), C.dark, x, 0.55, z);
      put(new THREE.CylinderGeometry(0.6, 0.3, 0.35, 7), C.dark, x, 1.25, z);
      put(new THREE.ConeGeometry(0.4, 0.9, 5), C.fire, x, 1.8, z);
      this.colliders.push({ x: this.ox + x, z: this.oz + z, r: 0.6 });
    }
    // Rocky ridge around the terrace (gap at the path, south)
    for (let k = 0; k < 22; k++) {
      const a = k / 22 * Math.PI * 2;
      if (Math.abs(a - Math.PI / 2) < 0.3) continue;
      const r = this.radius + 1.5, s = 1.8 + (k % 3) * 0.8;
      put(new THREE.DodecahedronGeometry(s, 0), 0x6e7177, Math.cos(a) * r, s * 0.4, Math.sin(a) * r, k);
      this.colliders.push({ x: this.ox + Math.cos(a) * r, z: this.oz + Math.sin(a) * r, r: s * 0.9 });
    }

    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    group.add(new THREE.Mesh(ground, mat), new THREE.Mesh(mergeColored(parts), mat));
    for (const m of group.children) m.matrixAutoUpdate = false;
    return group;
  }
}

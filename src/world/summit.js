// The summit of the peak: a stormy, roughly flat plateau ringed by boulders, where the
// World-Eater is fought. Like a dungeon it lives far outside the valley, but it is outdoors
// (snow, open sky). Same level interface: heightAt, clamp, colliders, lineOfSight.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { mergeColored } from './props.js';
import { makeNoise2D, mulberry32 } from './noise.js';

const S = CONFIG.summit;

export class Summit {
  constructor() {
    this.name = S.name;
    this.key = 'summit';
    this.outdoor = true;
    this.ox = S.origin[0];
    this.oz = S.origin[2];
    this.radius = S.radius;
    this.noise = makeNoise2D(9191);
    this.colliders = [];
    this.start = new THREE.Vector3(this.ox, 0, this.oz + this.radius - 6);
    this.exit = new THREE.Vector3(this.ox, 0, this.oz + this.radius - 3);
    this.start.y = this.heightAt(this.start.x, this.start.z);
    this.exit.y = this.heightAt(this.exit.x, this.exit.z);
    this.group = new THREE.Group();
    this.group.add(this.#build());
  }

  // Gentle rolling snow, rising steeply past the rim.
  heightAt(x, z) {
    const dx = x - this.ox, dz = z - this.oz, r = Math.hypot(dx, dz);
    const rim = Math.max(0, r - this.radius);
    return this.noise(dx * 0.05, dz * 0.05, 2) * 0.8 + rim * rim * 0.15;
  }

  clamp(pos) {
    const dx = pos.x - this.ox, dz = pos.z - this.oz, r = Math.hypot(dx, dz), max = this.radius - 1.5;
    if (r > max) { pos.x = this.ox + dx / r * max; pos.z = this.oz + dz / r * max; }
  }

  lineOfSight() { return true; }

  #build() {
    const parts = [];
    const rand = mulberry32(5150);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
    const R = this.radius + 18, seg = 64, rings = 12;

    // Snowfield disc (vertex-coloured, slightly rough)
    const pos = [], col = [], c = new THREE.Color();
    const pt = (i, j) => {
      const a = i / seg * Math.PI * 2, r = j / rings * R;
      const x = this.ox + Math.cos(a) * r, z = this.oz + Math.sin(a) * r;
      return [x, this.heightAt(x, z), z];
    };
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const quad = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
        for (const tri of [[0, 2, 1], [0, 3, 2]]) {
          c.setHex(rand() < 0.15 ? 0x9aa3ad : 0xe6ecf2).multiplyScalar(0.92 + rand() * 0.1);
          for (const k of tri) { pos.push(...quad[k]); col.push(c.r, c.g, c.b); }
        }
      }
    }
    const ground = new THREE.BufferGeometry();
    ground.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ground.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    ground.computeVertexNormals();

    // Boulders around the rim (colliders) and jagged crags beyond
    const rock = (x, z, s, color, collide) => {
      const g = new THREE.DodecahedronGeometry(1, 0);
      M.compose(new THREE.Vector3(x, this.heightAt(x, z) + s * 0.4, z), q.setFromEuler(e.set(rand() * 3, rand() * 3, rand() * 3)), sc.set(s, s * (0.8 + rand() * 0.8), s));
      g.applyMatrix4(M);
      g.setIndex([...Array(g.attributes.position.count).keys()]);
      parts.push({ geo: g, color });
      if (collide) this.colliders.push({ x, z, r: s * 0.9 });
    };
    for (let k = 0; k < 26; k++) {
      const a = k / 26 * Math.PI * 2 + rand() * 0.1;
      if (Math.abs(a - Math.PI / 2) < 0.25) continue;     // gap where the path comes up
      const r = this.radius + rand() * 2;
      rock(this.ox + Math.cos(a) * r, this.oz + Math.sin(a) * r, 1.6 + rand() * 1.8, 0x6e7177, true);
    }
    for (let k = 0; k < 18; k++) {
      const a = rand() * Math.PI * 2, r = this.radius + 8 + rand() * 10;
      rock(this.ox + Math.cos(a) * r, this.oz + Math.sin(a) * r, 4 + rand() * 6, 0x5e6167, false);
    }
    // Ancient standing stones in a ring
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2 + 0.3, r = this.radius * 0.55;
      const x = this.ox + Math.cos(a) * r, z = this.oz + Math.sin(a) * r;
      const g = new THREE.BoxGeometry(1, 3.4 + rand(), 0.7);
      M.compose(new THREE.Vector3(x, this.heightAt(x, z) + 1.6, z), q.setFromEuler(e.set(0, -a, (rand() - 0.5) * 0.15)), sc.set(1, 1, 1));
      g.applyMatrix4(M);
      parts.push({ geo: g, color: 0x7a7d80 });
      this.colliders.push({ x, z, r: 0.8 });
    }

    const merged = mergeColored(parts);
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    group.add(new THREE.Mesh(ground, mat), new THREE.Mesh(merged, mat));
    for (const m of group.children) m.matrixAutoUpdate = false;
    return group;
  }
}

// One valley terrain chunk: heightmap -> flat-shaded, vertex-coloured mesh.
// heightAt() samples the exact same triangles the mesh renders.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { makeNoise2D, mulberry32 } from './noise.js';

const T = CONFIG.terrain;
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Terrain {
  constructor() {
    this.size = T.size;
    this.half = T.size / 2;
    this.seg = T.segments;
    this.cell = T.size / T.segments;
    this.noise = makeNoise2D(T.seed);

    const n = this.seg + 1;
    this.heights = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        this.heights[j * n + i] = this.#shape(-this.half + i * this.cell, -this.half + j * this.cell);
      }
    }
    this.platforms = [];
    this.mesh = this.#buildMesh();
    this.name = 'valley';
    this.colliders = [];   // trees, rocks, cave mouth (filled in by props)
  }

  // Keep bodies away from the terrain edge.
  clamp(pos) {
    const lim = this.half - CONFIG.player.worldMargin;
    pos.x = Math.min(lim, Math.max(-lim, pos.x));
    pos.z = Math.min(lim, Math.max(-lim, pos.z));
  }

  lineOfSight() { return true; }

  #shape(x, z) {
    const N = this.noise;
    const dist = Math.hypot(x, z);
    const r = dist / this.half;

    // Rolling hills, flattened in the centre where the village will go
    const flat = smoothstep(T.flatRadius, T.flatRadius * 2.2, dist);
    let h = N(x * T.hillScale, z * T.hillScale, 4) * T.hillHeight * flat;

    // Jagged valley walls
    const rim = smoothstep(T.rimStart, 1.0, r);
    const jag = 0.65 + 0.7 * (N(x * 0.012 + 50, z * 0.012 - 30, 3) * 0.5 + 0.5);
    h += Math.pow(rim, 1.4) * T.rimHeight * jag;

    // The mountain peak
    const p = T.peak;
    const pd = Math.hypot(x - p.x, z - p.z) / p.radius;
    h += Math.exp(-pd * pd * 2.2) * p.height * (0.85 + 0.3 * N(x * 0.03, z * 0.03, 2));

    return h;
  }

  #h(i, j) {
    const n = this.seg + 1;
    i = Math.min(this.seg, Math.max(0, i));
    j = Math.min(this.seg, Math.max(0, j));
    return this.heights[j * n + i];
  }

  // Height you stand on: the ground, or the top of a platform (watchtower) when over one.
  // platforms: [{ x, z, hw, hd, y }] (y = absolute top height).
  heightAt(x, z) {
    const g = this.groundAt(x, z);
    for (const p of this.platforms) if (Math.abs(x - p.x) < p.hw && Math.abs(z - p.z) < p.hd && p.y > g) return p.y;
    return g;
  }

  // Height on the rendered surface. Cell split along (i, j+1)-(i+1, j).
  groundAt(x, z) {
    const gx = (x + this.half) / this.cell, gz = (z + this.half) / this.cell;
    const i = Math.min(this.seg - 1, Math.max(0, Math.floor(gx)));
    const j = Math.min(this.seg - 1, Math.max(0, Math.floor(gz)));
    const fx = Math.min(1, Math.max(0, gx - i)), fz = Math.min(1, Math.max(0, gz - j));
    const h00 = this.#h(i, j), h10 = this.#h(i + 1, j), h01 = this.#h(i, j + 1), h11 = this.#h(i + 1, j + 1);
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  // Approximate up-component of the surface normal (1 = flat).
  slopeAt(x, z) {
    const e = this.cell * 0.5;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return 1 / Math.sqrt(1 + dx * dx + dz * dz);
  }

  #buildMesh() {
    const seg = this.seg, cell = this.cell, half = this.half;
    const triCount = seg * seg * 2;
    const pos = new Float32Array(triCount * 9);
    const col = new Float32Array(triCount * 9);
    const rand = mulberry32(T.seed + 1);
    const c = {}; for (const k in T.colors) c[k] = new THREE.Color(T.colors[k]);
    const tmp = new THREE.Color();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
    let p = 0;

    const pushTri = (x0, z0, x1, z1, x2, z2, h0, h1, h2) => {
      a.set(x1 - x0, h1 - h0, z1 - z0);
      b.set(x2 - x0, h2 - h0, z2 - z0);
      d.crossVectors(a, b).normalize();
      const ny = d.y, hAvg = (h0 + h1 + h2) / 3;
      const cx = (x0 + x1 + x2) / 3, cz = (z0 + z1 + z2) / 3;
      const patch = this.noise(cx * 0.05 + 100, cz * 0.05, 2);
      const snowLine = T.snowLine + patch * 6;

      if (ny < T.rockSlope && hAvg < snowLine + 25) tmp.copy(c.rock);
      else if (hAvg > snowLine || patch > 0.38) tmp.copy(c.snow);
      else if (ny < T.rockSlope + 0.12) tmp.copy(c.dirt);
      else tmp.copy(rand() < 0.5 ? c.grass : c.grassDark);
      // Subtle per-face jitter keeps the low-poly facets readable
      const j = 0.94 + rand() * 0.1;
      tmp.multiplyScalar(j);

      pos.set([x0, h0, z0, x1, h1, z1, x2, h2, z2], p);
      for (let k = 0; k < 3; k++) col.set([tmp.r, tmp.g, tmp.b], p + k * 3);
      p += 9;
    };

    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const x0 = -half + i * cell, x1 = x0 + cell;
        const z0 = -half + j * cell, z1 = z0 + cell;
        const h00 = this.#h(i, j), h10 = this.#h(i + 1, j), h01 = this.#h(i, j + 1), h11 = this.#h(i + 1, j + 1);
        pushTri(x0, z0, x0, z1, x1, z0, h00, h01, h10);
        pushTri(x0, z1, x1, z1, x1, z0, h01, h11, h10);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals(); // non-indexed => flat face normals
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

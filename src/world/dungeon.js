// Dungeons built from an ASCII tile map: one merged cave mesh with brazier light
// baked into vertex colours (no real lights needed), wall collision, line of sight.
// Map legend:  # rock   . floor   X exit   S player start   t brazier
//              w wolf   A alpha wolf   c / C chests (keys in `chests`)
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { mulberry32 } from './noise.js';

const D = CONFIG.dungeon;

export const FROSTFANG_DEN = {
  name: 'Frostfang Den',
  key: 'den',
  chests: { c: 'denHall', C: 'denTreasure' },
  map: [
    '#####################',
    '#####.....###########',
    '####..X....##########',
    '####...S...##########',
    '#####....t.##########',
    '#######...###########',
    '#######...###########',
    '######.....##########',
    '####.....w...########',
    '###..t........#######',
    '###.....w...c.#######',
    '####..........#######',
    '######...t...########',
    '#########...#########',
    '#########....########',
    '##########....#######',
    '#########.......#####',
    '########....A....####',
    '########.t.....t.####',
    '#########...C...#####',
    '##########.....######',
    '#####################',
  ],
};

// Deterministic hash -> [-1, 1], so shared vertices get the same displacement.
function hash3(x, y, z) {
  let h = Math.imul(Math.round(x * 10) | 0, 73856093) ^ Math.imul(Math.round(y * 10) | 0, 19349663) ^ Math.imul(Math.round(z * 10) | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

export class Dungeon {
  constructor(def) {
    this.def = def;
    this.name = def.name;
    this.key = def.key;
    this.cell = D.cell;
    this.ox = D.origin[0];
    this.oz = D.origin[2];
    this.rows = def.map.length;
    this.cols = Math.max(...def.map.map(r => r.length));
    this.ceiling = D.wallHeight;
    this.colliders = [];
    this.wolves = [];      // positions from the map
    this.alpha = null;
    this.chests = [];      // { pos, lootKey }
    this.braziers = [];

    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const ch = this.#ch(i, j), p = this.cellCenter(i, j);
        if (ch === 'S') this.start = p;
        else if (ch === 'X') this.exit = p;
        else if (ch === 'w') this.wolves.push(p);
        else if (ch === 'A') this.alpha = p;
        else if (ch === 't') { this.braziers.push(p); this.colliders.push({ x: p.x, z: p.z, r: 0.55 }); }
        else if (def.chests[ch]) this.chests.push({ pos: p, lootKey: def.chests[ch] });
      }
    }
    this.group = new THREE.Group();
    this.group.add(this.#buildCave(), this.#buildBraziers());
  }

  #ch(i, j) {
    if (j < 0 || j >= this.rows || i < 0 || i >= this.cols) return '#';
    return this.def.map[j][i] ?? '#';
  }

  isWall(i, j) { return this.#ch(i, j) === '#'; }

  cellCenter(i, j) {
    return new THREE.Vector3(this.ox + (i + 0.5) * this.cell, 0, this.oz + (j + 0.5) * this.cell);
  }

  heightAt() { return 0; }
  clamp() {}

  // Would a circle of radius r at (x, z) overlap rock?
  blocked(x, z, r) {
    const c = this.cell, rr = r + D.wallPad;
    const i0 = Math.floor((x - rr - this.ox) / c), i1 = Math.floor((x + rr - this.ox) / c);
    const j0 = Math.floor((z - rr - this.oz) / c), j1 = Math.floor((z + rr - this.oz) / c);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (this.isWall(i, j)) return true;
    return false;
  }

  lineOfSight(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 0.75);
    for (let k = 1; k < n; k++) {
      const f = k / n;
      if (this.blocked(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f, 0)) return false;
    }
    return true;
  }

  // Rough rock: displace every vertex except the floor by a position hash.
  #displace(v, onFloor) {
    if (onFloor) return v;
    const R = D.roughness;
    v.x += hash3(v.x, v.y, v.z) * R;
    v.z += hash3(v.z, v.x, v.y) * R;
    if (v.y > 0.1) v.y += hash3(v.y, v.z, v.x) * R * 0.6;
    return v;
  }

  // Baked light: ambient + warm falloff from every brazier, times simple face shading.
  #light(cx, cy, cz, ny, out, base) {
    let l = D.ambient;
    const B = D.braziers;
    for (const b of this.braziers) {
      const d = Math.hypot(b.x - cx, 1.2 - cy, b.z - cz);
      if (d < B.range) { const f = 1 - d / B.range; l += B.intensity * f * f; }
    }
    const shade = 0.75 + 0.25 * Math.abs(ny);
    out.setRGB(base.r * l * shade * 1.15, base.g * l * shade, base.b * l * shade * 0.85);
  }

  #buildCave() {
    const c = this.cell, H = D.wallHeight, n = 2, s = c / n;   // 2 sub-quads per tile edge
    const pos = [], col = [];
    const rand = mulberry32(31337);
    const floorC = new THREE.Color(0x5b5047), wallC = new THREE.Color(0x6b6259), ceilC = new THREE.Color(0x48413b);
    const tmp = new THREE.Color(), base = new THREE.Color();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), e = new THREE.Vector3(), nrm = new THREE.Vector3();
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

    const tri = (p0, p1, p2, baseCol) => {
      a.subVectors(p1, p0); b.subVectors(p2, p0); nrm.crossVectors(a, b).normalize();
      e.copy(p0).add(p1).add(p2).multiplyScalar(1 / 3);
      base.copy(baseCol).multiplyScalar(0.9 + rand() * 0.2);
      this.#light(e.x, e.y, e.z, nrm.y, tmp, base);
      for (const p of [p0, p1, p2]) { pos.push(p.x, p.y, p.z); col.push(tmp.r, tmp.g, tmp.b); }
    };
    // Quad from 4 corners (counter-clockwise seen from the inside), each displaced.
    const quad = (pts, floorFlags, baseCol) => {
      for (let k = 0; k < 4; k++) this.#displace(v[k].copy(pts[k]), floorFlags[k]);
      tri(v[0], v[1], v[2], baseCol);
      tri(v[0], v[2], v[3], baseCol);
    };
    const P = (x, y, z) => new THREE.Vector3(x, y, z);

    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        if (this.isWall(i, j)) continue;
        const x0 = this.ox + i * c, z0 = this.oz + j * c;
        for (let sj = 0; sj < n; sj++) {
          for (let si = 0; si < n; si++) {
            const xa = x0 + si * s, xb = xa + s, za = z0 + sj * s, zb = za + s;
            quad([P(xa, 0, za), P(xa, 0, zb), P(xb, 0, zb), P(xb, 0, za)], [1, 1, 1, 1], floorC);   // floor (faces up)
            quad([P(xa, H, za), P(xb, H, za), P(xb, H, zb), P(xa, H, zb)], [0, 0, 0, 0], ceilC);    // ceiling (faces down)
          }
        }
        // Walls on every side that touches rock, facing into the room
        const sides = [
          [0, -1, (k, y) => P(x0 + c - k * s, y, z0)],   // north edge, z = z0
          [0, 1, (k, y) => P(x0 + k * s, y, z0 + c)],    // south edge
          [-1, 0, (k, y) => P(x0, y, z0 + k * s)],       // west edge
          [1, 0, (k, y) => P(x0 + c, y, z0 + c - k * s)], // east edge
        ];
        for (const [di, dj, at] of sides) {
          if (!this.isWall(i + di, j + dj)) continue;
          for (let k = 0; k < n; k++) {
            for (let r = 0; r < 2; r++) {
              const y0 = r * H / 2, y1 = y0 + H / 2;
              quad([at(k, y0), at(k + 1, y0), at(k + 1, y1), at(k, y1)], [y0 === 0, y0 === 0, false, false], wallC);
            }
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  // Stone fire bowls with flickering flames (flames animated in update()).
  #buildBraziers() {
    const g = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: 0x55504a, flatShading: true });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
    this.flames = [];
    for (const b of this.braziers) {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 0.9, 6), stone);
      stand.position.set(b.x, 0.45, b.z);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 0.3, 7), stone);
      bowl.position.set(b.x, 1.0, b.z);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 5), flameMat);
      flame.position.set(b.x, 1.55, b.z);
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 5), coreMat);
      core.position.set(b.x, 1.4, b.z);
      g.add(stand, bowl, flame, core);
      this.flames.push({ flame, core, phase: Math.random() * 10 });
    }
    return g;
  }

  update(dt) {
    this.time = (this.time ?? 0) + dt;
    for (const f of this.flames) {
      const t = this.time * 9 + f.phase;
      const s = 1 + Math.sin(t) * 0.12 + Math.sin(t * 2.3) * 0.08;
      f.flame.scale.set(1, s, 1);
      f.core.scale.set(1, 2 - s, 1);
      f.flame.rotation.y = t * 0.3;
    }
  }
}

// Rock arch with a dark mouth, sitting on the valley terrain facing the valley centre.
export function buildCaveEntrance(terrain) {
  const [sx, sz] = CONFIG.player.spawn;
  let pos = null;
  for (let i = 0; i < 30 && !pos; i++) {
    const a = 2.2 + i * 2.39996;
    const x = sx + Math.cos(a) * D.entranceDistance, z = sz + Math.sin(a) * D.entranceDistance;
    if (terrain.slopeAt(x, z) > 0.85 && terrain.heightAt(x, z) < CONFIG.props.treeMaxHeight) pos = new THREE.Vector3(x, 0, z);
  }
  pos ??= new THREE.Vector3(sx, 0, sz - D.entranceDistance);
  pos.y = terrain.heightAt(pos.x, pos.z);

  const facing = Math.atan2(sx - pos.x, sz - pos.z);   // opening looks toward the spawn
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = facing;

  const rockMat = new THREE.MeshLambertMaterial({ color: 0x74777d, flatShading: true });
  const snowMat = new THREE.MeshLambertMaterial({ color: 0xeef2f6, flatShading: true });
  const rock = (x, y, z, sx_, sy, sz_, mat = rockMat) => {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), mat);
    m.position.set(x, y, z); m.scale.set(sx_, sy, sz_);
    m.rotation.set(x * 1.3, z * 0.7, y * 0.9);
    group.add(m);
  };
  rock(-2.6, 1.6, -0.5, 1.6, 2.4, 1.8);      // left pillar
  rock(2.6, 1.6, -0.5, 1.6, 2.5, 1.8);       // right pillar
  rock(0, 4.1, -0.6, 3.6, 1.3, 2.0);         // lintel
  rock(0, 5.0, -0.7, 2.6, 0.5, 1.6, snowMat); // snow on top
  rock(-4.3, 0.8, -1.5, 1.4, 1.4, 1.4);
  rock(4.2, 0.9, -1.6, 1.5, 1.5, 1.3);
  rock(0, 2.5, -2.6, 4.5, 3.2, 1.6);         // back wall behind the mouth

  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ color: 0x050403 }));
  mouth.position.set(0, 1.7, -0.9);
  group.add(mouth);

  // Colliders (world space) for the pillars and back
  const colliders = [[-2.6, -0.5, 1.7], [2.6, -0.5, 1.7], [-4.3, -1.5, 1.3], [4.2, -1.6, 1.3], [0, -2.4, 2.0], [-1.6, -2.4, 1.6], [1.6, -2.4, 1.6]]
    .map(([x, z, r]) => {
      const c = Math.cos(facing), s = Math.sin(facing);
      return { x: pos.x + x * c + z * s, z: pos.z - x * s + z * c, r };
    });

  const front = new THREE.Vector3(pos.x + Math.sin(facing) * 1.2, 0, pos.z + Math.cos(facing) * 1.2);
  front.y = terrain.heightAt(front.x, front.z);
  const outside = new THREE.Vector3(pos.x + Math.sin(facing) * 4, 0, pos.z + Math.cos(facing) * 4);
  return { group, pos, front, outside, facing, colliders };
}

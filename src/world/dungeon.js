// Dungeons built from an ASCII tile map: one merged cave mesh with brazier light
// baked into vertex colours (no real lights needed), wall collision, line of sight.
// Map legend:  # rock   . floor   X exit   S player start   t brazier   W word wall
//              other letters: creatures (`spawns`: letter -> config section) or chests (`chests`)
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { mulberry32 } from './noise.js';
import { mergeColored } from './props.js';

// Bake parts into one mesh (one draw call): [{ geo, p: [x, y, z], r?: [x, y, z], s?: [x, y, z] }].
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function baked(list, mat) {
  const parts = list.map(({ geo, p, r = [0, 0, 0], s = [1, 1, 1] }) => {
    geo.applyMatrix4(_m.compose(new THREE.Vector3(...p), _q.setFromEuler(_e.set(...r)), new THREE.Vector3(...s)));
    return { geo, color: 0xffffff };
  });
  const mesh = new THREE.Mesh(mergeColored(parts), mat);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

const D = CONFIG.dungeon;

export const FROSTFANG_DEN = {
  name: 'Frostfang Den',
  key: 'den',
  origin: [1000, 0, 1000],   // each dungeon gets its own patch of space far outside the valley
  spawns: { w: 'wolf', A: 'alphaWolf' },
  chests: { c: 'denHall', C: 'denTreasure' },
  wordWall: { shout: 'slowTime', facing: Math.PI },
  palette: { floor: 0x5b5047, wall: 0x6b6259, ceiling: 0x48413b },
  roughness: 0.55,
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
    '##########..W..######',
    '#####################',
  ],
};

export const BLEAKROCK_BARROW = {
  name: 'Bleakrock Barrow',
  key: 'barrow',
  origin: [1200, 0, 1000],
  spawns: { d: 'draugr', D: 'draugrWight' },
  chests: { c: 'barrowHall', k: 'barrowCrypt' },
  wordWall: { shout: 'push', facing: Math.PI },
  secretWall: { shout: 'iceForm', facing: -Math.PI / 2 },
  palette: { floor: 0x57595b, wall: 0x6c7074, ceiling: 0x45484c },
  roughness: 0.22,          // worked stone, not raw cave
  map: [
    '###################',
    '######.......######',
    '######..X.S..######',
    '######.......######',
    '#######.t.t.#######',
    '########...########',
    '########...########',
    '####...........####',
    '####.t..d.d..t.####',
    '####...........####',
    '####.....c.....####',
    '########...########',
    '########...########',
    '#####k........#####',
    '#####.t.....t.#####',
    '#####....D.......V#',
    '#####...d.....#####',
    '#######.....#######',
    '#######..W..#######',
    '###################',
  ],
};

// The Horn of Jurgen Windcaller's tomb (The Way of the Voice). 'H' is the horn's pedestal.
export const USTENGRAV = {
  name: 'Ustengrav',
  key: 'ustengrav',
  origin: [1400, 0, 1000],
  spawns: { d: 'draugr', D: 'draugrWight' },
  chests: { c: 'ustengravHall' },
  markers: { H: 'horn' },
  palette: { floor: 0x4e5156, wall: 0x5f6368, ceiling: 0x3c3f43 },
  roughness: 0.3,
  map: [
    '#####################',
    '########.....########',
    '########.X.S.########',
    '########.....########',
    '#########.t.#########',
    '#########...#########',
    '####.............####',
    '####.t..d...d..t.####',
    '####.............####',
    '#######.......#######',
    '#########...#########',
    '#########...#########',
    '#####.....d.....#####',
    '#####.t.......t.#####',
    '#####...c...d...#####',
    '#######.......#######',
    '#########...#########',
    '#######...D...#######',
    '######.t.....t.######',
    '#######...H...#######',
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
    this.ox = def.origin[0];
    this.oz = def.origin[2];
    this.rows = def.map.length;
    this.cols = Math.max(...def.map.map(r => r.length));
    this.ceiling = D.wallHeight;
    this.colliders = [];
    this.spawns = {};      // config section -> [positions]
    this.chests = [];      // { pos, lootKey }
    this.wordWall = null;  // { pos, facing, shout }
    this.secretWall = null; // hidden 4th word wall (awakens after the World-Eater falls)
    this.braziers = [];
    this.markers = {};     // named spots from def.markers (e.g. the horn's pedestal)

    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const ch = this.#ch(i, j), p = this.cellCenter(i, j);
        if (ch === 'S') this.start = p;
        else if (ch === 'X') this.exit = p;
        else if (def.spawns[ch]) (this.spawns[def.spawns[ch]] ??= []).push(p);
        else if (ch === 'W') this.wordWall = { pos: p, ...def.wordWall };
        else if (ch === 'V') this.secretWall = { pos: p, ...def.secretWall };
        else if (ch === 't') { this.braziers.push(p); this.colliders.push({ x: p.x, z: p.z, r: 0.55 }); }
        else if (def.chests[ch]) this.chests.push({ pos: p, lootKey: def.chests[ch] });
        else if (def.markers?.[ch]) this.markers[def.markers[ch]] = p;
      }
    }
    this.group = new THREE.Group();
    this.group.add(this.#buildCave(), this.#buildBraziers());
    if (this.wordWall) this.group.add(this.#buildWordWall(this.wordWall, 'runeMat'));
    if (this.secretWall) this.group.add(this.#buildWordWall(this.secretWall, 'secretMat'));
    if (this.markers.horn) this.group.add(this.#buildPedestal(this.markers.horn));
  }

  // A carved stone pedestal with an empty cradle (the horn has been taken...).
  #buildPedestal(p) {
    const stone = new THREE.MeshLambertMaterial({ color: 0x8a8d90, flatShading: true });
    this.colliders.push({ x: p.x, z: p.z, r: 0.7 });
    return baked([
      { geo: new THREE.BoxGeometry(1.1, 0.3, 1.1), p: [p.x, 0.15, p.z] },
      { geo: new THREE.CylinderGeometry(0.3, 0.4, 1.1, 6), p: [p.x, 0.85, p.z] },
      { geo: new THREE.BoxGeometry(0.9, 0.15, 0.5), p: [p.x, 1.45, p.z] },
      { geo: new THREE.BoxGeometry(0.1, 0.3, 0.5), p: [p.x - 0.4, 1.65, p.z] },
      { geo: new THREE.BoxGeometry(0.1, 0.3, 0.5), p: [p.x + 0.4, 1.65, p.z] },
    ], stone);
  }

  // Curved stone slab carved with glowing runes. Colliders keep you from walking through it.
  #buildWordWall(w, matKey) {
    const g = new THREE.Group();
    g.position.copy(w.pos);
    g.rotation.y = w.facing;
    const stone = new THREE.MeshLambertMaterial({ color: 0x7a7d80, flatShading: true });
    this[matKey] = new THREE.MeshBasicMaterial({ color: matKey === 'secretMat' ? 0x1e2830 : 0x9fd8ff });
    const panels = [], runes = [];
    for (let k = -2; k <= 2; k++) {                       // 5 panels on a gentle curve
      const h = 3.4 - Math.abs(k) * 0.35;
      panels.push({ geo: new THREE.BoxGeometry(1.0, h, 0.45), p: [k * 0.95, h / 2, Math.abs(k) * 0.28], r: [0, -k * 0.22, 0] });
      const rand = mulberry32(77 + k);
      for (let r = 0; r < 4; r++) {                       // claw-mark runes
        const geo = new THREE.BoxGeometry(0.08 + rand() * 0.25, 0.08 + rand() * 0.3, 0.05);
        runes.push({ geo, p: [k * 0.95 + (rand() - 0.5) * 0.5, 0.7 + r * 0.6, Math.abs(k) * 0.28 + 0.24], r: [0, -k * 0.22, (rand() - 0.5) * 1.2] });
      }
    }
    g.add(baked(panels, stone), baked(runes, this[matKey]));   // 2 draw calls per wall
    for (const k of [-1.8, 0, 1.8]) {
      const c = Math.cos(w.facing), sn = Math.sin(w.facing);
      this.colliders.push({ x: w.pos.x + k * c, z: w.pos.z - k * sn, r: 0.9 });
    }
    return g;
  }

  // The hidden wall: dark stone until awakened, then glows red-gold until learned.
  setSecretState(awake, learned) {
    this.secretAwake = awake && !learned;
    this.secretMat?.color.setHex(awake && !learned ? 0xffb070 : 0x1e2830);
  }

  // Runes glow until the word is learned.
  setWordLearned(learned) {
    this.wordLearned = learned;
    this.runeMat?.color.setHex(learned ? 0x3a4a55 : 0x9fd8ff);
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
    const R = this.def.roughness;
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
    const pal = this.def.palette;
    const floorC = new THREE.Color(pal.floor), wallC = new THREE.Color(pal.wall), ceilC = new THREE.Color(pal.ceiling);
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

  // Stone fire bowls (one merged mesh) with flickering flames (animated in update()).
  #buildBraziers() {
    const g = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: 0x55504a, flatShading: true });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
    this.flames = [];
    const stones = [];
    for (const b of this.braziers) {
      stones.push({ geo: new THREE.CylinderGeometry(0.18, 0.3, 0.9, 6), p: [b.x, 0.45, b.z] },
        { geo: new THREE.CylinderGeometry(0.5, 0.25, 0.3, 7), p: [b.x, 1.0, b.z] });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 5), flameMat);
      flame.position.set(b.x, 1.55, b.z);
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 5), coreMat);
      core.position.set(b.x, 1.4, b.z);
      g.add(flame, core);
      this.flames.push({ flame, core, phase: Math.random() * 10 });
    }
    if (stones.length) g.add(baked(stones, stone));
    return g;
  }

  update(dt) {
    this.time = (this.time ?? 0) + dt;
    if (this.runeMat && !this.wordLearned) {
      const k = 0.75 + Math.sin(this.time * 2.2) * 0.25;
      this.runeMat.color.setRGB(0.62 * k, 0.85 * k, 1.0 * k);
    }
    if (this.secretAwake) {
      const k = 0.7 + Math.sin(this.time * 3) * 0.3;
      this.secretMat.color.setRGB(1.0 * k, 0.7 * k, 0.45 * k);
    }
    for (const f of this.flames) {
      const t = this.time * 9 + f.phase;
      const s = 1 + Math.sin(t) * 0.12 + Math.sin(t * 2.3) * 0.08;
      f.flame.scale.set(1, s, 1);
      f.core.scale.set(1, 2 - s, 1);
      f.flame.rotation.y = t * 0.3;
    }
  }
}

// Dungeon entrance on the valley terrain, facing the valley centre.
// style 'cave': rock arch with a dark mouth. style 'ruin': standing stones and a lintel over steps.
export function buildEntrance(terrain, { distance, angle0, style, at }) {
  const [sx, sz] = CONFIG.player.spawn;
  let pos = at ? new THREE.Vector3(at[0], 0, at[1]) : null;
  for (let i = 0; i < 30 && !pos; i++) {
    const a = angle0 + i * 2.39996;
    const x = sx + Math.cos(a) * distance, z = sz + Math.sin(a) * distance;
    if (terrain.slopeAt(x, z) > 0.85 && terrain.heightAt(x, z) < CONFIG.props.treeMaxHeight) pos = new THREE.Vector3(x, 0, z);
  }
  pos ??= new THREE.Vector3(sx, 0, sz - distance);
  pos.y = terrain.heightAt(pos.x, pos.z);

  const facing = Math.atan2(sx - pos.x, sz - pos.z);   // opening looks toward the spawn
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.y = facing;
  const local = style === 'ruin' ? buildRuin(group) : style === 'path' ? buildPath(group) : buildCave(group);

  const c = Math.cos(facing), sn = Math.sin(facing);
  const colliders = local.map(([x, z, r]) => ({ x: pos.x + x * c + z * sn, z: pos.z - x * sn + z * c, r }));
  const front = new THREE.Vector3(pos.x + sn * 1.2, 0, pos.z + c * 1.2);
  front.y = terrain.heightAt(front.x, front.z);
  const outside = new THREE.Vector3(pos.x + sn * 4, 0, pos.z + c * 4);
  return { group, pos, front, outside, facing, colliders };
}

// Returns local-space colliders [x, z, r].
function buildCave(group) {
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x74777d, flatShading: true });
  const snowMat = new THREE.MeshLambertMaterial({ color: 0xeef2f6, flatShading: true });
  const rocks = [], snows = [];
  const rock = (x, y, z, sx_, sy, sz_, mat = rockMat) => {
    (mat === snowMat ? snows : rocks).push({ geo: new THREE.DodecahedronGeometry(1, 0), p: [x, y, z], r: [x * 1.3, z * 0.7, y * 0.9], s: [sx_, sy, sz_] });
  };
  rock(-2.6, 1.6, -0.5, 1.6, 2.4, 1.8);      // left pillar
  rock(2.6, 1.6, -0.5, 1.6, 2.5, 1.8);       // right pillar
  rock(0, 4.1, -0.6, 3.6, 1.3, 2.0);         // lintel
  rock(0, 5.0, -0.7, 2.6, 0.5, 1.6, snowMat); // snow on top
  rock(-4.3, 0.8, -1.5, 1.4, 1.4, 1.4);
  rock(4.2, 0.9, -1.6, 1.5, 1.5, 1.3);
  rock(0, 2.5, -2.6, 4.5, 3.2, 1.6);         // back wall behind the mouth
  group.add(baked(rocks, rockMat), baked(snows, snowMat));

  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ color: 0x050403 }));
  mouth.position.set(0, 1.7, -0.9);
  group.add(mouth);
  return [[-2.6, -0.5, 1.7], [2.6, -0.5, 1.7], [-4.3, -1.5, 1.3], [4.2, -1.6, 1.3], [0, -2.4, 2.0], [-1.6, -2.4, 1.6], [1.6, -2.4, 1.6]];
}

// Foot of the mountain path: stone steps climbing into the rocks, a cairn and two banners.
function buildPath(group) {
  const stone = new THREE.MeshLambertMaterial({ color: 0x8a8d90, flatShading: true });
  const rock = new THREE.MeshLambertMaterial({ color: 0x6e7177, flatShading: true });
  const snow = new THREE.MeshLambertMaterial({ color: 0xeef2f6, flatShading: true });
  const banner = new THREE.MeshLambertMaterial({ color: 0x7a2a22, flatShading: true });
  const byMat = new Map();
  const add = (geo, mat, x, y, z, ry = 0) => { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push({ geo, p: [x, y, z], r: [0, ry, 0] }); };
  for (let k = 0; k < 6; k++) add(new THREE.BoxGeometry(2.6, 0.35, 0.8), stone, 0, 0.17 + k * 0.35, 0.6 - k * 0.75);   // steps up
  add(new THREE.BoxGeometry(3.4, 4.5, 2.5), rock, -2.9, 2.0, -2.4, 0.2);
  add(new THREE.BoxGeometry(3.4, 5.5, 2.5), rock, 2.9, 2.5, -2.6, -0.2);
  add(new THREE.BoxGeometry(6.5, 0.4, 2.6), snow, 0, 4.95, -2.6);
  add(new THREE.BoxGeometry(5, 7, 2.5), rock, 0, 3.5, -5.2);                   // the mountain closes in
  for (const sx of [-1.7, 1.7]) {
    add(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 5), stone, sx, 1.7, 1.4);
    add(new THREE.BoxGeometry(0.06, 1.4, 0.7), banner, sx, 2.6, 1.75);
  }
  for (let k = 0; k < 4; k++) add(new THREE.DodecahedronGeometry(0.55 - k * 0.1, 0), stone, 3.4, 0.45 + k * 0.8, 1.6, k);  // cairn
  for (const [mat, list] of byMat) group.add(baked(list, mat));
  return [[-2.9, -2.4, 2.0], [2.9, -2.6, 2.0], [0, -5.2, 2.8], [3.4, 1.6, 0.6]];
}

function buildRuin(group) {
  const stone = new THREE.MeshLambertMaterial({ color: 0x8a8d90, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x5e6164, flatShading: true });
  const snow = new THREE.MeshLambertMaterial({ color: 0xeef2f6, flatShading: true });
  const byMat = new Map();
  const add = (geo, mat, x, y, z, ry = 0, rz = 0) => { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push({ geo, p: [x, y, z], r: [0, ry, rz] }); };
  add(new THREE.BoxGeometry(1.1, 5, 1.1), stone, -2.1, 2.5, 0);            // door pillars
  add(new THREE.BoxGeometry(1.1, 5, 1.1), stone, 2.1, 2.5, 0);
  add(new THREE.BoxGeometry(6, 1, 1.5), stone, 0, 5.4, 0);                 // lintel
  add(new THREE.BoxGeometry(5.6, 0.3, 1.3), snow, 0, 6.05, 0);
  add(new THREE.BoxGeometry(3.2, 4.3, 0.3), new THREE.MeshBasicMaterial({ color: 0x050505 }), 0, 2.4, -0.4); // doorway
  add(new THREE.BoxGeometry(6, 5.5, 2.4), dark, 0, 2.6, -1.8);             // mound behind
  for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(3.4, 0.25, 0.6), stone, 0, 0.12 - k * 0.0, 0.8 + k * 0.6 - 0.2); // steps
  // Standing stones on either side, one fallen
  add(new THREE.BoxGeometry(0.9, 3.6, 0.7), stone, -5.2, 1.6, 1.5, 0.3, 0.08);
  add(new THREE.BoxGeometry(0.9, 3.0, 0.7), stone, 5.4, 1.3, 1.2, -0.25, -0.1);
  add(new THREE.BoxGeometry(0.9, 0.8, 3.2), stone, 6.6, 0.4, 3.6, 0.6);
  for (const [mat, list] of byMat) group.add(baked(list, mat));
  return [[-2.1, 0, 0.9], [2.1, 0, 0.9], [0, -1.8, 2.6], [-2.4, -1.8, 2.2], [2.4, -1.8, 2.2], [-5.2, 1.5, 0.7], [5.4, 1.2, 0.7], [6.6, 3.6, 1.0]];
}

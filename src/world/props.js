// Instanced pine trees and rocks scattered over the valley (2 draw calls total).
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { mulberry32 } from './noise.js';

const P = CONFIG.props;

// Merge simple geometries into one non-indexed geometry with a flat colour per part.
export function mergeColored(parts) {
  const pos = [], nor = [], col = [];
  const c = new THREE.Color();
  for (const { geo, color } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.computeVertexNormals();
    c.setHex(color);
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    for (let i = 0; i < pa.length; i += 3) {
      pos.push(pa[i], pa[i + 1], pa[i + 2]);
      nor.push(na[i], na[i + 1], na[i + 2]);
      col.push(c.r, c.g, c.b);
    }
    g.dispose(); geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

function pineGeometry() {
  const trunk = new THREE.CylinderGeometry(0.18, 0.25, 1.4, 5).translate(0, 0.7, 0);
  const low = new THREE.ConeGeometry(1.4, 2.4, 6).translate(0, 2.2, 0);
  const mid = new THREE.ConeGeometry(1.05, 2.0, 6).translate(0, 3.4, 0);
  const top = new THREE.ConeGeometry(0.6, 1.4, 6).translate(0, 4.5, 0);
  return mergeColored([
    { geo: trunk, color: 0x5a4030 },
    { geo: low, color: 0x2c4a36 },
    { geo: mid, color: 0x34573f },
    { geo: top, color: 0xe8eef2 }, // snow cap
  ]);
}

export function buildProps(terrain) {
  const rand = mulberry32(P.seed);
  const colliders = [];
  const group = new THREE.Group();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), e = new THREE.Euler();
  const lim = terrain.half - 8;

  const spot = (maxH, maxSlope) => {
    for (let tries = 0; tries < 30; tries++) {
      const x = (rand() * 2 - 1) * lim, z = (rand() * 2 - 1) * lim;
      if (Math.hypot(x, z) < P.clearRadius) continue;
      if (P.clearings.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r)) continue;
      const h = terrain.heightAt(x, z);
      if (h > maxH || terrain.slopeAt(x, z) < maxSlope) continue;
      return { x, z, h };
    }
    return null;
  };

  // Trees
  const trees = new THREE.InstancedMesh(pineGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), P.trees);
  let nt = 0;
  for (let n = 0; n < P.trees; n++) {
    const p = spot(P.treeMaxHeight, P.treeMaxSlope);
    if (!p) continue;
    const sc = 0.8 + rand() * 0.9;
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    s.set(sc, sc * (0.9 + rand() * 0.3), sc);
    m.compose(v.set(p.x, p.h - 0.1, p.z), q, s);
    trees.setMatrixAt(nt++, m);
    colliders.push({ x: p.x, z: p.z, r: P.treeCollideRadius * sc });
  }
  trees.count = nt;
  trees.instanceMatrix.needsUpdate = true;
  trees.computeBoundingSphere();
  group.add(trees);

  // Rocks
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0x7c8088, flatShading: true }), P.rocks);
  let nr = 0;
  for (let n = 0; n < P.rocks; n++) {
    const p = spot(60, 0.6);
    if (!p) continue;
    const sc = 0.5 + rand() * rand() * 2.5;
    q.setFromEuler(e.set(rand() * 3, rand() * 3, rand() * 3));
    s.set(sc * (0.8 + rand() * 0.6), sc * (0.5 + rand() * 0.4), sc * (0.8 + rand() * 0.6));
    m.compose(v.set(p.x, p.h + s.y * 0.3, p.z), q, s);
    rocks.setMatrixAt(nr++, m);
    colliders.push({ x: p.x, z: p.z, r: Math.max(s.x, s.z) * P.rockCollideScale });
  }
  rocks.count = nr;
  rocks.instanceMatrix.needsUpdate = true;
  rocks.computeBoundingSphere();
  group.add(rocks);

  return { group, colliders };
}

// Shared low-poly model helpers: flat-shaded boxes, blob shadow, hit flash.
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, flatShading: true }));
  m.position.set(x, y, z);
  return m;
}

// Cheaper than shadow maps.
export function blobShadow(radius) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

// Briefly tints every material in a model (emissive) when it gets hit.
export class Flash {
  constructor(root) {
    this.materials = [];
    root.traverse(o => { if (o.material?.emissive) this.materials.push(o.material); });
    this.t = 0;
  }

  trigger(color = 0xff2a1a) {
    this.t = CONFIG.combat.flashTime;
    for (const m of this.materials) m.emissive.setHex(color);
  }

  tick(dt) {
    if (this.t <= 0) return;
    this.t -= dt;
    if (this.t <= 0) for (const m of this.materials) m.emissive.setHex(0x000000);
  }
}

export const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = x => Math.min(1, Math.max(0, x));

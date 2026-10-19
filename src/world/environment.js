// Sky colour, fog, lights and falling snow around the player.
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function setupEnvironment(scene) {
  const F = CONFIG.fog, L = CONFIG.light;
  scene.background = new THREE.Color(F.color);
  scene.fog = new THREE.Fog(F.color, F.near, F.far);

  scene.add(new THREE.HemisphereLight(L.skyColor, L.groundColor, L.hemiIntensity));
  const sun = new THREE.DirectionalLight(L.sunColor, L.sunIntensity);
  sun.position.set(...L.sunDir).multiplyScalar(100);
  scene.add(sun);
}

export class Snow {
  constructor(scene) {
    const S = CONFIG.snow;
    this.S = S;
    const pos = new Float32Array(S.count * 3);
    this.phase = new Float32Array(S.count);
    for (let i = 0; i < S.count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * S.area;
      pos[i * 3 + 1] = Math.random() * S.height;
      pos[i * 3 + 2] = (Math.random() - 0.5) * S.area;
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: S.size, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.time = 0;
  }

  // Flakes live in a box that follows the centre point and wraps around it.
  update(dt, center) {
    const S = this.S, a = this.points.geometry.attributes.position, p = a.array;
    const half = S.area / 2, base = center.y - 5;
    this.time += dt;
    for (let i = 0; i < S.count; i++) {
      const k = i * 3;
      p[k] += Math.sin(this.time + this.phase[i]) * S.drift * dt;
      p[k + 1] -= S.fallSpeed * dt;
      if (p[k] - center.x > half) p[k] -= S.area; else if (p[k] - center.x < -half) p[k] += S.area;
      if (p[k + 2] - center.z > half) p[k + 2] -= S.area; else if (p[k + 2] - center.z < -half) p[k + 2] += S.area;
      if (p[k + 1] < base) p[k + 1] += S.height; else if (p[k + 1] > base + S.height) p[k + 1] -= S.height;
    }
    a.needsUpdate = true;
  }
}

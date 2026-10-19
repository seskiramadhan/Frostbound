// Sky colour, fog, lights and falling snow around the player.
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function setupEnvironment(scene) {
  const F = CONFIG.fog, L = CONFIG.light, T = CONFIG.dungeon.torch;
  scene.background = new THREE.Color(F.color);
  scene.fog = new THREE.Fog(F.color, F.near, F.far);

  const hemi = new THREE.HemisphereLight(L.skyColor, L.groundColor, L.hemiIntensity);
  const sun = new THREE.DirectionalLight(L.sunColor, L.sunIntensity);
  sun.position.set(...L.sunDir).multiplyScalar(100);
  // Warm light carried by the player underground. Always in the scene (intensity 0
  // outside) so shaders don't recompile when switching.
  const torch = new THREE.PointLight(T.color, 0, T.distance, 1.5);
  scene.add(hemi, sun, torch);
  return { scene, hemi, sun, torch };
}

// Switch lighting/fog between the open valley and a dungeon.
export function applyAmbience(env, kind) {
  const F = CONFIG.fog, L = CONFIG.light, DG = CONFIG.dungeon;
  const inside = kind !== 'valley';
  const fog = inside ? DG.fog : F;
  env.scene.background.setHex(fog.color);
  env.scene.fog.color.setHex(fog.color);
  env.scene.fog.near = fog.near;
  env.scene.fog.far = fog.far;
  env.hemi.color.setHex(inside ? DG.light.hemiSky : L.skyColor);
  env.hemi.groundColor.setHex(inside ? DG.light.hemiGround : L.groundColor);
  env.hemi.intensity = inside ? DG.light.hemiIntensity : L.hemiIntensity;
  env.sun.intensity = inside ? 0 : L.sunIntensity;
  env.torch.intensity = inside ? DG.torch.intensity : 0;
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

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

// Switch lighting/fog: 'valley' (sunny once the World-Eater is gone), 'summit' (storm),
// or a dungeon (anything else).
export function applyAmbience(env, kind, sunny = false) {
  const F = CONFIG.fog, L = CONFIG.light, DG = CONFIG.dungeon, SU = CONFIG.summit, VI = CONFIG.victory;
  const inside = kind !== 'valley' && kind !== 'summit';
  const fog = kind === 'summit' ? SU.fog : inside ? DG.fog : sunny ? VI.fog : F;
  env.scene.background.setHex(fog.color);
  env.scene.fog.color.setHex(fog.color);
  env.scene.fog.near = fog.near;
  env.scene.fog.far = fog.far;
  if (inside) {
    env.hemi.color.setHex(DG.light.hemiSky);
    env.hemi.groundColor.setHex(DG.light.hemiGround);
    env.hemi.intensity = DG.light.hemiIntensity;
    env.sun.intensity = 0;
  } else if (kind === 'summit') {
    env.hemi.color.setHex(SU.light.hemiSky);
    env.hemi.groundColor.setHex(SU.light.hemiGround);
    env.hemi.intensity = SU.light.hemiIntensity;
    env.sun.intensity = SU.light.sun;
    env.sun.color.setHex(L.sunColor);
  } else {                                 // valley: the day/night cycle takes over every frame
    env.sun.color.setHex(L.sunColor);
    env.hemi.color.setHex(sunny ? VI.light.skyColor : L.skyColor);
    env.hemi.groundColor.setHex(L.groundColor);
    env.hemi.intensity = sunny ? VI.light.hemiIntensity : L.hemiIntensity;
    env.sun.intensity = sunny ? VI.light.sunIntensity : L.sunIntensity;
  }
  env.torch.intensity = inside ? DG.torch.intensity : 0;
}

// Day/night in the valley: blend the day look (or the sunny post-victory look) toward night by
// the sun's height, with a warm tint near sunrise/sunset. t: 0..1 (0 midnight, 0.5 noon).
// Returns { day } (0 = full night, 1 = full day).
const _a = new THREE.Color(), _b = new THREE.Color(), _dusk = new THREE.Color();
export function dayLight(t) {
  const sunH = Math.sin((t - 0.25) * Math.PI * 2);                       // -1 midnight .. 1 noon
  return { sunH, day: Math.min(1, Math.max(0, (sunH + 0.15) / 0.4)) };
}

export function applyDayNight(env, t, sunny = false) {
  const DN = CONFIG.dayNight, N = DN.night, F = CONFIG.fog, L = CONFIG.light, VI = CONFIG.victory;
  const { sunH, day } = dayLight(t);
  const duskK = Math.max(0, 1 - Math.abs(sunH) / 0.3) * 0.45;
  _dusk.setHex(DN.dusk);
  const mix = (dayHex, nightHex) => _a.setHex(nightHex).lerp(_b.setHex(dayHex), day).lerp(_dusk, duskK);
  const dayFog = sunny ? VI.fog.color : F.color;
  env.scene.background.copy(mix(dayFog, N.fog));
  env.scene.fog.color.copy(env.scene.background);
  env.hemi.color.copy(mix(sunny ? VI.light.skyColor : L.skyColor, N.sky));
  env.hemi.groundColor.copy(_a.setHex(N.ground).lerp(_b.setHex(L.groundColor), day));
  env.hemi.intensity = N.hemi + ((sunny ? VI.light.hemiIntensity : L.hemiIntensity) - N.hemi) * day;
  env.sun.color.copy(_a.setHex(N.moon).lerp(_b.setHex(L.sunColor), day).lerp(_dusk, duskK));
  env.sun.intensity = N.moonI + ((sunny ? VI.light.sunIntensity : L.sunIntensity) - N.moonI) * day;
  const ang = (t - 0.25) * Math.PI * 2;                                   // sun (or moon) arcs over
  env.sun.position.set(Math.cos(ang) * 100, Math.max(0.25, Math.abs(Math.sin(ang))) * 100, 30);
  env.torch.intensity = DN.torchAtNight * (1 - day);
  return { day };
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

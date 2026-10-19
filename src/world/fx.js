// Particles (fire, shout blasts, dragon souls) in one pooled Points object: one draw call.
// Additive blending, so fading colour toward black fades the particle out.
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const N = CONFIG.fx.maxParticles;
const tmp = new THREE.Vector3();

// Round soft glow, drawn on a canvas at startup (no texture files).
function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Fx {
  constructor(scene) {
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.p = Array.from({ length: N }, () => ({
      life: 0, max: 1, vx: 0, vy: 0, vz: 0, r: 0, g: 0, b: 0, drag: 0, rise: 0, home: null,
    }));
    for (let i = 0; i < N; i++) this.pos[i * 3 + 1] = -9999;
    this.next = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.8, map: softDot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Expanding ring for shouts
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1, 24, 1, -0.9, 1.8),
      new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.visible = false;
    scene.add(this.ring);
    this.ringT = 1;
  }

  emit(x, y, z, vx, vy, vz, life, r, g, b, opts = {}) {
    const i = this.next;
    this.next = (this.next + 1) % N;
    const q = this.p[i];
    q.life = q.max = life;
    q.vx = vx; q.vy = vy; q.vz = vz;
    q.r = r; q.g = g; q.b = b;
    q.drag = opts.drag ?? 0;
    q.rise = opts.rise ?? 0;
    q.home = opts.home ?? null;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
  }

  // Cone of flame from `origin` along unit `dir` (x, y, z), reaching about `range` metres.
  fire(origin, dir, range, count = 14) {
    for (let k = 0; k < count; k++) {
      const sp = range * (1.6 + Math.random() * 0.8);
      const j = 0.22;
      const g = 0.35 + Math.random() * 0.45;
      this.emit(origin.x, origin.y, origin.z,
        (dir.x + (Math.random() - 0.5) * j) * sp, (dir.y + (Math.random() - 0.5) * j) * sp, (dir.z + (Math.random() - 0.5) * j) * sp,
        0.45 + Math.random() * 0.2, 1, g, 0.08, { drag: 2.5, rise: 2 });
    }
  }

  // Ice Form: a cone of frost along the facing.
  ice(origin, facing, range) {
    for (let k = 0; k < 60; k++) {
      const a = facing + (Math.random() - 0.5) * 1.1, sp = range * (1.4 + Math.random());
      this.emit(origin.x + Math.sin(facing), origin.y + 1.5, origin.z + Math.cos(facing), Math.sin(a) * sp, (Math.random() - 0.4) * 2, Math.cos(a) * sp,
        0.7, 0.6, 0.85, 1, { drag: 2.5 });
    }
  }

  // Burst of fire on the ground (dragon fire landing, burning corpse).
  burn(p, radius, count = 6) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
      this.emit(p.x + Math.cos(a) * r, p.y + 0.3, p.z + Math.sin(a) * r, 0, 1.5 + Math.random() * 2, 0,
        0.5 + Math.random() * 0.4, 1, 0.4 + Math.random() * 0.3, 0.05, { rise: 1 });
    }
  }

  // Shout blast: pale ring plus a spray of air particles along the facing.
  shout(origin, facing, range) {
    const fx = Math.sin(facing), fz = Math.cos(facing);
    for (let k = 0; k < 40; k++) {
      const a = facing + (Math.random() - 0.5) * 1.3, sp = range * (1.5 + Math.random());
      this.emit(origin.x + fx, origin.y + 1.5, origin.z + fz, Math.sin(a) * sp, (Math.random() - 0.3) * 3, Math.cos(a) * sp,
        0.5, 0.55, 0.7, 0.9, { drag: 3 });
    }
    this.ring.position.set(origin.x + fx * 1.5, origin.y + 1.5, origin.z + fz * 1.5);
    this.ring.lookAt(origin.x + fx * 10, origin.y + 1.5, origin.z + fz * 10);
    this.ringT = 0;
    this.ringRange = range;
    this.ring.visible = true;
  }

  // Bright motes drifting from `from` into the moving target `to` (a Vector3 that is read live).
  soul(from, to, count = 12) {
    for (let k = 0; k < count; k++) {
      this.emit(from.x + (Math.random() - 0.5) * 5, from.y + Math.random() * 3, from.z + (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4,
        2.5, 0.9, 0.75, 0.45, { home: to });
    }
  }

  update(dt) {
    const pos = this.pos, col = this.col;
    for (let i = 0; i < N; i++) {
      const q = this.p[i];
      if (q.life <= 0) continue;
      q.life -= dt;
      const k = i * 3;
      if (q.life <= 0) { pos[k + 1] = -9999; col[k] = col[k + 1] = col[k + 2] = 0; continue; }
      if (q.home) {                       // steer toward the target, faster as it ages
        tmp.set(q.home.x - pos[k], q.home.y + 1.2 - pos[k + 1], q.home.z - pos[k + 2]);
        const d = tmp.length();
        if (d < 0.6) { q.life = 0; pos[k + 1] = -9999; col[k] = col[k + 1] = col[k + 2] = 0; continue; }
        const pull = 14 * (1 - q.life / q.max) + 2;
        q.vx += (tmp.x / d * pull * 2 - q.vx) * Math.min(1, dt * 3);
        q.vy += (tmp.y / d * pull * 2 - q.vy) * Math.min(1, dt * 3);
        q.vz += (tmp.z / d * pull * 2 - q.vz) * Math.min(1, dt * 3);
      }
      const drag = Math.max(0, 1 - q.drag * dt);
      q.vx *= drag; q.vz *= drag; q.vy = q.vy * drag + q.rise * dt;
      pos[k] += q.vx * dt; pos[k + 1] += q.vy * dt; pos[k + 2] += q.vz * dt;
      const f = q.home ? 1 : q.life / q.max;
      col[k] = q.r * f; col[k + 1] = q.g * f; col[k + 2] = q.b * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    if (this.ring.visible) {
      this.ringT += dt / 0.4;
      const s = 1 + this.ringT * this.ringRange * 0.6;
      this.ring.scale.set(s, s, s);
      this.ring.material.opacity = 0.55 * (1 - this.ringT);
      if (this.ringT >= 1) this.ring.visible = false;
    }
  }
}

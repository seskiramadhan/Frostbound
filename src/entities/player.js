// The player: low-poly Nord, camera-relative movement on the terrain.
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const P = CONFIG.player;

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, flatShading: true }));
  m.position.set(x, y, z);
  return m;
}

function buildModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();   // bobs while walking
  root.add(body);

  // Legs pivot at the hip
  const legs = [-0.15, 0.15].map(x => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.85, 0);
    pivot.add(box(0.22, 0.85, 0.24, 0x3b2f26, 0, -0.42, 0));
    pivot.add(box(0.25, 0.18, 0.32, 0x2a211b, 0, -0.78, 0.04)); // boot
    body.add(pivot);
    return pivot;
  });

  body.add(box(0.56, 0.7, 0.32, 0x6b4c34, 0, 1.2, 0));        // leather tunic
  body.add(box(0.6, 0.1, 0.36, 0x2e231b, 0, 0.92, 0));        // belt
  body.add(box(0.66, 0.22, 0.4, 0x9a8f80, 0, 1.52, 0));       // fur mantle
  body.add(box(0.6, 0.85, 0.06, 0x4a5560, 0, 1.12, -0.2));    // cloak
  body.add(box(0.3, 0.3, 0.3, 0xd9b08c, 0, 1.8, 0));          // head
  body.add(box(0.34, 0.16, 0.34, 0x7d838c, 0, 1.95, 0));      // helmet
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), new THREE.MeshLambertMaterial({ color: 0xe8dcc0, flatShading: true }));
    horn.position.set(s * 0.2, 2.0, 0); horn.rotation.z = -s * 1.0;
    body.add(horn);
  }

  // Arms pivot at the shoulder
  const arms = [-0.38, 0.38].map(x => {
    const pivot = new THREE.Group(); pivot.position.set(x, 1.5, 0);
    pivot.add(box(0.17, 0.62, 0.2, 0x6b4c34, 0, -0.3, 0));
    pivot.add(box(0.15, 0.14, 0.16, 0xd9b08c, 0, -0.66, 0)); // hand
    body.add(pivot);
    return pivot;
  });

  // Blob shadow (cheaper than shadow maps)
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;

  return { root, body, legs, arms, shadow };
}

export class Player {
  constructor(scene, terrain, colliders) {
    this.terrain = terrain;
    this.colliders = colliders;

    const [sx, sz] = P.spawn;
    this.pos = new THREE.Vector3(sx, terrain.heightAt(sx, sz), sz);
    this.prevPos = this.pos.clone();
    this.vel = new THREE.Vector3();
    this.facing = Math.PI;          // radians, model faces +z at 0
    this.prevFacing = this.facing;
    this.walkPhase = 0;
    this.speed = 0;

    this.model = buildModel();
    scene.add(this.model.root, this.model.shadow);
  }

  // Fixed-step update. move = {x, y} from input, yaw = camera yaw.
  tick(dt, move, run, yaw) {
    this.prevPos.copy(this.pos);
    this.prevFacing = this.facing;

    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);   // camera forward on XZ
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);    // camera right
    const speed = run ? P.runSpeed : P.walkSpeed;
    const wx = (fx * move.y + rx * move.x) * speed;
    const wz = (fz * move.y + rz * move.x) * speed;

    const k = Math.min(1, P.accel * dt);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;

    this.#moveAxis(this.vel.x * dt, 0);
    this.#moveAxis(0, this.vel.z * dt);
    this.#pushOutOfColliders();

    const lim = this.terrain.half - P.worldMargin;
    this.pos.x = Math.min(lim, Math.max(-lim, this.pos.x));
    this.pos.z = Math.min(lim, Math.max(-lim, this.pos.z));
    this.pos.y = this.terrain.heightAt(this.pos.x, this.pos.z);

    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.2) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let diff = target - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, P.turnSpeed * dt);
    }
    this.walkPhase += sp * dt * 2.2;
    this.speed = sp;
  }

  // Reject steps that climb steeper than the slope limit.
  #moveAxis(dx, dz) {
    if (dx === 0 && dz === 0) return;
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    const rise = this.terrain.heightAt(nx, nz) - this.terrain.heightAt(this.pos.x, this.pos.z);
    if (rise > P.maxClimb * Math.hypot(dx, dz)) {
      if (dx) this.vel.x = 0; else this.vel.z = 0;
      return;
    }
    this.pos.x = nx; this.pos.z = nz;
  }

  #pushOutOfColliders() {
    const r = P.radius;
    for (const c of this.colliders) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z, min = c.r + r;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d = Math.hypot(dx, dz);
      if (d >= min || d === 0) continue;
      this.pos.x = c.x + dx / d * min;
      this.pos.z = c.z + dz / d * min;
    }
  }

  // Render-time: interpolate between fixed steps and animate.
  render(alpha, out) {
    out.lerpVectors(this.prevPos, this.pos, alpha);
    let df = this.facing - this.prevFacing;
    df = Math.atan2(Math.sin(df), Math.cos(df));
    const { root, body, legs, arms, shadow } = this.model;
    root.position.copy(out);
    root.rotation.y = this.prevFacing + df * alpha;

    const swing = Math.sin(this.walkPhase) * Math.min(1, this.speed / P.walkSpeed) * 0.7;
    legs[0].rotation.x = swing; legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing * 0.8; arms[1].rotation.x = swing * 0.8;
    body.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.05 * Math.min(1, this.speed / P.walkSpeed);

    shadow.position.set(out.x, out.y + 0.05, out.z);
    return out;
  }
}

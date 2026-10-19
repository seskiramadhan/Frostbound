// Arrows: pooled meshes flying with gravity. Hits go through combat with source 'arrow';
// misses stick in the ground or wall for a moment. Cosmetic arrows (what co-op guests see of
// enemy shots, which the host resolves) fly and stick but never hit.
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const BW = CONFIG.bow;
const POOL = 24;
const fwd = new THREE.Vector3(0, 0, 1);

export class Projectiles {
  constructor(scene, entities, combat) {
    this.entities = entities;
    this.combat = combat;
    const shaft = new THREE.BoxGeometry(0.035, 0.035, 0.85);
    const mat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
    this.list = Array.from({ length: POOL }, () => {
      const mesh = new THREE.Mesh(shaft, mat);
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, live: false, stuck: false };
    });
    this.next = 0;
  }

  // Fire from `from` toward world point `at` with `power` 0..1.
  fire(shooter, from, at, power, damage, cosmetic = false) {
    const a = this.list[this.next];
    this.next = (this.next + 1) % POOL;
    const speed = BW.speed * (0.55 + 0.45 * power);
    a.pos.copy(from);
    a.vel.subVectors(at, from);
    const dist = a.vel.length();
    a.vel.multiplyScalar(speed / Math.max(dist, 0.001));
    a.vel.y += 0.5 * BW.gravity * (dist / speed);          // aim a little high so the arc lands on target
    a.shooter = shooter;
    a.level = shooter.level;
    a.damage = damage;
    a.cosmetic = cosmetic;
    a.life = BW.life;
    a.live = true;
    a.stuck = false;
    a.mesh.visible = true;
    this.#orient(a);
  }

  #orient(a) {
    a.mesh.position.copy(a.pos);
    if (a.vel.lengthSq() > 0) a.mesh.quaternion.setFromUnitVectors(fwd, a.vel.clone().normalize());
  }

  update(dt) {
    for (const a of this.list) {
      if (!a.mesh.visible) continue;
      a.life -= dt;
      if (a.life <= 0) { a.mesh.visible = false; a.live = false; continue; }
      if (a.stuck) continue;
      a.vel.y -= BW.gravity * dt;
      a.pos.addScaledVector(a.vel, dt);
      this.#orient(a);

      // Hit something alive?
      for (const e of a.cosmetic ? [] : this.entities) {
        if (!e.alive || e.team === a.shooter.team || e.level !== a.level) continue;
        const r = (e.flying ? e.airRadius : e.radius) + BW.hitPad;
        const cy = e.pos.y + (e.aimHeight ?? 0.8);
        const dx = a.pos.x - e.pos.x, dy = a.pos.y - cy, dz = a.pos.z - e.pos.z;
        if (dx * dx + dz * dz < r * r && Math.abs(dy) < r + 0.6) {
          this.combat.applyHit(a.shooter, e, a.damage, 'arrow');
          a.mesh.visible = false;
          a.live = false;
          break;
        }
      }
      if (!a.live) continue;

      // Ground or wall: stick
      const lv = a.level;
      if (a.pos.y <= lv.heightAt(a.pos.x, a.pos.z) + 0.05 || lv.blocked?.(a.pos.x, a.pos.z, 0) || (lv.ceiling && a.pos.y > lv.ceiling)) {
        a.stuck = true;
        a.live = false;
        a.life = Math.min(a.life, 4);
      }
    }
  }
}

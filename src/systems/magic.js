// Destruction (fire). Firebolt: a pooled glowing ball that flies straight and bursts on the
// first enemy or wall it meets (small splash). Flames: a short cone in front of a player
// holding the spell (player state 'flames'), damage dealt in small ticks.
// All hits go through combat with source 'fire' (Destruction XP, co-op forwarding).
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { inArc } from './combat.js';

const FB = CONFIG.magic.firebolt, FL = CONFIG.magic.flames;
const POOL = 8;

export class Magic {
  constructor(scene, entities, combat, fx) {
    this.entities = entities;
    this.combat = combat;
    this.fx = fx;
    const geo = new THREE.IcosahedronGeometry(0.22, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    this.bolts = Array.from({ length: POOL }, () => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, live: false };
    });
    this.next = 0;
    this.tick = 0;
  }

  // Throw a firebolt from `from` toward world point `at`.
  fire(caster, from, at, damage) {
    const b = this.bolts[this.next];
    this.next = (this.next + 1) % POOL;
    b.pos.copy(from);
    b.vel.subVectors(at, from).setLength(FB.speed);
    b.caster = caster;
    b.level = caster.level;
    b.damage = damage;
    b.life = FB.life;
    b.live = true;
    b.mesh.visible = true;
    b.mesh.position.copy(b.pos);
  }

  #burst(b) {
    b.live = false;
    b.mesh.visible = false;
    this.fx.burn(b.pos, FB.radius, 14);
    for (const e of this.entities) {
      if (!e.alive || e.team === b.caster.team || e.level !== b.level) continue;
      const r = FB.radius + (e.flying ? e.airRadius : e.radius);
      const cy = e.pos.y + (e.aimHeight ?? 0.8);
      if (Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z) < r && Math.abs(cy - b.pos.y) < r + 0.8) {
        this.combat.applyHit(b.caster, e, b.damage, 'fire');
      }
    }
  }

  // casters: players (local) to check for the Flames state.
  update(dt, casters) {
    for (const b of this.bolts) {
      if (!b.live) continue;
      if ((b.life -= dt) <= 0) { b.live = false; b.mesh.visible = false; continue; }
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.x += dt * 9;
      if (Math.random() < 0.6) this.fx.emit(b.pos.x, b.pos.y, b.pos.z, 0, 0.5, 0, 0.3, 1, 0.45, 0.08, { rise: 1 });
      let hit = false;
      for (const e of this.entities) {
        if (!e.alive || e.team === b.caster.team || e.level !== b.level) continue;
        const r = (e.flying ? e.airRadius : e.radius) + 0.25, cy = e.pos.y + (e.aimHeight ?? 0.8);
        if ((b.pos.x - e.pos.x) ** 2 + (b.pos.z - e.pos.z) ** 2 < r * r && Math.abs(b.pos.y - cy) < r + 0.6) { hit = true; break; }
      }
      const lv = b.level;
      if (hit || b.pos.y <= lv.heightAt(b.pos.x, b.pos.z) + 0.1 || lv.blocked?.(b.pos.x, b.pos.z, 0) || (lv.ceiling && b.pos.y > lv.ceiling)) this.#burst(b);
    }

    this.tick += dt;
    const strike = this.tick >= FL.every;
    if (strike) this.tick = 0;
    for (const c of casters) {
      if (c.state !== 'flames' || !c.alive) continue;
      this.flameFx(c.pos, c.facing);
      if (!strike) continue;
      for (const e of this.entities) {
        if (!e.alive || e.team === c.team || e.level !== c.level) continue;
        if (inArc(c, e, FL.range + e.radius, FL.arc)) this.combat.applyHit(c, e, (c.flamesDamage ?? FL.damagePerSec) * FL.every, 'fire');
      }
    }
  }

  // The Flames stream from a hand (also drawn for co-op players holding the spell).
  flameFx(pos, facing) {
    const dir = { x: Math.sin(facing), y: -0.08, z: Math.cos(facing) };
    this.fx.fire({ x: pos.x + dir.x * 0.6, y: pos.y + 1.3, z: pos.z + dir.z * 0.6 }, dir, FL.range * 0.55, 2);
  }
}

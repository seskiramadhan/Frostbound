// Third-person orbit camera that follows the player and stays above the terrain.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const C = CONFIG.camera;

export class ThirdPersonCamera {
  constructor(camera, level) {
    this.camera = camera;
    this.level = level;   // swapped when entering a dungeon
    this.yaw = 0;
    this.pitch = C.startPitch;
    this.target = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.snapped = false;
    this.trauma = 0;
  }

  shake(amount) {
    this.trauma = Math.max(this.trauma, amount);
  }

  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = Math.min(C.maxPitch, Math.max(C.minPitch, this.pitch + dy));
  }

  // Jump straight to the new position next frame (after teleports).
  snap() { this.snapped = false; }

  update(dt, playerPos) {
    this.target.set(playerPos.x, playerPos.y + C.height, playerPos.z);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.desired.set(
      this.target.x + Math.sin(this.yaw) * cp * C.distance,
      this.target.y + sp * C.distance,
      this.target.z + Math.cos(this.yaw) * cp * C.distance,
    );

    // Pull in when a wall is in the way, then keep out of the ground and under any ceiling
    const lv = this.level, t = this.target, d = this.desired;
    if (lv.blocked) {
      const steps = 12;
      let k = 1;
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        if (lv.blocked(t.x + (d.x - t.x) * f, t.z + (d.z - t.z) * f, 0.3)) { k = (i - 1) / steps; break; }
      }
      k = Math.max(k, C.minDistance / C.distance);
      d.lerpVectors(t, d, k);
    }
    const floor = lv.heightAt(d.x, d.z) + C.groundClearance;
    if (d.y < floor) d.y = floor;
    if (lv.ceiling !== undefined) d.y = Math.min(d.y, lv.ceiling - C.ceilingClearance);

    const cam = this.camera;
    if (!this.snapped) { cam.position.copy(this.desired); this.snapped = true; }
    else cam.position.lerp(this.desired, 1 - Math.exp(-C.follow * dt));
    cam.lookAt(this.target);

    if (this.trauma > 0) {
      const a = this.trauma * this.trauma;
      cam.rotation.z += (Math.random() * 2 - 1) * a * 0.3;
      cam.rotation.x += (Math.random() * 2 - 1) * a * 0.2;
      this.trauma = Math.max(0, this.trauma - CONFIG.combat.shake.decay * dt * this.trauma - dt * 0.2);
    }
  }
}

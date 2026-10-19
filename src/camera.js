// Third-person orbit camera that follows the player and stays above the terrain.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const C = CONFIG.camera;

export class ThirdPersonCamera {
  constructor(camera, terrain) {
    this.camera = camera;
    this.terrain = terrain;
    this.yaw = 0;
    this.pitch = C.startPitch;
    this.target = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.snapped = false;
  }

  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = Math.min(C.maxPitch, Math.max(C.minPitch, this.pitch + dy));
  }

  update(dt, playerPos) {
    this.target.set(playerPos.x, playerPos.y + C.height, playerPos.z);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.desired.set(
      this.target.x + Math.sin(this.yaw) * cp * C.distance,
      this.target.y + sp * C.distance,
      this.target.z + Math.cos(this.yaw) * cp * C.distance,
    );

    // Keep the camera out of the ground
    const floor = this.terrain.heightAt(this.desired.x, this.desired.z) + C.groundClearance;
    if (this.desired.y < floor) this.desired.y = floor;

    const cam = this.camera;
    if (!this.snapped) { cam.position.copy(this.desired); this.snapped = true; }
    else cam.position.lerp(this.desired, 1 - Math.exp(-C.follow * dt));
    cam.lookAt(this.target);
  }
}

// Wooden chest with iron bands; the lid swings open once looted.
import * as THREE from 'three';
import { box } from '../entities/model.js';

export class Chest {
  constructor(scene, level, pos, lootKey, facing = 0) {
    this.level = level;
    this.pos = pos.clone();
    this.lootKey = lootKey;
    this.key = `${level.key}.${lootKey}`;    // stable id for saves
    this.opened = false;
    this.openT = 0;

    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = facing;
    g.add(box(1.1, 0.55, 0.7, 0x6a4a2c, 0, 0.28, 0));
    g.add(box(1.14, 0.08, 0.74, 0x3c3f44, 0, 0.12, 0));
    g.add(box(1.14, 0.08, 0.74, 0x3c3f44, 0, 0.46, 0));
    this.lid = new THREE.Group();
    this.lid.position.set(0, 0.55, -0.35);       // hinge at the back
    this.lid.add(box(1.1, 0.22, 0.7, 0x7a5634, 0, 0.11, 0.35));
    this.lid.add(box(0.14, 0.14, 0.06, 0x9a8a50, 0, 0.0, 0.71)); // lock plate
    g.add(this.lid);
    scene.add(g);
    this.group = g;

    level.colliders.push({ x: pos.x, z: pos.z, r: 0.6 });
  }

  open(instant = false) {
    this.opened = true;
    if (instant) this.openT = 1;
  }

  update(dt) {
    if (!this.opened || this.openT >= 1) { this.lid.rotation.x = -1.9 * this.openT; return; }
    this.openT = Math.min(1, this.openT + dt * 2.5);
    this.lid.rotation.x = -1.9 * (1 - (1 - this.openT) ** 2);
  }
}

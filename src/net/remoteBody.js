// Host side: a guest's body in the host's world. Enemies chase and hit it like the
// host's own player, but damage is sent to the guest, whose game applies it (armour,
// block skill, health). Updated from the guest's poses.
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class RemoteBody {
  constructor(onHurt) {
    this.remote = true;
    this.kind = 'player';
    this.team = 'player';
    this.radius = CONFIG.player.radius;
    this.aimHeight = 1.2;
    this.pos = new THREE.Vector3(0, -500, 0);
    this.vel = new THREE.Vector3();
    this.level = null;
    this.facing = 0;
    this.state = 'move';
    this.alive = false;       // until the first pose arrives
    this.hp = this.maxHp = 100;
    this.onHurt = onHurt;
  }

  get blocking() { return this.state === 'block'; }

  update(pose, levels) {
    this.level = levels[pose.level] ?? null;
    this.pos.copy(pose.pos);
    this.facing = pose.facing;
    this.state = pose.state;
    this.alive = pose.state !== 'dead' && !!this.level;
  }

  hurt(damage, blocked, attacker) { this.onHurt(damage, blocked, attacker.pos); }
  onHit() {}
  die() {}
}

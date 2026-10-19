// Another player in co-op: same Nord model, drawn slightly in the past and interpolated
// between received poses so 15 updates a second look smooth. Shows a name tag.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { buildModel, animate, applyLook } from './player.js';
import { lerpAngle } from './model.js';

const N = CONFIG.net, I = CONFIG.items;

function nameTag(name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '28px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.strokeText(name, 128, 32);
  g.fillStyle = '#f2efe6';
  g.fillText(name, 128, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, transparent: true }));
  sprite.scale.set(1.8, 0.45, 1);
  sprite.position.y = 2.55;
  return sprite;
}

export class RemotePlayer {
  constructor(scene, name, look) {
    this.scene = scene;
    this.name = name;
    this.model = buildModel();
    this.tag = nameTag(name);
    this.model.root.add(this.tag);
    scene.add(this.model.root, this.model.shadow);
    this.buf = [];           // [{ t, pose }], oldest first
    this.walkPhase = 0;
    this.lastPos = null;
    this.setLook(look);
  }

  setLook(look) {
    applyLook(this.model, I[look?.w] ?? I.ironSword, I[look?.a] ?? I.clothes);
  }

  push(pose) {
    this.buf.push({ t: performance.now() / 1000, pose });
    if (this.buf.length > 30) this.buf.shift();
  }

  // levelKey: the local player's level; levels: { key: level } for ground height.
  render(dt, levelKey, levels) {
    const { root, shadow } = this.model;
    const now = performance.now() / 1000 - N.interpDelay;
    const buf = this.buf;
    if (!buf.length) { root.visible = shadow.visible = false; return; }

    // Find the two poses around `now`
    let a = buf[0], b = buf[0];
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].t <= now) { a = buf[i]; b = buf[Math.min(i + 1, buf.length - 1)]; break; }
    }
    const pa = a.pose, pb = b.pose;
    const span = b.t - a.t;
    const k = span > 0 ? Math.min(1, Math.max(0, (now - a.t) / span)) : 1;
    const pose = k < 0.5 ? pa : pb;

    const visible = pose.level === levelKey;
    root.visible = shadow.visible = visible;
    if (!visible) return;

    if (pa.level === pb.level) root.position.lerpVectors(pa.pos, pb.pos, k);
    else root.position.copy(pb.pos);
    root.rotation.y = lerpAngle(pa.facing, pb.facing, k);
    this.walkPhase += pose.speed * dt * 2.2;

    animate(this.model, {
      speed: pose.speed, walkPhase: this.walkPhase, bowMode: pose.bowMode, state: pose.state,
      stateTime: pose.stateTime, drawTime: pose.drawTime, staggerTime: CONFIG.combat.stagger.player,
      grounded: pose.grounded,
    });
    const lv = levels[pose.level];
    shadow.position.set(root.position.x, (lv ? lv.heightAt(root.position.x, root.position.z) : root.position.y) + 0.05, root.position.z);
  }

  dispose() {
    this.scene.remove(this.model.root, this.model.shadow);
    this.tag.material.map.dispose();
  }
}

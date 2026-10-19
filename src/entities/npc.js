// Villagers: cheap humanoids (body merged into one mesh + 4 limbs = 5 draw calls) that
// idle and stroll between two spots, and turn to face you when you come close.
// Not combat entities: enemies and weapons ignore them.
import * as THREE from 'three';
import { mergeColored } from '../world/props.js';
import { blobShadow, lerpAngle } from './model.js';

function part(w, h, d, color, x, y, z) {
  return { geo: new THREE.BoxGeometry(w, h, d).translate(x, y, z), color };
}

function buildModel(look) {
  const root = new THREE.Group();
  const lam = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const bodyParts = [
    part(0.56, 0.7, 0.32, look.tunic, 0, 1.2, 0),
    part(0.6, 0.1, 0.36, 0x2e231b, 0, 0.92, 0),
    part(0.3, 0.3, 0.3, look.skin, 0, 1.8, 0),
    part(0.32, 0.12, 0.32, look.hair, 0, 1.98, -0.01),
    part(0.32, 0.22, 0.06, look.hair, 0, 1.85, -0.15),
  ];
  if (look.beard) bodyParts.push(part(0.26, 0.2, 0.08, look.hair, 0, 1.66, 0.16));
  if (look.crown) bodyParts.push(part(0.34, 0.08, 0.34, 0xc9a640, 0, 2.06, 0));
  if (look.cloak) bodyParts.push(part(0.62, 1.0, 0.06, look.cloak, 0, 1.1, -0.2), part(0.66, 0.2, 0.38, 0x9a8f80, 0, 1.52, 0));
  if (look.apron) bodyParts.push(part(0.46, 0.6, 0.04, look.apron, 0, 1.0, 0.17));
  const body = new THREE.Mesh(mergeColored(bodyParts), lam);
  root.add(body);

  const limb = (x, y, h, color, w = 0.2) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.22).translate(0, -h / 2, 0), new THREE.MeshLambertMaterial({ color, flatShading: true }));
    pivot.add(m);
    root.add(pivot);
    return pivot;
  };
  const legs = [limb(-0.15, 0.85, 0.85, look.legs), limb(0.15, 0.85, 0.85, look.legs)];
  const arms = [limb(-0.38, 1.5, 0.66, look.tunic, 0.17), limb(0.38, 1.5, 0.66, look.tunic, 0.17)];
  return { root, body, legs, arms, shadow: blobShadow(0.5) };
}

function nameTag(name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '26px Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(name, 128, 32);
  g.fillStyle = '#e8c86a'; g.fillText(name, 128, 32);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, transparent: true }));
  s.scale.set(1.8, 0.45, 1);
  s.position.y = 2.45;
  return s;
}

export class Npc {
  // def: { id, name, look, spots: [Vector3, Vector3] }
  constructor(scene, level, def) {
    this.id = def.id;
    this.name = def.name;
    this.level = level;
    this.spots = def.spots;
    this.pos = def.spots[0].clone();
    this.facing = 0;
    this.goal = 0;
    this.wait = 2 + Math.random() * 4;
    this.walkPhase = 0;
    this.moving = false;
    this.model = buildModel(def.look);
    this.model.root.add(nameTag(def.name));
    scene.add(this.model.root, this.model.shadow);
  }

  // player: to face them when close. talking: stand still.
  update(dt, player, talking) {
    const near = player.level === this.level && this.pos.distanceToSquared(player.pos) < 16;
    this.moving = false;
    if (near || talking) {
      this.facing = lerpAngle(this.facing, Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), Math.min(1, dt * 5));
    } else if ((this.wait -= dt) <= 0) {
      const to = this.spots[this.goal];
      const dx = to.x - this.pos.x, dz = to.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.1) { this.goal = 1 - this.goal; this.wait = 3 + Math.random() * 5; }
      else {
        const step = Math.min(d, 1.3 * dt);
        this.pos.x += dx / d * step; this.pos.z += dz / d * step;
        this.pos.y = this.level.heightAt(this.pos.x, this.pos.z);
        this.facing = lerpAngle(this.facing, Math.atan2(dx, dz), Math.min(1, dt * 6));
        this.moving = true;
      }
    }
    if (this.moving) this.walkPhase += dt * 6;

    const { root, legs, arms, shadow } = this.model;
    root.position.copy(this.pos);
    root.rotation.y = this.facing;
    const sw = this.moving ? Math.sin(this.walkPhase) * 0.5 : 0;
    const breathe = Math.sin(performance.now() / 700 + this.pos.x) * 0.03;
    legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
    arms[0].rotation.x = -sw * 0.8 + breathe; arms[1].rotation.x = sw * 0.8 - breathe;
    if (talking) arms[1].rotation.x = -0.6 + Math.sin(performance.now() / 250) * 0.15;   // gesturing
    shadow.position.set(this.pos.x, this.pos.y + 0.05, this.pos.z);
  }
}

// The Greybeards of High Hrothgar (stand in the monastery courtyard)
export const GREYBEARDS = [
  { id: 'arngeir', name: 'Master Arngeir', look: { tunic: 0x8c8a82, legs: 0x6e6c66, skin: 0xd2ad8c, hair: 0xe0e0da, beard: true, cloak: 0x7a7870 } },
  { id: 'borri', name: 'Master Borri', look: { tunic: 0x86847c, legs: 0x6e6c66, skin: 0xcfa888, hair: 0xd8d8d2, beard: true } },
  { id: 'einarth', name: 'Master Einarth', look: { tunic: 0x8a887f, legs: 0x6e6c66, skin: 0xd6b090, hair: 0xe4e4de, beard: true } },
];

// Looks for the Frosthollow villagers
export const VILLAGERS = [
  { id: 'jarl', name: 'Jarl Hrolf', look: { tunic: 0x5a2a28, legs: 0x2e2620, skin: 0xd9b08c, hair: 0x8a7a68, beard: true, crown: true, cloak: 0x3a3f5a } },
  { id: 'merchant', name: 'Ingrid', look: { tunic: 0x3f6a4a, legs: 0x3b2f26, skin: 0xe2bc98, hair: 0xc9a46a, apron: 0x8a7a5a } },
  { id: 'innkeeper', name: 'Bera', look: { tunic: 0x7a5a3a, legs: 0x3b2f26, skin: 0xd8a882, hair: 0x5a3a24, apron: 0xd8d0c0 } },
  { id: 'hunter', name: 'Ulf the Hunter', look: { tunic: 0x5a4a32, legs: 0x3b2f26, skin: 0xc99a74, hair: 0x2e241c, beard: true, cloak: 0x6a6a64 } },
  { id: 'sven', name: 'Old Sven', look: { tunic: 0x4a4e58, legs: 0x2e2a26, skin: 0xd9b08c, hair: 0xd8d8d0, beard: true } },
];

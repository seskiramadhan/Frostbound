// Wolf look + animation for Creature (cfg.scale and cfg.fur vary it, e.g. the alpha).
import * as THREE from 'three';
import { box, blobShadow, clamp01 } from './model.js';

export function build(cfg) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(cfg.scale);
  root.add(body);
  const fur = cfg.fur, light = 0xb9bec4, dark = 0x55595f;

  body.add(box(0.42, 0.42, 1.05, fur, 0, 0.78, -0.05));       // torso
  body.add(box(0.52, 0.52, 0.42, light, 0, 0.84, 0.32));      // ruff
  const tail = box(0.12, 0.12, 0.55, fur, 0, 0.86, -0.75);
  tail.rotation.x = 0.5;
  body.add(tail);

  const head = new THREE.Group(); head.position.set(0, 0.98, 0.55);
  head.add(box(0.34, 0.32, 0.36, fur, 0, 0, 0.12));
  head.add(box(0.2, 0.15, 0.28, dark, 0, -0.06, 0.4));         // snout
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), new THREE.MeshLambertMaterial({ color: dark, flatShading: true }));
    ear.position.set(s * 0.1, 0.22, 0.04);
    head.add(ear);
  }
  body.add(head);

  const legs = [[-0.14, 0.32], [0.14, 0.32], [-0.14, -0.4], [0.14, -0.4]].map(([x, z]) => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.62, z);
    pivot.add(box(0.12, 0.62, 0.13, dark, 0, -0.31, 0));
    body.add(pivot);
    return pivot;
  });

  return { root, body, head, legs, shadow: blobShadow(0.6 * cfg.scale) };
}

export function animate({ body, head, legs }, c) {
  const run = Math.min(1, c.speed / c.cfg.walkSpeed * 0.6);
  const s = Math.sin(c.walkPhase) * run * 0.6;
  legs[0].rotation.x = s; legs[3].rotation.x = s;
  legs[1].rotation.x = -s; legs[2].rotation.x = -s;
  body.rotation.set(0, 0, 0);
  body.position.y = Math.abs(Math.cos(c.walkPhase)) * 0.04 * run;
  head.rotation.set(0, 0, 0);

  const t = c.stateTime;
  switch (c.state) {
    case 'windup':                       // crouch, head low: the tell
      body.position.y = -0.12 * clamp01(t / 0.2);
      body.rotation.x = 0.08;
      head.rotation.x = 0.35 * clamp01(t / 0.2);
      break;
    case 'bite':
      head.rotation.x = -0.4;
      body.rotation.x = -0.15;
      break;
    case 'stagger':
      body.rotation.z = Math.sin(t * 30) * 0.15 * (1 - clamp01(t / c.staggerTime));
      break;
    case 'dead':
      body.rotation.z = Math.PI / 2 * clamp01(t / 0.4);
      body.position.y = 0.4 * clamp01(t / 0.4) - 0.1;
      break;
  }
}

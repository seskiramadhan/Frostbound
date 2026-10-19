// Draugr: withered undead Nord in rags with a notched ancient sword and glowing eyes.
import * as THREE from 'three';
import { box, blobShadow, clamp01, lerp } from './model.js';

export function build(cfg) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(cfg.scale);
  root.add(body);
  const skin = cfg.fur, rag = 0x3d3a33, metal = 0x5d5a52;

  const legs = [-0.13, 0.13].map(x => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.85, 0);
    pivot.add(box(0.16, 0.85, 0.18, skin, 0, -0.42, 0));
    pivot.add(box(0.2, 0.14, 0.26, rag, 0, -0.8, 0.03));
    body.add(pivot);
    return pivot;
  });
  const torso = new THREE.Group();          // leans forward: hunched
  torso.position.set(0, 0.9, 0);
  torso.rotation.x = 0.18;
  body.add(torso);
  torso.add(box(0.46, 0.62, 0.26, rag, 0, 0.3, 0));           // ragged tunic
  torso.add(box(0.5, 0.12, 0.3, metal, 0, 0.02, 0));          // belt
  torso.add(box(0.56, 0.16, 0.34, metal, 0, 0.6, 0));         // rusted pauldrons
  const head = new THREE.Group(); head.position.set(0, 0.86, 0.04);
  head.add(box(0.26, 0.28, 0.26, skin, 0, 0, 0));
  head.add(box(0.3, 0.12, 0.3, metal, 0, 0.15, 0));           // helm
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x8fe0ff });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), eyeMat);
    eye.position.set(s * 0.06, 0.02, 0.135);
    head.add(eye);
  }
  torso.add(head);

  const arms = [-0.32, 0.32].map(x => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.56, 0);
    pivot.add(box(0.13, 0.6, 0.14, skin, 0, -0.3, 0));
    torso.add(pivot);
    return pivot;
  });
  const sword = new THREE.Group();
  sword.add(box(0.05, 0.18, 0.05, 0x2a2420, 0, -0.66, 0));
  sword.add(box(0.24, 0.05, 0.07, metal, 0, -0.76, 0));
  sword.add(box(0.09, 0.8, 0.03, 0x707a76, 0, -1.18, 0));
  arms[0].add(sword);

  return { root, body, torso, head, legs, arms, shadow: blobShadow(0.5 * cfg.scale) };
}

export function animate({ body, torso, legs, arms }, c) {
  const walk = Math.min(1, c.speed / c.cfg.walkSpeed * 0.5);
  const s = Math.sin(c.walkPhase * 0.8) * walk * 0.6;
  legs[0].rotation.x = s; legs[1].rotation.x = -s;
  arms[0].rotation.set(-0.5 - s * 0.2, 0, 0);
  arms[1].rotation.set(s * 0.6 - 0.2, 0, 0);
  body.rotation.set(0, 0, 0);
  body.position.y = 0;
  torso.rotation.set(0.18, 0, Math.sin(c.walkPhase * 0.4) * 0.05 * walk);

  const t = c.stateTime;
  switch (c.state) {
    case 'windup':                       // sword raised high: the tell
      arms[0].rotation.x = lerp(-0.5, -2.8, clamp01(t / 0.35));
      torso.rotation.x = 0.05;
      break;
    case 'bite':                         // overhead chop
      arms[0].rotation.x = lerp(-2.8, -0.9, clamp01(t / 0.12));
      torso.rotation.x = 0.35;
      break;
    case 'stagger':
      torso.rotation.x = -0.3 * (1 - clamp01(t / c.staggerTime));
      break;
    case 'dead':
      body.rotation.x = -Math.PI / 2 * clamp01(t / 0.6);
      body.position.y = 0.2 * clamp01(t / 0.6);
      break;
  }
}

// The dragon: arrives from the sky, circles, makes fire passes, lands to fight with
// bite / tail / fire breath, takes off again. Unrelenting Force knocks it down.
// On death it burns and its soul flows into the player ('dragonSoul' event).
// pos is the point under its feet (on the ground) or its body when flying minus aimHeight.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { box, Flash, lerp, clamp01 } from './model.js';
import { mulberry32 } from '../world/noise.js';

const DR = CONFIG.dragon;
const rand = mulberry32(4040);
const range = ([a, b]) => a + rand() * (b - a);
const ease = t => t * t * (3 - 2 * t);

function lambert(color) { return new THREE.MeshLambertMaterial({ color, flatShading: true }); }

function buildModel() {
  const scale = 0x5a2e24, belly = 0x9a7a52, wingC = 0x7a3a2c, horn = 0xd8cdb0;
  const root = new THREE.Group();
  const body = new THREE.Group();   // pitch/bank for flight
  body.position.y = 2.4;
  root.add(body);

  body.add(box(2.0, 1.7, 4.4, scale, 0, 0, 0));                 // torso
  body.add(box(1.6, 0.4, 3.8, belly, 0, -0.85, 0.1));           // belly plates
  for (let k = 0; k < 5; k++) {                                // dorsal spikes
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 4), lambert(horn));
    s.position.set(0, 1.05, 1.6 - k * 0.8); s.rotation.x = -0.4;
    body.add(s);
  }

  // Neck: chain of segments, head at the end
  const neck = [];
  let parent = body, z = 2.0;
  for (let k = 0; k < 3; k++) {
    const seg = new THREE.Group();
    seg.position.set(0, k === 0 ? 0.3 : 0, k === 0 ? z : 1.1);
    seg.rotation.x = k === 0 ? -0.5 : 0.15;
    seg.add(box(1.0 - k * 0.15, 0.9 - k * 0.12, 1.3, scale, 0, 0, 0.55));
    parent.add(seg);
    neck.push(seg);
    parent = seg;
  }
  const head = new THREE.Group();
  head.position.set(0, 0, 1.3);
  head.rotation.x = 0.35;
  head.add(box(0.9, 0.7, 1.3, scale, 0, 0.1, 0.5));                // skull
  head.add(box(0.7, 0.3, 0.9, scale, 0, 0.05, 1.4));               // upper jaw
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.2, 0.6);
  jaw.add(box(0.6, 0.2, 1.3, belly, 0, -0.1, 0.6));
  head.add(jaw);
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.1, 4), lambert(horn));
    h.position.set(s * 0.3, 0.55, -0.1); h.rotation.set(-1.1, 0, s * 0.25);
    head.add(h);
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb030 });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.05), eyeMat);
    e.position.set(s * 0.46, 0.25, 0.85);
    head.add(e);
  }
  parent.add(head);

  // Tail
  const tail = [];
  parent = body; z = -2.2;
  for (let k = 0; k < 4; k++) {
    const seg = new THREE.Group();
    seg.position.set(0, 0, k === 0 ? z : -1.3);
    seg.add(box(0.9 - k * 0.18, 0.8 - k * 0.15, 1.4, scale, 0, 0, -0.65));
    parent.add(seg);
    tail.push(seg);
    parent = seg;
  }

  // Wings: arm bone + membrane, pivot at the shoulder
  const wings = [-1, 1].map(s => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.9, 0.6, 0.9);
    pivot.add(box(4.5, 0.25, 0.3, scale, s * 2.25, 0, 0));
    const g = new THREE.BufferGeometry();
    const tip = s * 4.6;
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, tip, 0, 0, tip * 0.75, 0, -3.2,
      0, 0, 0, tip * 0.75, 0, -3.2, tip * 0.3, 0, -3.6,
      0, 0, 0, tip * 0.3, 0, -3.6, 0, 0, -2.8,
    ], 3));
    g.computeVertexNormals();
    const membrane = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: wingC, side: THREE.DoubleSide }));
    pivot.add(membrane);
    body.add(pivot);
    return pivot;
  });

  const legs = [[-0.8, 1.4], [0.8, 1.4], [-0.8, -1.4], [0.8, -1.4]].map(([x, zz]) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, -0.6, zz);
    pivot.add(box(0.5, 1.8, 0.6, scale, 0, -0.9, 0));
    pivot.add(box(0.6, 0.25, 0.9, horn, 0, -1.75, 0.2));
    body.add(pivot);
    return pivot;
  });

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(4.5, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  return { root, body, neck, head, jaw, tail, wings, legs, shadow };
}

export class Dragon {
  constructor(scene, level, events, fx, entities = null) {
    this.level = level;      // always the valley
    this.events = events;
    this.fx = fx;
    this.entities = entities; // to pick the nearest player (co-op)
    this.kind = 'dragon';
    this.team = 'dragon';
    this.name = DR.name;
    this.maxHp = DR.maxHealth;
    this.hp = this.maxHp;
    this.airRadius = DR.airRadius;
    this.aimHeight = 2.4;
    this.alive = false;      // not in the world until activated
    this.state = 'inactive';
    this.stateTime = 0;

    this.pos = new THREE.Vector3(0, -500, 0);
    this.prevPos = this.pos.clone();
    this.vel = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.mouth = new THREE.Vector3();
    this.facing = 0;
    this.prevFacing = 0;
    this.bank = 0;
    this.angle = 0;          // position on the circling orbit
    this.target = null;

    this.model = buildModel();
    this.flash = new Flash(this.model.root);
    this.dmgMul = 1;
    this.baseColors = [];                // to undo char() when a hunt dragon is reused
    this.model.root.traverse(o => { if (o.material?.color) this.baseColors.push([o.material, o.material.color.getHex()]); });
    this.model.root.visible = this.model.shadow.visible = false;
    scene.add(this.model.root, this.model.shadow);
  }

  get flying() { return ['arrive', 'circle', 'strafe', 'land', 'takeoff', 'falling'].includes(this.state); }
  get radius() { return this.flying ? 0.1 : DR.radius; }   // tiny when flying so it never body-blocks
  get blocking() { return false; }
  get active() { return this.state !== 'inactive' && this.state !== 'dead'; }

  #set(s) { this.state = s; this.stateTime = 0; this.struck = false; this.tick2 = 0; }

  // Fly in from far away toward `target`.
  // Fly in from far away toward `target`. opts (dragon hunts): { name, maxHp, dmgMul }.
  activate(target, opts = {}) {
    this.name = opts.name ?? DR.name;
    this.maxHp = opts.maxHp ?? DR.maxHealth;
    this.dmgMul = opts.dmgMul ?? 1;
    this.#restoreColors();
    this.target = target;
    const a = rand() * Math.PI * 2;
    this.pos.set(target.pos.x + Math.cos(a) * DR.spawnDistance, this.#groundAt(target.pos) + DR.altitude + 10, target.pos.z + Math.sin(a) * DR.spawnDistance);
    this.prevPos.copy(this.pos);
    this.hp = this.maxHp;
    this.alive = true;
    this.passes = 0;
    this.model.root.visible = this.model.shadow.visible = true;
    this.#set('arrive');
  }

  // Loaded from a save: already slain.
  setDead() {
    this.alive = false;
    this.#set('dead');
    this.model.root.visible = this.model.shadow.visible = false;
  }

  #groundAt(p) { return this.level.heightAt(p.x, p.z); }

  // Unrelenting Force while flying: crash down and lie stunned.
  forceDown() {
    if (!this.flying || this.state === 'falling') return;
    this.from.copy(this.pos);
    this.to.set(this.pos.x + Math.sin(this.facing) * 8, 0, this.pos.z + Math.cos(this.facing) * 8);
    this.to.y = this.#groundAt(this.to);
    this.events.emit('dragonDowned', { dragon: this });
    this.#set('falling');
  }

  // Unrelenting Force on the ground: interrupts whatever it was doing.
  knockback() {
    if (['bite', 'tail', 'fire'].includes(this.state)) { this.#set('ground'); this.attackIn = 1.6; }
  }

  onHit({ amount }) {
    this.flash.trigger();
    if (!this.flying) this.groundDamage = (this.groundDamage ?? 0) + amount;
  }

  die() {
    this.alive = false;
    this.from.copy(this.pos);
    this.to.set(this.pos.x, 0, this.pos.z);
    this.to.y = this.#groundAt(this.to);
    this.#set('dying');
  }

  // Steer toward a world point at `speed`, turning gradually. Flying only.
  #flyToward(tx, ty, tz, speed, dt, turn = 1.4) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const want = Math.atan2(dx, dz);
    let diff = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing));
    const step = Math.max(-turn * dt, Math.min(turn * dt, diff));
    this.facing += step;
    this.bank = lerp(this.bank, -step / dt * 0.5, Math.min(1, dt * 3));
    this.vel.set(Math.sin(this.facing) * speed, (ty - this.pos.y) * 0.8, Math.cos(this.facing) * speed);
    this.pos.addScaledVector(this.vel, dt);
    const floor = this.#groundAt(this.pos) + 4;
    if (this.pos.y < floor) this.pos.y = floor;
  }

  tick(dt) {
    this.prevPos.copy(this.pos);
    this.prevFacing = this.facing;
    this.flash.tick(dt);
    if (this.state === 'inactive') return;
    this.stateTime += dt;
    if (this.entities && (this.retargetIn = (this.retargetIn ?? 0) - dt) <= 0) { this.retargetIn = 1.5; this.#retarget(); }
    const t = this.target, tp = t?.pos;
    const here = t && t.alive && t.level === this.level;   // can it see the player?

    switch (this.state) {
      case 'arrive': {
        const center = here ? tp : this.pos;
        this.#flyToward(center.x, this.#groundAt(center) + DR.altitude, center.z, DR.flySpeed * 1.2, dt);
        if (Math.hypot(center.x - this.pos.x, center.z - this.pos.z) < DR.circleRadius * 1.3) {
          this.angle = Math.atan2(this.pos.z - center.z, this.pos.x - center.x);
          this.events.emit('dragonRoar', { dragon: this });
          this.#set('circle');
          this.circleFor = range(DR.circleTime);
        }
        break;
      }
      case 'circle': {
        const c = here ? tp : this.pos;
        this.angle += DR.flySpeed / DR.circleRadius * dt;
        const cx = c.x + Math.cos(this.angle) * DR.circleRadius, cz = c.z + Math.sin(this.angle) * DR.circleRadius;
        this.#flyToward(cx, this.#groundAt(c) + DR.altitude, cz, DR.flySpeed, dt, 2);
        if (here && this.stateTime > this.circleFor) {
          if (this.passes >= DR.passesBeforeLanding) this.#startLanding(tp);
          else { this.#set('strafe'); this.passed = false; }
        }
        break;
      }
      case 'strafe': {
        if (!here) { this.#set('circle'); this.circleFor = 3; break; }
        const d = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
        const ahead = Math.sin(this.facing) * (tp.x - this.pos.x) + Math.cos(this.facing) * (tp.z - this.pos.z);
        if (!this.passed) this.#flyToward(tp.x, this.#groundAt(tp) + DR.strafeAltitude, tp.z, DR.strafeSpeed, dt, 1.2);
        else this.#flyToward(this.pos.x + Math.sin(this.facing) * 50, this.#groundAt(this.pos) + DR.altitude, this.pos.z + Math.cos(this.facing) * 50, DR.strafeSpeed, dt, 0.3);
        if (ahead < 0) this.passed = true;
        // Breathe fire on the ground ahead while closing in
        if (!this.passed && d < 26 && ahead > 0) {
          if ((this.tick2 = (this.tick2 ?? 0) - dt) <= 0) {
            this.tick2 = DR.airFire.every;
            const gx = this.pos.x + Math.sin(this.facing) * DR.airFire.ahead, gz = this.pos.z + Math.cos(this.facing) * DR.airFire.ahead;
            const gy = this.level.heightAt(gx, gz);
            this.events.emit('areaAttack', { attacker: this, x: gx, y: gy, z: gz, radius: DR.airFire.radius, damage: DR.airFire.damage * this.dmgMul });
            this.fx.burn({ x: gx, y: gy, z: gz }, DR.airFire.radius, 8);
            this.breathing = 0.25;
          }
        }
        if (this.passed && d > 35) {
          this.passes++;
          this.#set('circle');
          this.angle = Math.atan2(this.pos.z - tp.z, this.pos.x - tp.x);
          this.circleFor = range(DR.circleTime);
        }
        break;
      }
      case 'land': case 'takeoff': case 'falling': {
        const dur = this.state === 'land' ? DR.landTime : this.state === 'takeoff' ? DR.takeoffTime : 0.9;
        const k = clamp01(this.stateTime / dur), e = this.state === 'falling' ? k * k : ease(k);
        this.pos.lerpVectors(this.from, this.to, e);
        if (this.state === 'land') this.pos.y += Math.sin(k * Math.PI) * 3;
        if (here && this.state !== 'falling') this.facing = this.#turn(Math.atan2(tp.x - this.pos.x, tp.z - this.pos.z), dt * 2);
        this.bank = lerp(this.bank, 0, Math.min(1, dt * 3));
        if (k >= 1) {
          if (this.state === 'takeoff') { this.#set('circle'); this.passes = 0; this.circleFor = range(DR.circleTime); }
          else if (this.state === 'falling') { this.events.emit('dragonLanded', { dragon: this }); this.#set('stunned'); }
          else { this.#set('ground'); this.groundFor = range(DR.groundTime); this.groundDamage = 0; this.attackIn = 1; }
        }
        break;
      }
      case 'stunned':
        this.pos.y = this.#groundAt(this.pos);
        if (this.stateTime > DR.crashStagger) { this.#set('ground'); this.groundFor = range(DR.groundTime); this.groundDamage = 0; this.attackIn = 0.8; }
        break;
      case 'ground':
        this.#groundTick(dt, here);
        break;
      case 'bite': case 'tail': case 'fire':
        this.#attackTick(dt);
        break;
      case 'dying': {
        const k = clamp01(this.stateTime / 1.0);
        this.pos.lerpVectors(this.from, this.to, k * k);
        if (rand() < 0.5) this.fx.burn({ x: this.pos.x, y: this.pos.y + 1, z: this.pos.z }, 3, 3);
        if (this.stateTime > DR.deathTime) {
          this.events.emit('dragonSoul', { dragon: this });
          this.#set('soul');
        }
        break;
      }
      case 'soul':
        if (t && rand() < 0.6) this.fx.soul({ x: this.pos.x, y: this.pos.y + 2, z: this.pos.z }, t.pos, 3);
        if (this.stateTime > DR.soulTime) { this.#set('dead'); this.events.emit('dragonDead', { dragon: this }); }
        break;
    }
    if (this.breathing > 0) this.breathing -= dt;
  }

  // Go after the nearest living player in the valley (keeps the current one if none).
  #retarget() {
    let best = null, bestD = Infinity;
    for (const e of this.entities) {
      if (e.team !== 'player' || !e.alive || e.level !== this.level) continue;
      const d = (e.pos.x - this.pos.x) ** 2 + (e.pos.z - this.pos.z) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) this.target = best;
  }

  #turn(want, k) {
    const diff = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing));
    return this.facing + Math.max(-k, Math.min(k, diff));
  }

  #startLanding(tp) {
    // Land ~11 m from the player on this side
    const dx = this.pos.x - tp.x, dz = this.pos.z - tp.z, d = Math.hypot(dx, dz) || 1;
    this.from.copy(this.pos);
    this.to.set(tp.x + dx / d * 11, 0, tp.z + dz / d * 11);
    this.level.clamp(this.to);
    this.to.y = this.#groundAt(this.to);
    this.#set('land');
  }

  #groundTick(dt, here) {
    this.pos.y = this.#groundAt(this.pos);
    if (!here) { this.#takeoff(); return; }
    const tp = this.target.pos;
    const dx = tp.x - this.pos.x, dz = tp.z - this.pos.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const off = Math.abs(Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing)));
    this.groundFor -= dt;
    if (this.groundFor <= 0 || this.groundDamage > DR.takeoffAfterDamage * this.maxHp) { this.#takeoff(); return; }

    if ((this.attackIn -= dt) <= 0) {
      if (off > 2.2 && d < DR.tail.reach) { this.#set('tail'); return; }
      if (off < 0.5 && d < DR.bite.reach + DR.radius) { this.#set('bite'); return; }
      if (off < 0.5 && d < DR.fire.range) { this.#set('fire'); return; }
    }
    this.facing = this.#turn(want, DR.turnSpeed * dt);
    if (d > DR.bite.reach + DR.radius - 0.5 && off < 0.8) {      // walk in
      this.pos.x += Math.sin(this.facing) * DR.walkSpeed * dt;
      this.pos.z += Math.cos(this.facing) * DR.walkSpeed * dt;
      this.level.clamp(this.pos);
      this.walk = (this.walk ?? 0) + dt * 3;
    }
  }

  #attackTick(dt) {
    const s = this.state, T = s === 'bite' ? DR.bite : s === 'tail' ? DR.tail : DR.fire;
    const tStrike = T.windup;
    if (s === 'fire') {
      if (this.stateTime > tStrike && this.stateTime < tStrike + T.time) {
        if ((this.tick2 -= dt) <= 0) {
          this.tick2 = T.every;
          this.events.emit('attack', { attacker: this, damage: T.damage * this.dmgMul, reach: T.range, arc: T.arc });
        }
        this.breathing = 0.1;
        // Track the player slowly while breathing
        if (this.target?.alive) this.facing = this.#turn(Math.atan2(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z), dt * 0.6);
      }
    } else if (!this.struck && this.stateTime >= tStrike) {
      this.struck = true;
      if (s === 'bite') this.events.emit('attack', { attacker: this, damage: T.damage * this.dmgMul, reach: T.reach, arc: T.arc });
      else {
        const bx = this.pos.x - Math.sin(this.facing) * 4, bz = this.pos.z - Math.cos(this.facing) * 4;
        this.events.emit('areaAttack', { attacker: this, x: bx, y: this.pos.y, z: bz, radius: T.reach - 2, damage: T.damage * this.dmgMul });
      }
    }
    if (this.stateTime >= tStrike + T.time) { this.#set('ground'); this.attackIn = range(DR.attackGap); }
  }

  #takeoff() {
    this.from.copy(this.pos);
    this.to.set(this.pos.x - Math.sin(this.facing) * 10, this.#groundAt(this.pos) + DR.altitude, this.pos.z - Math.cos(this.facing) * 10);
    this.#set('takeoff');
  }

  // Mouth position in world space (fire comes out here).
  mouthPos(out) {
    this.model.head.updateWorldMatrix(true, false);
    return out.set(0, 0, 1.9).applyMatrix4(this.model.head.matrixWorld);
  }

  render(alpha) {
    const m = this.model;
    if (!m.root.visible) return;
    m.root.position.lerpVectors(this.prevPos, this.pos, alpha);
    m.root.rotation.y = this.prevFacing + Math.atan2(Math.sin(this.facing - this.prevFacing), Math.cos(this.facing - this.prevFacing)) * alpha;
    const time = performance.now() / 1000, s = this.state, st = this.stateTime;
    const fly = this.flying;

    // Wings: big flaps in the air, folded on the ground
    const flap = fly ? Math.sin(time * (s === 'strafe' ? 5 : 3.2)) * 0.55 : -0.9 + Math.sin(time * 1.2) * 0.05;
    m.wings[0].rotation.set(0, 0, -flap - (fly ? 0 : 0.3));
    m.wings[1].rotation.set(0, 0, flap + (fly ? 0 : 0.3));
    m.body.rotation.set(fly ? -this.vel.y * 0.03 : 0, 0, fly ? this.bank : 0);
    for (const l of m.legs) l.rotation.x = fly ? 0.9 : Math.sin((this.walk ?? 0) + l.position.z) * 0.25;
    for (let k = 0; k < m.tail.length; k++) m.tail[k].rotation.y = Math.sin(time * 1.6 - k * 0.7) * 0.18;
    m.neck[0].rotation.x = -0.5; m.head.rotation.x = 0.35; m.jaw.rotation.x = 0;
    m.body.position.y = 2.4;

    if (s === 'bite') {
      const k = clamp01(st / DR.bite.windup);
      m.neck[0].rotation.x = st < DR.bite.windup ? lerp(-0.5, -0.9, k) : 0.1;
      m.jaw.rotation.x = st < DR.bite.windup ? 0.6 * k : 0;
    } else if (s === 'fire') {
      m.neck[0].rotation.x = st < DR.fire.windup ? lerp(-0.5, -0.95, clamp01(st / DR.fire.windup)) : -0.25;
      m.jaw.rotation.x = st > DR.fire.windup * 0.6 ? 0.7 : 0;
    } else if (s === 'tail') {
      const k = clamp01(st / (DR.tail.windup + DR.tail.time));
      for (let i = 0; i < m.tail.length; i++) m.tail[i].rotation.y = Math.sin(k * Math.PI * 2) * 0.6;
      m.root.rotation.y += Math.sin(k * Math.PI) * 0.5;
    } else if (s === 'stunned') {
      m.neck[0].rotation.x = 0.4; m.head.rotation.x = 0.6;
      m.body.position.y = 1.9;
    } else if (s === 'dying' || s === 'soul' || s === 'dead') {
      const k = clamp01(st / 1.2);
      m.body.rotation.z = (s === 'dying' ? k : 1) * 0.9;
      m.body.position.y = lerp(2.4, 1.3, s === 'dying' ? k : 1);
      m.neck[0].rotation.x = 0.7; m.head.rotation.x = 0.6;
    }
    if (this.breathing > 0 && this.alive) {
      const mp = this.mouthPos(this.mouth);
      const dir = new THREE.Vector3(0, -0.15, 1).applyQuaternion(m.head.getWorldQuaternion(new THREE.Quaternion())).normalize();
      if (fly) dir.y = Math.min(dir.y, -0.55);
      this.fx.fire(mp, dir.normalize(), fly ? 9 : DR.fire.range, 6);
    }

    const gy = this.level.heightAt(m.root.position.x, m.root.position.z);
    m.shadow.position.set(m.root.position.x, gy + 0.08, m.root.position.z);
    m.shadow.material.opacity = 0.22 * clamp01(1 - (m.root.position.y - gy) / 40);
  }

  // Burnt look after death.
  char() {
    this.model.root.traverse(o => { if (o.material?.color) o.material.color.multiplyScalar(0.35); });
    this.charred = true;
  }

  #restoreColors() {
    if (!this.charred) return;
    for (const [m, hex] of this.baseColors) m.color.setHex(hex);
    this.charred = false;
  }
}

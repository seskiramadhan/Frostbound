// Co-op messages (JSON). Every message is { k: kind, ... }.
//
// guest -> host   hello  { v, name, look }         first message after connecting (v = protocol version)
//                 pose   { p: Pose }               own movement, sendRate per second
//                 look   { look }                  equipment changed
//                 hit    { id, d, s }              I hit enemy `id` for d damage (source s); host validates
//                 shout  { id, x, y, z, f }        I shouted (push / slowTime / fireBreath) from here; host applies it
// host -> guest   welcome { id, players: [{ id, name, look }] }   everyone already here (incl. host)
//                 reject  { msg }                  room full / different game version
//                 hurt    { d, b, x, z }           an enemy hit you: raw damage, blocked?, from where
//                 world   { list: [Enemy], slow }  every enemy's state, sendRate per second
//                 ev      { n, id? , killer? }     one-off world events (death, dragonRoar, dragonDowned, dragonDead)
//                 joined  { id, name, look }
//                 left    { id }
//                 look    { id, look }
//                 poses   { list: [[id, Pose], ...] }   everyone's latest pose, sendRate per second
//
// Pose: [level, x, y, z, facing, state, stateTime, speed, flags, drawTime]
//   level: 'valley' | dungeon key;  flags: 1 = grounded, 2 = bow mode
// Enemy: [id, level, x, y, z, facing, state, stateTime, hp, flags, (dragon: vx, vy, vz, bank, breathing)]
//   flags: 1 = alive, 2 = visible
import * as THREE from 'three';

export const VERSION = 2;

export const MSG = {
  HELLO: 'hello', POSE: 'pose', LOOK: 'look', HIT: 'hit', SHOUT: 'shout',
  WELCOME: 'welcome', REJECT: 'reject', JOINED: 'joined', LEFT: 'left', POSES: 'poses',
  HURT: 'hurt', WORLD: 'world', EVENT: 'ev',
};

const r2 = v => Math.round(v * 100) / 100;

export function encodePose(player) {
  const p = player.pos;
  const flags = (player.grounded ? 1 : 0) | (player.bowMode ? 2 : 0);
  return [player.level.key ?? 'valley', r2(p.x), r2(p.y), r2(p.z), r2(player.facing), player.state,
    r2(player.stateTime), r2(player.speed), flags, r2(player.drawTime ?? 0)];
}

export function decodePose(a) {
  return {
    level: a[0], pos: new THREE.Vector3(a[1], a[2], a[3]), facing: a[4], state: a[5],
    stateTime: a[6], speed: a[7], grounded: !!(a[8] & 1), bowMode: !!(a[8] & 2), drawTime: a[9],
  };
}

export function encodeLook(inventory) {
  return { w: inventory.equipped.weapon, a: inventory.equipped.armor };
}

export function encodeEnemy(e) {
  const p = e.pos;
  const flags = (e.alive ? 1 : 0) | (e.model.root.visible ? 2 : 0);
  const a = [e.id, e.level.key ?? 'valley', r2(p.x), r2(p.y), r2(p.z), r2(e.facing), e.state, r2(e.stateTime), Math.round(e.hp), flags];
  if (e.kind === 'dragon') a.push(r2(e.vel.x), r2(e.vel.y), r2(e.vel.z), r2(e.bank), e.breathing > 0 ? 1 : 0);
  return a;
}

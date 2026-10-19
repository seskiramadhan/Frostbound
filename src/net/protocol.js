// Co-op messages (JSON). Every message is { k: kind, ... }.
//
// guest -> host   hello  { name, look }            first message after connecting
//                 pose   { p: Pose }               own movement, sendRate per second
//                 look   { look }                  equipment changed
// host -> guest   welcome { id, players: [{ id, name, look }] }   everyone already here (incl. host)
//                 full    {}                       room has maxPlayers already
//                 joined  { id, name, look }
//                 left    { id }
//                 look    { id, look }
//                 poses   { list: [[id, Pose], ...] }   everyone's latest pose, sendRate per second
//
// Pose: [level, x, y, z, facing, state, stateTime, speed, flags, drawTime]
//   level: 'valley' | dungeon key;  flags: 1 = grounded, 2 = bow mode
import * as THREE from 'three';

export const MSG = {
  HELLO: 'hello', POSE: 'pose', LOOK: 'look',
  WELCOME: 'welcome', FULL: 'full', JOINED: 'joined', LEFT: 'left', POSES: 'poses',
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

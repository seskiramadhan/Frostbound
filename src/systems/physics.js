// Shared movement for anything that walks the valley: slope limit, tree/rock
// colliders, world edge, gravity and body-vs-body separation.
// A body has { pos, vel, vy, grounded, radius, alive }.
// A level (valley terrain or a dungeon) has heightAt(x, z), clamp(pos), colliders,
// and optionally blocked(x, z, r) for solid walls.

export function moveBody(body, dx, dz, level, maxClimb) {
  moveAxis(body, dx, 0, level, maxClimb);
  moveAxis(body, 0, dz, level, maxClimb);
}

// Reject steps into walls, or that climb steeper than the slope limit (or into a slope mid-air).
function moveAxis(body, dx, dz, level, maxClimb) {
  if (dx === 0 && dz === 0) return;
  const p = body.pos;
  const nx = p.x + dx, nz = p.z + dz;
  const hNew = level.heightAt(nx, nz);
  const blocked = level.blocked?.(nx, nz, body.radius) || (body.grounded
    ? hNew - level.heightAt(p.x, p.z) > maxClimb * Math.hypot(dx, dz)
    : hNew > p.y + 0.3);
  if (blocked) {
    if (dx) body.vel.x = 0; else body.vel.z = 0;
    return;
  }
  p.x = nx; p.z = nz;
}

export function pushOutOfColliders(pos, r, colliders) {
  for (const c of colliders) {
    const dx = pos.x - c.x, dz = pos.z - c.z, min = c.r + r;
    if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
    const d = Math.hypot(dx, dz);
    if (d >= min || d === 0) continue;
    pos.x = c.x + dx / d * min;
    pos.z = c.z + dz / d * min;
  }
}

// Grounded bodies stick to the terrain; airborne ones fall until they land.
export function settleOnGround(body, dt, level, gravity) {
  const p = body.pos;
  const ground = level.heightAt(p.x, p.z);
  if (body.grounded) { p.y = ground; return; }
  body.vy -= gravity * dt;
  p.y += body.vy * dt;
  if (p.y <= ground) { p.y = ground; body.vy = 0; body.grounded = true; }
}

// Push overlapping living bodies apart, half each.
export function separateBodies(bodies) {
  const list = [];
  for (const b of bodies) if (b.alive) list.push(b);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i].pos, b = list[j].pos, min = list[i].radius + list[j].radius;
      const dx = b.x - a.x, dz = b.z - a.z;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d = Math.hypot(dx, dz);
      if (d >= min) continue;
      const nx = d > 0 ? dx / d : 1, nz = d > 0 ? dz / d : 0;
      const push = (min - d) / 2;
      a.x -= nx * push; a.z -= nz * push;
      b.x += nx * push; b.z += nz * push;
    }
  }
}

// Turn angle `from` toward `to` by at most fraction k (0..1), shortest way round.
export function turnToward(from, to, k) {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * Math.min(1, k);
}

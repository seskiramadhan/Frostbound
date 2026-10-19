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

// Colliders are circles { x, z, r } or axis-aligned boxes { x, z, hw, hd } (buildings).
export function pushOutOfColliders(pos, r, colliders) {
  for (const c of colliders) {
    if (c.hw !== undefined) { pushOutOfBox(pos, r, c); continue; }
    const dx = pos.x - c.x, dz = pos.z - c.z, min = c.r + r;
    if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
    const d = Math.hypot(dx, dz);
    if (d >= min || d === 0) continue;
    pos.x = c.x + dx / d * min;
    pos.z = c.z + dz / d * min;
  }
}

function pushOutOfBox(pos, r, c) {
  const dx = pos.x - c.x, dz = pos.z - c.z;
  if (Math.abs(dx) > c.hw + r || Math.abs(dz) > c.hd + r) return;
  const cx = Math.max(-c.hw, Math.min(c.hw, dx)), cz = Math.max(-c.hd, Math.min(c.hd, dz));
  const ox = dx - cx, oz = dz - cz, d = Math.hypot(ox, oz);
  if (d > 0) {                      // outside the box: push away from the nearest point
    if (d >= r) return;
    pos.x = c.x + cx + ox / d * r;
    pos.z = c.z + cz + oz / d * r;
  } else if (c.hw - Math.abs(dx) < c.hd - Math.abs(dz)) {   // inside: leave by the closest side
    pos.x = c.x + Math.sign(dx || 1) * (c.hw + r);
  } else {
    pos.z = c.z + Math.sign(dz || 1) * (c.hd + r);
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
      if (Math.abs(a.y - b.y) > 2.5) continue;   // e.g. a dragon flying overhead
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

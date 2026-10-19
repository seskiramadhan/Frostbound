// Guest side: enemies are run by the host. This keeps the guest's copies in step with
// the host's snapshots, drawn slightly in the past and interpolated for smoothness.
import { CONFIG } from '../config.js';
import { lerpAngle } from '../entities/model.js';

const N = CONFIG.net;

export class Mirror {
  constructor(entities, levels) {
    this.entities = entities;
    this.levels = levels;
    this.buf = new Map();   // id -> [{ t, a }]
    this.slow = false;
  }

  push(list, slow) {
    const t = performance.now() / 1000;
    for (const a of list) {
      let b = this.buf.get(a[0]);
      if (!b) this.buf.set(a[0], b = []);
      b.push({ t, a });
      if (b.length > 20) b.shift();
    }
    this.slow = !!slow;
  }

  clear() { this.buf.clear(); this.slow = false; }

  apply(dt) {
    const now = performance.now() / 1000 - N.interpDelay;
    for (const [id, b] of this.buf) {
      const e = this.entities.get(id);
      if (!e || !b.length) continue;
      let lo = b[0], hi = b[0];
      for (let i = b.length - 1; i >= 0; i--) {
        if (b[i].t <= now) { lo = b[i]; hi = b[Math.min(i + 1, b.length - 1)]; break; }
      }
      const A = lo.a, B = hi.a;
      const span = hi.t - lo.t;
      const k = span > 0 ? Math.min(1, Math.max(0, (now - lo.t) / span)) : 1;
      const lv = this.levels[A[1]];
      if (lv) e.level = lv;

      const ox = e.pos.x, oz = e.pos.z;
      e.pos.set(A[2] + (B[2] - A[2]) * k, A[3] + (B[3] - A[3]) * k, A[4] + (B[4] - A[4]) * k);
      e.prevPos.copy(e.pos);
      e.facing = e.prevFacing = lerpAngle(A[5], B[5], k);
      if (e.state !== A[6]) e.state = A[6];
      e.stateTime = A[7] + Math.max(0, now - lo.t);
      e.staggerTime ??= CONFIG.combat.stagger.enemy;
      e.hp = A[8];
      if (A[10]) e.maxHp = A[10];          // the host's scaled stats and level (for health bars)
      if (A[11]) e.lvl = A[11];
      e.alive = !!(A[9] & 1);
      const vis = !!(A[9] & 2);
      e.model.root.visible = e.model.shadow.visible = vis;
      const moved = Math.hypot(e.pos.x - ox, e.pos.z - oz);
      e.speed = dt > 0 && moved < 5 ? moved / dt : 0;
      e.walkPhase = (e.walkPhase ?? 0) + e.speed * dt * 2.6;
      if (e.kind === 'dragon' && A.length > 12) {
        e.vel.set(A[12], A[13], A[14]);
        e.bank = A[15];
        e.breathing = A[16] ? 0.1 : 0;
      }
    }
  }
}

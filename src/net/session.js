// A co-op session: host or join a room by code. Star topology: guests talk only to the host.
//   N1: everyone sees everyone move (host relays poses).
//   N2: the host runs every enemy. Guests mirror them, send their hits/shouts for the host to
//       validate and apply, and receive damage ('hurt') that their own game applies.
// Emits on the event bus: 'netPlayerJoined' { name }, 'netPlayerLeft' { name },
// 'netJoined' {} (guest got in), 'netEnded' { reason }, plus re-emitted world events on guests.
import { CONFIG } from '../config.js';
import { createTransport } from './transport.js';
import { MSG, VERSION, encodePose, decodePose, encodeLook, encodeEnemy } from './protocol.js';
import { RemotePlayer } from '../entities/remotePlayer.js';
import { RemoteBody } from './remoteBody.js';
import { Mirror } from './mirror.js';

const N = CONFIG.net;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no I/L/O/0/1 to avoid typos
const WORLD_EVENTS = ['dragonRoar', 'dragonDowned', 'dragonDead', 'huntStart', 'bossPhase2'];

export function randomCode() {
  let s = '';
  for (let i = 0; i < N.codeLength; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export class Session {
  // game: { events, scene, player, inventory, entities, combat, shouts, levels, enemies, onHurt }
  constructor(game) {
    this.game = game;
    this.events = game.events;
    this.role = 'off';        // off | connecting | host | guest
    this.code = null;
    this.myId = null;
    this.hostId = null;
    this.players = new Map(); // peerId -> { name, look, pose, remote: RemotePlayer, body?: RemoteBody }
    this.sendTimer = 0;
    this.lastLook = '';
    this.transport = null;
    this.mirror = new Mirror(game.entities, game.levels);

    // Host: tell guests about world events that matter to them
    const ev = this.events;
    ev.on('death', ({ target, killer }) => {
      if (this.role !== 'host' || target.team === 'player') return;
      this.transport.broadcast({ k: MSG.EVENT, n: 'death', id: target.id, killer: this.#idOf(killer) });
    });
    for (const n of WORLD_EVENTS) {
      ev.on(n, e => { if (this.role === 'host' && !e?.net) this.transport.broadcast({ k: MSG.EVENT, n, id: e?.dragon?.id, data: e?.data }); });
    }
  }

  get active() { return this.role === 'host' || this.role === 'guest'; }
  get count() { return this.players.size + 1; }

  async host(name) {
    this.#reset();
    this.role = 'connecting';
    this.name = name;
    for (let tries = 0; tries < 3; tries++) {
      this.code = randomCode();
      this.transport = this.#newTransport();
      try {
        await this.transport.host(N.roomPrefix + this.code);
        this.role = 'host';
        this.myId = N.roomPrefix + this.code;
        this.#applyRole();
        return this.code;
      } catch (e) {
        this.transport.close();
        if (e.type !== 'unavailable-id' || tries === 2) { this.role = 'off'; throw e; }
      }
    }
  }

  async join(code, name) {
    this.#reset();
    this.role = 'connecting';
    this.name = name;
    this.code = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.transport = this.#newTransport();
    try {
      this.hostId = await this.transport.join(N.roomPrefix + this.code);
    } catch (e) {
      this.role = 'off';
      throw e;
    }
    this.transport.send(this.hostId, { k: MSG.HELLO, v: VERSION, name, look: encodeLook(this.game.inventory) });
    // Wait for the host's answer
    return new Promise((resolve, reject) => {
      this.pendingJoin = { resolve, reject };
      setTimeout(() => { if (this.pendingJoin) { this.pendingJoin = null; this.leave(); reject(new Error('The host did not answer')); } }, 8000);
    });
  }

  leave(reason) {
    const was = this.role;
    this.transport?.close();
    this.#reset();
    if (was === 'host' || was === 'guest') this.events.emit('netEnded', { reason: reason ?? 'You left the room', wasGuest: was === 'guest' });
  }

  #reset() {
    for (const id of [...this.players.keys()]) this.#dropPlayer(id, true);
    this.role = 'off';
    this.transport = null;
    this.pendingJoin = null;
    this.mirror.clear();
    this.#applyRole();
  }

  // Wire the game for the current role: guests forward hits/shouts, hosts scale enemies.
  #applyRole() {
    const { combat, shouts } = this.game;
    const guest = this.role === 'guest';
    combat.forwardHit = guest ? (target, d, s) => this.transport?.send(this.hostId, { k: MSG.HIT, id: target.id, d, s }) : null;
    shouts.forward = guest ? id => {
      const p = this.game.player;   // aim with where we are right now, not the last pose
      this.transport?.send(this.hostId, { k: MSG.SHOUT, id, x: p.pos.x, y: p.pos.y, z: p.pos.z, f: p.facing });
    } : null;
    combat.enemyDamageScale = this.role === 'host' ? 1 / (1 + N.enemyHealthPerPlayer * (this.count - 1)) : 1;
  }

  #idOf(entity) {
    if (!entity) return null;
    if (entity === this.game.player) return this.myId;
    for (const [id, p] of this.players) if (p.body === entity) return id;
    return null;
  }

  #newTransport() {
    const t = createTransport();
    t.onMessage = (from, msg) => this.#onMessage(from, msg);
    t.onPeerLeave = id => {
      if (this.role === 'guest' && id === this.hostId) this.leave('The host left the room');
      else this.#dropPlayer(id);
    };
    t.onError = e => { if (this.role === 'guest') this.leave(e.message); };
    return t;
  }

  #addPlayer(id, name, look) {
    if (this.players.has(id)) return;
    const p = { name, look, remote: new RemotePlayer(this.game.scene, name, look) };
    if (this.role === 'host') {
      p.body = this.game.entities.add(new RemoteBody((d, b, from) =>
        this.transport.send(id, { k: MSG.HURT, d: Math.round(d * 10) / 10, b, x: from.x, z: from.z })));
    }
    this.players.set(id, p);
    this.#applyRole();
    this.events.emit('netPlayerJoined', { name });
  }

  #dropPlayer(id, quiet = false) {
    const p = this.players.get(id);
    if (!p) return;
    p.remote.dispose();
    if (p.body) { p.body.alive = false; this.game.entities.remove(p.body); }
    this.players.delete(id);
    this.#applyRole();
    if (quiet) return;
    this.events.emit('netPlayerLeft', { name: p.name });
    if (this.role === 'host') this.transport.broadcast({ k: MSG.LEFT, id });
  }

  #onMessage(from, m) {
    if (!m || typeof m.k !== 'string') return;
    if (this.role === 'host') this.#hostMessage(from, m);
    else if (this.role === 'connecting' || this.role === 'guest') this.#guestMessage(m);
  }

  #hostMessage(from, m) {
    const g = this.game;
    switch (m.k) {
      case MSG.HELLO: {
        let why = null;
        if (m.v !== VERSION) why = 'Your game version is different from the host\'s. Reload the page and try again';
        else if (this.count >= N.maxPlayers) why = `The room is full (${N.maxPlayers} players)`;
        if (why) { this.transport.send(from, { k: MSG.REJECT, msg: why }); setTimeout(() => this.transport?.kick(from), 300); return; }
        const name = String(m.name ?? 'Traveller').slice(0, 16);
        const everyone = [{ id: this.myId, name: this.name, look: encodeLook(g.inventory) },
          ...[...this.players].map(([id, p]) => ({ id, name: p.name, look: p.look }))];
        this.transport.send(from, { k: MSG.WELCOME, id: from, players: everyone });
        this.transport.broadcast({ k: MSG.JOINED, id: from, name, look: m.look }, from);
        this.#addPlayer(from, name, m.look);
        break;
      }
      case MSG.POSE: {
        const p = this.players.get(from);
        if (!p || !Array.isArray(m.p)) break;
        p.pose = m.p;
        const pose = decodePose(m.p);
        p.remote.push(pose);
        p.body?.update(pose, g.levels);
        break;
      }
      case MSG.LOOK: {
        const p = this.players.get(from);
        if (p) { p.look = m.look; p.remote.setLook(m.look); this.transport.broadcast({ k: MSG.LOOK, id: from, look: m.look }, from); }
        break;
      }
      case MSG.HIT: {
        // Validate: the target exists, is alive, is an enemy on the guest's level, and is in reach
        const body = this.players.get(from)?.body, t = g.entities.get(m.id);
        if (!body?.alive || !t?.alive || t.team === 'player' || t.level !== body.level) break;
        const d = Number(m.d), src = m.s === 'arrow' ? 'arrow' : m.s === 'shout' ? 'shout' : 'melee';
        const reach = src === 'melee' ? 7 : 90;
        if (!(d > 0 && d < 300)) break;
        if (Math.hypot(t.pos.x - body.pos.x, t.pos.z - body.pos.z) > reach + t.radius + (t.flying ? t.airRadius : 0)) break;
        g.combat.applyHit(body, t, d, src);
        break;
      }
      case MSG.SHOUT: {
        const body = this.players.get(from)?.body;
        if (!body?.alive || !CONFIG.shouts[m.id]) break;
        const x = Number(m.x), y = Number(m.y), z = Number(m.z), f = Number(m.f);
        if ([x, y, z, f].every(Number.isFinite) && Math.hypot(x - body.pos.x, z - body.pos.z) < 6) { body.pos.set(x, y, z); body.facing = f; }
        g.shouts.apply(body, m.id);
        break;
      }
    }
  }

  #guestMessage(m) {
    const g = this.game;
    switch (m.k) {
      case MSG.WELCOME:
        this.myId = m.id;
        this.role = 'guest';
        this.#applyRole();
        for (const p of m.players ?? []) this.#addPlayer(p.id, p.name, p.look);
        this.events.emit('netJoined', {});
        this.pendingJoin?.resolve(this.code);
        this.pendingJoin = null;
        break;
      case MSG.REJECT:
        this.pendingJoin?.reject(new Error(m.msg ?? 'The host turned you away'));
        this.pendingJoin = null;
        this.transport.close();
        this.#reset();
        break;
      case MSG.JOINED:
        if (m.id !== this.myId) this.#addPlayer(m.id, m.name, m.look);
        break;
      case MSG.LEFT:
        this.#dropPlayer(m.id);
        break;
      case MSG.LOOK:
        this.players.get(m.id)?.remote.setLook(m.look);
        break;
      case MSG.POSES:
        for (const [id, pose] of m.list ?? []) {
          if (id !== this.myId && Array.isArray(pose)) this.players.get(id)?.remote.push(decodePose(pose));
        }
        break;
      case MSG.WORLD:
        if (Array.isArray(m.list)) this.mirror.push(m.list, m.slow);
        break;
      case MSG.HURT:
        g.onHurt(Number(m.d) || 0, !!m.b, { x: Number(m.x) || 0, z: Number(m.z) || 0 });
        break;
      case MSG.EVENT:
        if (m.n === 'death') {
          const target = g.entities.get(m.id);
          if (target) this.events.emit('death', { target, killer: m.killer === this.myId ? g.player : null, net: true });
        } else if (WORLD_EVENTS.includes(m.n)) {
          this.events.emit(m.n, { dragon: g.entities.get(m.id) ?? g.dragon, data: m.data, net: true });
        }
        break;
    }
  }

  // Called every frame: send our pose (and, as host, the world) at sendRate; look on change.
  update(dt) {
    if (this.role === 'guest') this.mirror.apply(dt);
    if (!this.active) return;
    const g = this.game;
    const look = encodeLook(g.inventory), lookKey = `${look.w}|${look.a}`;
    if (lookKey !== this.lastLook) {
      this.lastLook = lookKey;
      if (this.role === 'guest') this.transport.send(this.hostId, { k: MSG.LOOK, look });
      else this.transport.broadcast({ k: MSG.LOOK, id: this.myId, look });
    }
    if ((this.sendTimer += dt) < 1 / N.sendRate) return;
    this.sendTimer = 0;
    const mine = encodePose(g.player);
    if (this.role === 'guest') {
      this.transport.send(this.hostId, { k: MSG.POSE, p: mine });
    } else {
      const list = [[this.myId, mine]];
      for (const [id, p] of this.players) if (p.pose) list.push([id, p.pose]);
      this.transport.broadcast({ k: MSG.POSES, list });
      this.transport.broadcast({ k: MSG.WORLD, list: g.enemies.map(encodeEnemy), slow: g.shouts.slowLeft > 0 });
    }
  }

  render(dt, levelKey, levels) {
    for (const p of this.players.values()) p.remote.render(dt, levelKey, levels);
  }

  names() { return [this.name, ...[...this.players.values()].map(p => p.name)]; }
}

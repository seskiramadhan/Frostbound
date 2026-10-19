// A co-op session (N1): host or join a room by code, see each other move.
// Star topology: guests talk only to the host; the host relays everyone's poses.
// Each player still runs their own enemies, loot and quests until N2.
// Emits on the event bus: 'netPlayerJoined' { name }, 'netPlayerLeft' { name }, 'netEnded' { reason }.
import { CONFIG } from '../config.js';
import { createTransport } from './transport.js';
import { MSG, encodePose, decodePose, encodeLook } from './protocol.js';
import { RemotePlayer } from '../entities/remotePlayer.js';

const N = CONFIG.net;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no I/L/O/0/1 to avoid typos

export function randomCode() {
  let s = '';
  for (let i = 0; i < N.codeLength; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export class Session {
  constructor(events, scene, player, inventory) {
    this.events = events;
    this.scene = scene;
    this.player = player;
    this.inventory = inventory;
    this.role = 'off';        // off | connecting | host | guest
    this.code = null;
    this.myId = null;
    this.hostId = null;
    this.players = new Map(); // peerId -> { name, look, remote: RemotePlayer }
    this.sendTimer = 0;
    this.lastLook = '';
    this.transport = null;
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
    this.transport.send(this.hostId, { k: MSG.HELLO, name, look: encodeLook(this.inventory) });
    // Wait for the host's answer
    return new Promise((resolve, reject) => {
      this.pendingJoin = { resolve, reject };
      setTimeout(() => { if (this.pendingJoin) { this.pendingJoin = null; this.leave(); reject(new Error('The host did not answer')); } }, 8000);
    });
  }

  leave(reason) {
    const was = this.active;
    this.transport?.close();
    this.#reset();
    if (was) this.events.emit('netEnded', { reason: reason ?? 'You left the room' });
  }

  #reset() {
    for (const p of this.players.values()) p.remote.dispose();
    this.players.clear();
    this.role = 'off';
    this.transport = null;
    this.pendingJoin = null;
  }

  #newTransport() {
    const t = createTransport();
    t.onMessage = (from, msg) => this.#onMessage(from, msg);
    t.onPeerLeave = id => {
      if (this.role === 'guest' && id === this.hostId) this.leave('The host left the room');
      else this.#removePlayer(id);
    };
    t.onError = e => { if (this.role === 'guest') this.leave(e.message); };
    return t;
  }

  #addPlayer(id, name, look) {
    if (this.players.has(id)) return;
    this.players.set(id, { name, look, remote: new RemotePlayer(this.scene, name, look) });
    this.events.emit('netPlayerJoined', { name });
  }

  #removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.remote.dispose();
    this.players.delete(id);
    this.events.emit('netPlayerLeft', { name: p.name });
    if (this.role === 'host') this.transport.broadcast({ k: MSG.LEFT, id });
  }

  #onMessage(from, m) {
    if (!m || typeof m.k !== 'string') return;
    if (this.role === 'host') {
      switch (m.k) {
        case MSG.HELLO: {
          if (this.count >= N.maxPlayers) { this.transport.send(from, { k: MSG.FULL }); setTimeout(() => this.transport?.kick(from), 300); return; }
          const name = String(m.name ?? 'Traveller').slice(0, 16);
          const everyone = [{ id: this.myId, name: this.name, look: encodeLook(this.inventory) },
            ...[...this.players].map(([id, p]) => ({ id, name: p.name, look: p.look }))];
          this.transport.send(from, { k: MSG.WELCOME, id: from, players: everyone });
          this.transport.broadcast({ k: MSG.JOINED, id: from, name, look: m.look }, from);
          this.#addPlayer(from, name, m.look);
          break;
        }
        case MSG.POSE: {
          const p = this.players.get(from);
          if (p && Array.isArray(m.p)) { p.pose = m.p; p.remote.push(decodePose(m.p)); }
          break;
        }
        case MSG.LOOK: {
          const p = this.players.get(from);
          if (p) { p.look = m.look; p.remote.setLook(m.look); this.transport.broadcast({ k: MSG.LOOK, id: from, look: m.look }, from); }
          break;
        }
      }
      return;
    }
    if (this.role === 'connecting' || this.role === 'guest') {
      switch (m.k) {
        case MSG.WELCOME:
          this.myId = m.id;
          this.role = 'guest';
          for (const p of m.players ?? []) this.#addPlayer(p.id, p.name, p.look);
          this.pendingJoin?.resolve(this.code);
          this.pendingJoin = null;
          break;
        case MSG.FULL:
          this.pendingJoin?.reject(new Error(`The room is full (${N.maxPlayers} players)`));
          this.pendingJoin = null;
          this.transport.close();
          this.#reset();
          break;
        case MSG.JOINED:
          if (m.id !== this.myId) this.#addPlayer(m.id, m.name, m.look);
          break;
        case MSG.LEFT:
          this.#removePlayer(m.id);
          break;
        case MSG.LOOK:
          this.players.get(m.id)?.remote.setLook(m.look);
          break;
        case MSG.POSES:
          for (const [id, pose] of m.list ?? []) {
            if (id !== this.myId && Array.isArray(pose)) this.players.get(id)?.remote.push(decodePose(pose));
          }
          break;
      }
    }
  }

  // Called every frame: send our pose at sendRate, and our look when gear changes.
  update(dt) {
    if (!this.active) return;
    const look = encodeLook(this.inventory), lookKey = `${look.w}|${look.a}`;
    if (lookKey !== this.lastLook) {
      this.lastLook = lookKey;
      if (this.role === 'guest') this.transport.send(this.hostId, { k: MSG.LOOK, look });
      else this.transport.broadcast({ k: MSG.LOOK, id: this.myId, look });
    }
    if ((this.sendTimer += dt) < 1 / N.sendRate) return;
    this.sendTimer = 0;
    const mine = encodePose(this.player);
    if (this.role === 'guest') {
      this.transport.send(this.hostId, { k: MSG.POSE, p: mine });
    } else {
      const list = [[this.myId, mine]];
      for (const [id, p] of this.players) if (p.pose) list.push([id, p.pose]);
      this.transport.broadcast({ k: MSG.POSES, list });
    }
  }

  render(dt, levelKey, levels) {
    for (const p of this.players.values()) p.remote.render(dt, levelKey, levels);
  }

  names() { return [this.name, ...[...this.players.values()].map(p => p.name)]; }
}

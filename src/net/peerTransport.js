// PeerJS transport: WebRTC data channels, signalling through the free PeerJS cloud server.
// PeerJS itself (vendor/) is only loaded the first time someone opens co-op.
import { CONFIG } from '../config.js';

const N = CONFIG.net;
let loading = null;

function loadPeerJs() {
  if (window.Peer) return Promise.resolve(window.Peer);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = N.peerjsUrl;
    s.onload = () => resolve(window.Peer);
    s.onerror = () => { loading = null; reject(new Error('Could not load the co-op library')); };
    document.head.appendChild(s);
  });
  return loading;
}

// PeerJS error types -> words a player understands
function friendly(e) {
  const map = {
    'unavailable-id': 'That room code is taken',
    'peer-unavailable': 'Room not found. Check the code, or the host may have left',
    'network': 'Can\'t reach the co-op server. Check your connection',
    'server-error': 'The co-op server is having trouble. Try again soon',
    'socket-error': 'Lost connection to the co-op server',
    'browser-incompatible': 'This browser can\'t do co-op',
    'webrtc': 'Couldn\'t connect directly. Mobile data can block this; try Wi-Fi',
  };
  const err = new Error(map[e?.type] ?? e?.message ?? 'Connection failed');
  err.type = e?.type;
  return err;
}

export class PeerTransport {
  constructor() {
    this.peer = null;
    this.conns = new Map();
  }

  #newPeer(Peer, id) {
    const opts = { config: { iceServers: N.iceServers }, debug: 0 };
    return id ? new Peer(id, opts) : new Peer(opts);
  }

  async host(roomId) {
    const Peer = await loadPeerJs();
    return new Promise((resolve, reject) => {
      let open = false;
      const peer = this.peer = this.#newPeer(Peer, roomId);
      peer.on('open', () => { open = true; resolve(); });
      peer.on('connection', conn => this.#attach(conn));
      peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });   // keep the room reachable
      peer.on('error', e => (open ? this.onError?.(friendly(e)) : reject(friendly(e))));
    });
  }

  async join(roomId) {
    const Peer = await loadPeerJs();
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = e => { if (!done) { done = true; clearTimeout(timer); this.close(); reject(e); } };
      const timer = setTimeout(() => fail(friendly({ type: 'webrtc' })), N.joinTimeout * 1000);
      const peer = this.peer = this.#newPeer(Peer);
      peer.on('error', e => (done ? this.onError?.(friendly(e)) : fail(friendly(e))));
      peer.on('open', () => {
        const conn = peer.connect(roomId, { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          this.#attach(conn);
          resolve(conn.peer);
        });
      });
    });
  }

  #attach(conn) {
    const add = () => { this.conns.set(conn.peer, conn); this.onPeerJoin?.(conn.peer); };
    if (conn.open) add(); else conn.on('open', add);
    conn.on('data', d => this.onMessage?.(conn.peer, d));
    conn.on('close', () => { if (this.conns.delete(conn.peer)) this.onPeerLeave?.(conn.peer); });
    conn.on('error', () => conn.close());
  }

  send(peerId, msg) {
    const c = this.conns.get(peerId);
    if (c?.open) c.send(msg);
  }

  broadcast(msg, exceptId) {
    for (const [id, c] of this.conns) if (id !== exceptId && c.open) c.send(msg);
  }

  // Drop one peer (e.g. room full).
  kick(peerId) {
    this.conns.get(peerId)?.close();
  }

  close() {
    for (const c of this.conns.values()) c.close();
    this.conns.clear();
    if (this.peer && !this.peer.destroyed) this.peer.destroy();
    this.peer = null;
  }
}

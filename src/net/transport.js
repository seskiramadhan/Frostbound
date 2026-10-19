// The only door between game code and the network. A transport moves JSON messages
// between peers and knows nothing about the game. Today it's PeerJS (peer-to-peer);
// a relay server for 8-10 players can replace it by adding one file here.
//
// Interface:
//   host(roomId) -> Promise              become the room
//   join(roomId) -> Promise<hostId>      connect to a room
//   send(peerId, msg), broadcast(msg, exceptId), close()
//   callbacks: onPeerJoin(peerId), onPeerLeave(peerId), onMessage(peerId, msg), onError(Error)
import { PeerTransport } from './peerTransport.js';

export function createTransport() {
  return new PeerTransport();
}

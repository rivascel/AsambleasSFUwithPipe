export const peers = new Map(); 
export const rooms = new Map(); 


export function addPeer(peerId, data) {
  console.log("✅ addPeer:", peerId);
  peers.set(peerId, {
    transports: [],
    producers: [],
    consumers: [],
    ...data,
  });
}

export function getPeer(peerId) {
  return peers.get(peerId);
}

export function addTransport(peerId, transport) {
  peers.get(peerId).transports.push(transport);
}

export function addProducer(peerId, producer) {
  peers.get(peerId).producers.push(producer);
}

export function addConsumer(peerId, consumer) {
  peers.get(peerId).consumers.push(consumer);
}

export function getAllPeers() {
  return peers;
}

export function getRoom(roomId) {
  return rooms.get(roomId);
}
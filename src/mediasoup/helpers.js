export const peers = new Map(); // socket.id -> { roomId, transports, producers, consumers }
export const rooms = new Map();  // roomId -> { router, producers }

// Helpers
export const getPeer = (socketId) => peers.get(socketId);
export const getAllPeers = () => peers;
export const addPeer = (socketId, data) => {
    peers.set(socketId, {
        
        id: socketId,
        transports: [],
        producers: [],
        consumers: [],
        ...data
    });
};
export const removePeer = (socketId) => peers.delete(socketId);

export const addTransport = (socketId, transport) => {
    const peer = peers.get(socketId);
    if (peer) {
        peer.transports.push(transport);
    }
};

export const addProducer = (socketId, transport) => {
    const peer = peers.get(socketId);
    if (peer) {
        peer.producers.push(transport);
    }
};

export const addConsumer = (socketId, transport) => {
    const peer = peers.get(socketId);
    if (peer) {
        peer.consumers.push(transport);
    }
};

export const getRoom = (roomId) => rooms.get(roomId);
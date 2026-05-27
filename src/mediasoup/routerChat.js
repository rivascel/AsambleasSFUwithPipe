// router.js

import { config } from "./config.js";
import { createWorkers, getWorker, getWorkerForRouter } from "./worker.js";

await createWorkers();

/* =========================================================
   GLOBAL STATE
========================================================= */

const rooms = new Map();

/**
 * producerId -> {
 *   producer,
 *   routerId,
 *   workerId,
 *   roomId,
 *   peerId
 * }
 */
const globalProducers = new Map();

/**
 * Cache de pipes
 *
 * key:
 * `${producerId}-${targetRouterId}`
 */
const pipeCache = new Map();

/* =========================================================
   ROOM
========================================================= */

export async function createRoom(roomId) {
  const workerWrapper = getWorker();

  // Router principal (donde vive el broadcaster/admin)
  const producerRouter =
    await workerWrapper.worker.createRouter({
      mediaCodecs: config.mediasoup.router.mediaCodecs
    });

  // IMPORTANTE:
  // routers pertenece al WRAPPER, no al worker real
  workerWrapper.routers.set(
    producerRouter.id,
    producerRouter
  );

  const room = {
    roomId,

    producerRouter,

    /**
     * workerId -> router
     */
    consumerRouters: new Map(),

    peers: new Map(),

    createdAt: Date.now()
  };

  rooms.set(roomId, room);

  console.log(
    `📡 Room ${roomId} creada -> Producer Router ${producerRouter.id}`
  );

  return room;
}

export function getRoom(roomId) {
  return rooms.get(roomId);
}

/* =========================================================
   ROUTER CONSUMIDOR ON DEMAND
========================================================= */

export async function getOrCreateConsumerRouter(
  roomId,
  workerWrapper
) {
  const room = rooms.get(roomId);

  if (!room)
    throw new Error("Room no encontrada");

  // Ya existe router consumidor para este worker
  if (room.consumerRouters.has(workerWrapper.id)) {
    return room.consumerRouters.get(workerWrapper.id);
  }

  // Crear nuevo router consumidor
  const router =
    await workerWrapper.worker.createRouter({
      mediaCodecs:
        config.mediasoup.router.mediaCodecs
    });

  workerWrapper.routers.set(router.id, router);

  room.consumerRouters.set(
    workerWrapper.id,
    router
  );

  console.log(
    `🧩 Consumer Router creado en Worker ${workerWrapper.id}`
  );

  return router;
}

/* =========================================================
   PEERS
========================================================= */

export async function addPeerToRoom(
  roomId,
  socketId,
  isBroadcaster = false
) {
  const room = rooms.get(roomId);

  if (!room)
    throw new Error("Room no encontrada");

  let router;
  let workerId;

  // Admin/Broadcaster SIEMPRE usa producerRouter
  if (isBroadcaster) {
    router = room.producerRouter;

    const workerWrapper =
      getWorkerForRouter(router.id);

    workerId = workerWrapper.id;
  } else {

    // Viewer -> balanceado
    const workerWrapper = getWorker();

    workerId = workerWrapper.id;

    router =
      await getOrCreateConsumerRouter(
        roomId,
        workerWrapper
      );
  }

  room.peers.set(socketId, {
    id: socketId,

    roomId,

    routerId: router.id,

    workerId,

    transports: [],

    producers: [],

    consumers: [],

    rtpCapabilities: null,

    isBroadcaster
  });

  console.log(
    `👤 Peer ${socketId} agregado -> Router ${router.id}`
  );

  return router;
}

export function getPeer(roomId, socketId) {
  const room = rooms.get(roomId);

  if (!room) return null;

  return room.peers.get(socketId);
}

/* =========================================================
   PRODUCERS
========================================================= */

export function registerProducer({
  producer,
  roomId,
  peerId,
  routerId,
  workerId
}) {

  globalProducers.set(producer.id, {
    producer,

    roomId,

    peerId,

    routerId,

    workerId
  });

  console.log(
    `🎥 Producer registrado ${producer.id}`
  );
}

export function getProducerInfo(producerId) {
  return globalProducers.get(producerId);
}

/* =========================================================
   PIPE PRODUCER
========================================================= */

export async function pipeProducerToRouter({
  producerId,
  targetRouter
}) {

  const producerInfo =
    globalProducers.get(producerId);

  if (!producerInfo) {
    throw new Error("Producer no encontrado");
  }

  // Ya existe pipe
  const cacheKey =
    `${producerId}-${targetRouter.id}`;

  if (pipeCache.has(cacheKey)) {
    return pipeCache.get(cacheKey);
  }

  const sourceWorker =
    getWorkerForRouter(
      producerInfo.routerId
    );

  const sourceRouter =
    sourceWorker.routers.get(
      producerInfo.routerId
    );

  // MISMO ROUTER
  if (sourceRouter.id === targetRouter.id) {

    return {
      pipeProducer: producerInfo.producer,
      piped: false
    };
  }

  console.log(
    `🔗 Pipe ${producerId} -> ${targetRouter.id}`
  );

  // MAGIA REAL DE MEDIASOUP
  const pipeResult =
    await sourceRouter.pipeToRouter({
      producerId,
      router: targetRouter
    });

  /**
   * pipeResult:
   * {
   *   pipeConsumer,
   *   pipeProducer
   * }
   */

  pipeCache.set(cacheKey, pipeResult);

  return {
    ...pipeResult,
    piped: true
  };
}

/* =========================================================
   REMOVE PEER
========================================================= */

export function removePeerFromRoom(
  roomId,
  socketId
) {

  const room = rooms.get(roomId);

  if (!room) return;

  const peer =
    room.peers.get(socketId);

  if (!peer) return;

  peer.transports.forEach(t => t.close());

  peer.producers.forEach(p => {

    globalProducers.delete(p.id);

    p.close();
  });

  peer.consumers.forEach(c => c.close());

  room.peers.delete(socketId);

  console.log(
    `👋 Peer ${socketId} eliminado`
  );
}

/* =========================================================
   HELPERS
========================================================= */

export function getAllRooms() {
  return Array.from(rooms.values());
}
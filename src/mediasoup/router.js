import mediasoup from 'mediasoup'; 
import { configuration } from "./config.js";
import { createWorkers, getWorker, getAllWorkers, getWorkerById, getWorkerForRouter } from "./worker.js";

const rooms = new Map();
await createWorkers();

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
  const producerRouter = await workerWrapper.worker.createRouter({
      mediaCodecs: configuration.mediasoup.router.mediaCodecs
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

  console.log(`📡 Room ${roomId} creada -> Producer Router ${producerRouter.id}`);

  return room;
}

export function getRoom(roomId) {
  return rooms.get(roomId);
}

/* =========================================================
   ROUTER CONSUMIDOR ON DEMAND
========================================================= */

export async function getOrCreateConsumerRouter(roomId, workerWrapper) {
  const room = rooms.get(roomId);

  if (!room)
    throw new Error("Room no encontrada");

  // Ya existe router consumidor para este worker
  if (room.consumerRouters.has(workerWrapper.id)) {
    return room.consumerRouters.get(workerWrapper.id);
  }

  // Crear nuevo router consumidor
  const router = await workerWrapper.worker.createRouter({
      mediaCodecs:
        configuration.mediasoup.router.mediaCodecs
    });

  workerWrapper.routers.set(router.id, router);

  room.consumerRouters.set(
    workerWrapper.id,
    router
  );

  console.log(`🧩 Consumer Router creado en Worker ${workerWrapper.id}`);

  return router;
}

/* =========================================================
   PEERS
========================================================= */

export async function addPeerToRoom(roomId,  socketId,  isBroadcaster = false) {

  const room = rooms.get(roomId);

  if (!room) {
    throw new Error("Room no encontrada");
  }

  let router;
  let workerId;

  // Broadcaster SIEMPRE en producer router
  if (isBroadcaster) {

    router = room.producerRouter;

    const worker = getWorkerForRouter(router.id);

    workerId = worker.id;

  } else {

    // BALANCEO REAL

    const workers = getAllWorkers();

    const workerLoads = workers.map(worker => {

      const peerCount =
        Array
          .from(room.peers.values())
          .filter(p => p.workerId === worker.id).length; //workerId viene de peer.

      return {
        worker,
        peerCount
      };
    });

    //busca el worker con menos peers asignados para balancear la carga de manera equitativa entre los workers disponibles.
    const selected = workerLoads.reduce(
      (min, curr) => curr.peerCount < min.peerCount ? curr : min //min acumulador, curr elemento actual
      //min es el worker con menos peers asignados encontrado hasta el momento, y curr es el worker actual que se está evaluando. 
      //Si curr.peerCount es menor que min.peerCount, entonces curr se convierte en el nuevo valor de min; de lo contrario, 
      //min permanece sin cambios.
    );

    workerId = selected.worker.id;

    router = await getOrCreateConsumerRouter(
      roomId,
      selected.worker
    );
  }

  const peer = {
    id: socketId,
    roomId,
    router,
    routerId: router.id,
    workerId,
    transports: [],
    producers: [],
    consumers: [],
    rtpCapabilities: null,
    isBroadcaster,
    role: "valor por defecto"
  };

  room.peers.set(socketId, peer);

  console.log(`👤 Peer ${socketId} -> Worker ${workerId}`);

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

export function registerProducer({ producer,  roomId,  peerId,  routerId,  workerId, role }) {

  globalProducers.set(producer.id, { producer, roomId, peerId, routerId, workerId, role });

  console.log(`🎥 Producer registrado ${producer.id}`);
}

export function getProducerInfo(producerId) {
  return globalProducers.get(producerId);
}

/* =========================================================
   PIPE PRODUCER
========================================================= */

export async function pipeProducerToRouter({ producerId, targetRouter }) {

  const producerInfo = globalProducers.get(producerId);

  if (!producerInfo) {
    throw new Error("Producer no encontrado");
  }

  // Ya existe pipe
  const cacheKey = `${producerId}-${targetRouter.id}`;

  if (pipeCache.has(cacheKey)) {
    return pipeCache.get(cacheKey);
  }

  const sourceWorker = getWorkerForRouter( producerInfo.routerId );

  const sourceRouter = sourceWorker.routers.get( producerInfo.routerId );

  // MISMO ROUTER
  if (sourceRouter.id === targetRouter.id) {

    return {
      pipeProducer: producerInfo.producer,
      piped: false
    };
  }

  console.log(`🔗 Pipe ${producerId} -> ${targetRouter.id}`);

  // CASO 2:
  // routers diferentes

  // MAGIA REAL DE MEDIASOUP
  const pipeResult = await sourceRouter.pipeToRouter({ producerId, router: targetRouter });

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

export function removePeerFromRoom(roomId, socketId) {

  const room = rooms.get(roomId);
  if (!room) return;
  const peer = room.peers.get(socketId);

  if (!peer) return;

  peer.transports.forEach(t => t.close());
  peer.producers.forEach(p => {
    globalProducers.delete(p.id);
    p.close();
  });

  peer.consumers.forEach(c => c.close());
  room.peers.delete(socketId);
  console.log(`👋 Peer ${socketId} eliminado`);
}

/* =========================================================
   HELPERS
========================================================= */

export function getAllRooms() {
  return Array.from(rooms.values());
}



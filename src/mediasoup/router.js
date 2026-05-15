import { config } from "./config.js";
import { createWorkers, getWorker, getAllWorkers, getWorkerById, getWorkerForRouter } from "./worker.js";

const rooms = new Map();
await createWorkers();

// Almacenar pipes activos
const activePipes = new Map(); // pipeId -> { pipe, producerRouter, consumerRouter }

export async function createRoomWithWorker(roomId) {

  const producerWorker = getWorker();

    //crear router principal
  const producerRouter = await producerWorker.createRouter({
    mediaCodecs: config.mediasoup.router.mediaCodecs
  });

    // Registrar router en el worker
  producerWorker.routers.set(producerRouter.id, producerRouter);

   // Crear routers consumidores en otros workers
  const consumerRouters = [];
  const otherWorkers = getAllWorkers().filter(w => w.id !== producerWorkerObj.id);

  for (const worker of otherWorkers) {
    const router = await worker.worker.createRouter({
      mediaCodecs: config.mediasoup.router.mediaCodecs
    });
    worker.routers.set(router.id, router);
    consumerRouters.push({
      router,
      workerId: worker.id,
      pipes: [] // Almacenar pipes conectados a este router
    });
  }

  return createRoom(roomId, producerRouter, consumerRouters);
}

//===================================================
//===================================================
//===================================================

// Nueva función: Crear Pipe Transport entre routers
export async function createPipeBetweenRouters(roomId, producerRouterId, consumerRouterId, producerId) {
  const room = rooms.get(roomId);
  if (!room) throw new Error(`Room ${roomId} no encontrada`);
  
  // Encontrar los routers
  let producerRouter = null;
  let consumerRouter = null;
  let producerWorkerObj = null;
  let consumerWorkerObj = null;
  
  // Buscar producer router
  if (room.producerRouter.id === producerRouterId) {
    producerRouter = room.producerRouter;
    producerWorkerObj = getWorkerForRouter(producerRouterId);
  } else {
    const consumerRouterObj = room.consumerRouters.find(cr => cr.router.id === producerRouterId);
    if (consumerRouterObj) {
      producerRouter = consumerRouterObj.router;
      producerWorkerObj = getWorkerForRouter(producerRouterId);
    }
  }
  
  // Buscar consumer router
  if (room.producerRouter.id === consumerRouterId) {
    consumerRouter = room.producerRouter;
    consumerWorkerObj = getWorkerForRouter(consumerRouterId);
  } else {
    const consumerRouterObj = room.consumerRouters.find(cr => cr.router.id === consumerRouterId);
    if (consumerRouterObj) {
      consumerRouter = consumerRouterObj.router;
      consumerWorkerObj = getWorkerForRouter(consumerRouterId);
    }
  }
  
  if (!producerRouter || !consumerRouter) {
    throw new Error("Routers no encontrados");
  }
  
  // Obtener el producer del router productor
  const producer = await producerRouter.getProducerById(producerId);
  if (!producer) throw new Error(`Producer ${producerId} no encontrado`);
  
  // Crear PipeTransport en el router productor
  const pipeProducer = await producerRouter.createPipeTransport({
    listenIp: config.mediasoup.webRtcTransport.listenIps[0].ip,
    enableSctp: false,
    enableRtx: true,
    enableSrtp: false
  });
  
  // Crear PipeTransport en el router consumidor
  const pipeConsumer = await consumerRouter.createPipeTransport({
    listenIp: config.mediasoup.webRtcTransport.listenIps[0].ip,
    enableSctp: false,
    enableRtx: true,
    enableSrtp: false
  });
  
  // Conectar los pipes (si están en diferentes workers necesitas intercambiar dtlsParameters)
  if (producerWorkerObj.id !== consumerWorkerObj.id) {
    // Están en diferentes workers - necesitas intercambiar parámetros via signaling
    const pipeProducerDtls = pipeProducer.dtlsParameters;
    const pipeConsumerDtls = pipeConsumer.dtlsParameters;
    
    // Conectar pipeProducer al pipeConsumer
    await pipeProducer.connect({ dtlsParameters: pipeConsumerDtls });
    await pipeConsumer.connect({ dtlsParameters: pipeProducerDtls });
  }
  
  // Crear el pipe para consumir el producer
  const pipeConsumerStream = await pipeConsumer.consume({
    producerId: producer.id,
    rtpCapabilities: consumerRouter.rtpCapabilities,
    paused: false
  });
  
  // Almacenar información del pipe
  const pipeInfo = {
    id: `${producerRouterId}-${consumerRouterId}-${Date.now()}`,
    pipeProducer,
    pipeConsumer,
    pipeConsumerStream,
    producerId: producer.id,
    producerRouterId,
    consumerRouterId,
    createdAt: Date.now()
  };
  
  activePipes.set(pipeInfo.id, pipeInfo);
  
  // Registrar pipe en los routers correspondientes
  if (room.producerRouter.id === producerRouterId) {
    room.pipes = room.pipes || [];
    room.pipes.push(pipeInfo);
  } else {
    const consumerRouterObj = room.consumerRouters.find(cr => cr.router.id === consumerRouterId);
    if (consumerRouterObj) {
      consumerRouterObj.pipes.push(pipeInfo);
    }
  }
  
  console.log(`🔗 Pipe creado entre router ${producerRouterId} y ${consumerRouterId}`);
  
  return {
    pipeId: pipeInfo.id,
    consumerTransportId: pipeConsumer.id,
    consumerStreamId: pipeConsumerStream.id,
    producerTransportId: pipeProducer.id
  };
}

// Nueva función: Crear pipe transport para un peer específico
export async function createPipeTransportForPeer(roomId, socketId, targetRouterId) {
  const room = rooms.get(roomId);
  if (!room) throw new Error(`Room ${roomId} no encontrada`);
  
  const peer = room.peers.get(socketId);
  if (!peer) throw new Error(`Peer ${socketId} no encontrado`);
  
  // Determinar el router del peer
  let peerRouter = null;
  let isProducerRouter = false;
  
  if (peer.routerId === room.producerRouter.id) {
    peerRouter = room.producerRouter;
    isProducerRouter = true;
  } else {
    const consumerRouterObj = room.consumerRouters.find(cr => cr.router.id === peer.routerId);
    if (consumerRouterObj) {
      peerRouter = consumerRouterObj.router;
    }
  }
  
  if (!peerRouter) throw new Error("Router del peer no encontrado");
  
  // Encontrar el router destino
  let targetRouter = null;
  if (targetRouterId === room.producerRouter.id) {
    targetRouter = room.producerRouter;
  } else {
    const targetRouterObj = room.consumerRouters.find(cr => cr.router.id === targetRouterId);
    if (targetRouterObj) {
      targetRouter = targetRouterObj.router;
    }
  }
  
  if (!targetRouter) throw new Error("Router destino no encontrado");
  
  // Crear pipe transport para el peer
  const pipeTransport = await peerRouter.createPipeTransport({
    listenIp: config.mediasoup.webRtcTransport.listenIps[0].ip,
    enableRtx: true
  });
  
  peer.pipes = peer.pipes || [];
  peer.pipes.push({
    transport: pipeTransport,
    targetRouterId,
    streams: []
  });
  
  return pipeTransport;
}

// Función para consumir un producer a través de pipe
// export async function consumeViaPipe(roomId, producerId, targetPeerId) {
//   const room = rooms.get(roomId);
//   if (!room) throw new Error(`Room ${roomId} no encontrada`);
  
//   // Encontrar qué router tiene el producer
//   let sourceRouter = null;
//   let sourcePeer = null;
  
//   // Buscar el producer en los peers
//   for (const peer of room.peers.values()) {
//     const producer = peer.producers.find(p => p.id === producerId);
//     if (producer) {
//       sourcePeer = peer;
//       if (peer.routerId === room.producerRouter.id) {
//         sourceRouter = room.producerRouter;
//       } else {
//         const consumerRouterObj = room.consumerRouters.find(cr => cr.router.id === peer.routerId);
//         sourceRouter = consumerRouterObj?.router;
//       }
//       break;
//     }
//   }
  
//   if (!sourceRouter) throw new Error("Router origen no encontrado");
  
//   // Encontrar peer destino
//   const targetPeer = room.peers.get(targetPeerId);
//   if (!targetPeer) throw new Error("Peer destino no encontrado");
  
//   let targetRouter = null;
//   if (targetPeer.routerId === room.producerRouter.id) {
//     targetRouter = room.producerRouter;
//   } else {
//     const consumerRouterObj = room.consumerRouters.find(cr => cr.router.id === targetPeer.routerId);
//     targetRouter = consumerRouterObj?.router;
//   }
  
//   if (!targetRouter) throw new Error("Router destino no encontrado");
  
//   // Si están en diferentes routers, crear pipe
//   if (sourceRouter.id !== targetRouter.id) {
//     const pipeResult = await createPipeBetweenRouters(
//       roomId, 
//       sourceRouter.id, 
//       targetRouter.id, 
//       producerId
//     );
    
//     return {
//       viaPipe: true,
//       pipeId: pipeResult.pipeId,
//       consumerStreamId: pipeResult.consumerStreamId
//     };
//   }
  
//   // Mismo router, consumir directamente
//   const consumer = await targetRouter.createConsumer({
//     producerId,
//     rtpCapabilities: targetPeer.rtpCapabilities
//   });
  
//   return {
//     viaPipe: false,
//     consumer
//   };
// }



//=============================================================
export async function createRoom(roomId, producerRouter, consumerRouters) {
  
  const room = createRoomAux(roomId, producerRouter, consumerRouters);

  rooms.set(roomId,room);

  console.log(`📡 Room ${roomId} creada - Producer Router: ${producerRouter.id}, 
    Consumer Routers: ${consumerRouters.length}`)

  return room;
}

export function getRoom(roomId) {
  return rooms.get(roomId);
}

export function addPeerToRoom(roomId, socketId, routerId=null) {
  const room = rooms.get(roomId);
  if (!room) return;

    // Si no se especifica router, asignar uno automáticamente (balanceo)
  let assignedRouterId = routerId;
  if (!assignedRouterId) {
    // Balancear peers entre routers consumidores
    const consumerRoutersCount = room.consumerRouters.length;
    const peersPerRouter = Math.floor(room.peers.size / (consumerRoutersCount + 1));
    
    if (room.peers.size < consumerRoutersCount * 2) {
      // Asignar al router consumidor con menos peers
      const routerLoads = room.consumerRouters.map(cr => ({
        router: cr.router,
        peerCount: Array.from(room.peers.values()).filter(p => p.routerId === cr.router.id).length
      }));
      const leastLoaded = routerLoads.reduce((min, curr) => 
        curr.peerCount < min.peerCount ? curr : min
      );
      assignedRouterId = leastLoaded.router.id;
    } else {
      // Asignar al router productor
      assignedRouterId = room.producerRouter.id;
    }
  }

    room.peers.set(socketId, {
      id: socketId,
      roomId,
      routerId: assignedRouterId, // ID del router al que pertenece este peer
      // producerRouter,
      consumer: [],
      transports: [],
      producers: [],
      pipes: [], // Pipes creados para este peer
      // consumers: [],
      rtpCapabilities: null
      
    });
    console.log(`👤 Peer ${socketId} agregado a la sala ${roomId} (Router: ${routerId})`);
    // console.log(`👤 Peer ${socketId} agregado a sala ${roomId} (Router: ${assignedRouterId})`);
  
  // Devolver el router asignado para que el cliente lo use
  return assignedRouterId;
}

export function getPeersInRoom(roomId) {
  const room = rooms.get(roomId);
  return room ? Array.from(room.peers.values()) : [];
}

export function getOnePeerInRoom(roomId, socketId) {
  const room = rooms.get(roomId);
  return room ? room.peers.get(socketId) : null;
}

export function removePeerFromRoom(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const peer = room.peers.get(socketId);
  if (!peer) return;

    // Cerrar pipes del peer
  if (peer.pipes) {
    peer.pipes.forEach(pipe => {
      if (pipe.transport) pipe.transport.close();
    });
  }

  // 🔴 Cerrar todo correctamente
  peer.transports.forEach(t => t.close());
  peer.producers.forEach(p => p.close());
  peer.consumers.forEach(c => c.close());

  room.peers.delete(socketId);

  console.log(`👋 Peer ${socketId} eliminado de la sala ${roomId}`);
}

export function getAllRooms() {
  return Array.from(rooms.values());
}

export function createRoomAux(roomId, router) {

  return {
    roomId,
    producerRouter, // Router principal para producers
    consumerRouters, // Routers secundarios para consumers
    // router,
    peers: new Map(),
    pipes: [], // Pipes entre routers
    createdAt: Date.now(),
    activeProducerId: null
  };
}

// Función para limpiar pipes inactivos
export async function cleanupInactivePipes() {
  const now = Date.now();
  for (const [pipeId, pipeInfo] of activePipes) {
    if (now - pipeInfo.createdAt > 3600000) { // 1 hora
      pipeInfo.pipeProducer.close();
      pipeInfo.pipeConsumer.close();
      activePipes.delete(pipeId);
      console.log(`🧹 Pipe ${pipeId} limpiado por inactividad`);
    }
  }
}

// Limpiar cada hora
setInterval(cleanupInactivePipes, 3600000);

import { config } from "./config.js";

const rooms = new Map();
export async function createRoom(roomId, worker) {
  
    // ✅ Verificar que worker existe
  if (!worker) {
    throw new Error("Worker no proporcionado para crear la sala");
  }
  const router = await worker.createRouter({
    mediaCodecs: config.mediasoup.router.mediaCodecs,
  });

  rooms.set(roomId, {
    router,
    peers: new Map(),
  });

  console.log(`📡 Room creada: ${roomId}`);

  return rooms.get(roomId);
}

export function getRoom(roomId) {
  return rooms.get(roomId);
}
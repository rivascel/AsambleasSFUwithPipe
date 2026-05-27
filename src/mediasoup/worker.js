import mediasoup from "mediasoup";
import os from "os";
import { config } from "./config.js";

const workers = [];
let nextWorkerIndex = 0;

export async function createWorkers() {
  const numCores = os.cpus().length;

  for (let i = 0; i < numCores; i++) {
    const worker = await mediasoup.createWorker({
      rtcMinPort: config.mediasoup.worker.rtcMinPort,
      rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
    });

    worker.on("died", () => {
      console.error("💀 Worker murió, reinicia el proceso");
      process.exit(1);
    });

    workers.push({
      worker, 
      routers: new Map(),
      consumersCount: 0,
      id: i
    });
     console.log(`🧵 Worker ${i} creado (PID: ${worker.pid})`);
  }
}

export function getWorker() {
  const worker = workers[nextWorkerIndex];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  return worker; 
  //workers inicia en cero y se va incrementando hasta llegar al número de workers, luego vuelve a cero para repartir la carga de manera 
  // equitativa entre los workers disponibles.

}

export function getWorkerById(workerId) {
  return workers.find(w => w.id === workerId);
}

export function getAllWorkers() {
  return workers;
}

export function getWorkerForRouter(routerId) {
  return workers.find(w => w.routers.has(routerId));
}

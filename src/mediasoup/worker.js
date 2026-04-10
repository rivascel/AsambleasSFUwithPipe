import mediasoup from "mediasoup";
import { config } from "./config.js";

let worker;

export async function createWorker() {
  worker = await mediasoup.createWorker({
    rtcMinPort: config.mediasoup.worker.rtcMinPort,
    rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
  });

  console.log("✅ Worker creado");

  worker.on("died", () => {
    console.error("💀 Worker murió, reiniciar servidor");
    process.exit(1);
  });

  return worker;
}

export function getWorker() {
  return worker;
}
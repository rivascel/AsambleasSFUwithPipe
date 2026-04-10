import { config } from "./config.js";

export async function createWebRtcTransport(router) {
  const transport = await router.createWebRtcTransport({
    listenIps: config.mediasoup.webRtcTransport.listenIps,
    enableUdp: config.mediasoup.webRtcTransport.enableUdp,
    enableTcp: config.mediasoup.webRtcTransport.enableTcp,
    preferUdp: config.mediasoup.webRtcTransport.preferUdp,
  });

  console.log("🚀 Transport creado:", transport.id);

  return transport;
}
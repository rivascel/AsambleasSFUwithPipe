import { configuration } from "./config.js";

export async function createWebRtcTransport(router) {
  const transport = await router.createWebRtcTransport({
    listenIps: configuration.mediasoup.webRtcTransport.listenIps,
    enableUdp: configuration.mediasoup.webRtcTransport.enableUdp,
    enableTcp: configuration.mediasoup.webRtcTransport.enableTcp,
    preferUdp: configuration.mediasoup.webRtcTransport.preferUdp,
  });

  console.log("🚀 Transport creado:", transport.id);

  return transport;
}
import { configuration } from "./config.js";


export async function createWebRtcTransport(router) {

  const transport = await router.createWebRtcTransport({
    listenInfos: configuration.mediasoup.webRtcTransport.listenInfos,
  });

  console.log("🚀 Transport creado:", transport.id);

  return transport;
}
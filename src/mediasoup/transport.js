import { configuration } from "./config.js";
import { config } from "../config/config.js";


export async function createWebRtcTransport(router) {

  const transport = await router.createWebRtcTransport({
    listenInfos: configuration.mediasoup.webRtcTransport.listenInfos,
  });

  // console.log("🚀 Transport creado:", transport.id);

  
  // transport.on("icestatechange", (iceState) => {
  //   // console.log(
  //   //   "🧊 ICE STATE:",
  //   //   transport.id,
  //   //   iceState
  //   // );
  // });

  // transport.on("dtlsstatechange", (dtlsState) => {
  //   // console.log(
  //   //   "🔐 DTLS STATE:",
  //   //   transport.id,
  //   //   dtlsState
  //   // );
  // });


  // transport.on("iceselectedtuplechange", (tuple) => {
  //   // console.log(
  //   //   "🎯 ICE SELECTED TUPLE:",
  //   //   transport.id,
  //   //   tuple
  //   // );
  // });


  return transport;
}
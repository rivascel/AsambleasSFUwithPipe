// offerManager.js

import { getPeerConnection, createPeerConnection } from "./peer-manager";
import { sendSignal } from "../supabase-client";

const makingOffer = new Set(); // Para evitar colisiones

export async function createAndSendOffer({roomId,fromPeer,toPeer,localStream }) {
  if (!roomId || !fromPeer || !toPeer) {
    console.log("Faltan parámetros para crear oferta:", { roomId, fromPeer, toPeer });
    throw new Error("roomId, fromPeer y toPeer son requeridos");

  }
  let pc;
  try {
    pc = getPeerConnection(toPeer);
    if (!pc || pc.connectionState === "closed" || pc.signalingState === "closed") {
    pc =   createPeerConnection(roomId,fromPeer,toPeer);  
    }

    // 2. Agregar Tracks
    if (!localStream) {
      throw new Error("localStream no disponible");
    }

    if (localStream && !pc._tracksAdded) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      pc._tracksAdded = true;
    }

    // 3. Crear Oferta
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await sendSignal({
      room_id: roomId,
      from_user: fromPeer,
      to_user: toPeer,
      type: "offer",
      payload: offer
    });

    console.log("oferta enviada a", toPeer);
   
  } catch(error){
    console.error("error creando oferta",error);
    if (pc) pc.close();
    throw error;
  }
}
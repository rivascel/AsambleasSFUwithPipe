import { getPeerConnection, createPeerConnection, flushCandidateQueue, queueCandidate } from './peer-manager';
import { sendSignal } from '../supabase-client';

//recibe la señal si es oferta, respuesta o candidato y la maneja según el tipo
export async function handleSignal(signal, role) {
const { type, from_user, to_user, room_id, payload } = signal;

switch(type) {
    case 'offer':
        await handleOffer(room_id, from_user, to_user, payload);
    break;

    // case 'answer':
    //     await handleAnswer(room_id, from_user, to_user, payload);
    // break;

    // case 'ice-candidate':
    //     await handleIncomingICE(room_id, from_user, to_user, payload);
    // break;

    default:
    console.warn('Signal desconocida', type);
}
};

//funcion que recibe la oferta y envia la respuesta
export async function handleOffer(room_id, from_user, to_user, payload ) {
  // Este archivo corre en el viewer (recibe offer del admin) o en quien reciba oferta
  const pc = getPeerConnection(from_user);
  if (!pc) {
    const pc = createPeerConnection(room_id, to_user, from_user);
  }

  const desc = typeof payload === 'string' ? JSON.parse(payload) : payload;
  await pc.setRemoteDescription(new RTCSessionDescription(desc));

  
  // await flushCandidateQueue(from_user); // aplicar candidatos en cola

  // crear answer
//   const answer = await pc.createAnswer();
//   await pc.setLocalDescription(answer);

//   console.log("✅ Offer manejada de", from_user);
  
//   await sendSignal({
//       room_id: room_id,
//       from_user: to_user, //yo
//       to_user: from_user, //el otro
//       type: "answer",
//       payload: answer
//     })
//     console.log("✅ Answer enviada a", from_user);
};

//funcion que recibe la respuesta y la aplica candidatos





export async function handleAnswer(room_id, from_user, to_user,payload) {
  // console.log("Buscando PC de:", from_user);
// console.log("PCs existentes:", Object.keys(peerConnections));

  let pc;
  try {
    pc = await getPeerConnection(from_user);
    if (!pc) {
      pc = createPeerConnection(room_id, to_user, from_user);  
      return;
    }
  
    //Ignora answers si el estado no es correcto
    if (pc.signalingState !== "have-local-offer") {
      console.warn("⚠️ Answer ignorada, estado inválido:", pc.signalingState);
      return;
    }
    //Evita procesar answers duplicadas
    if (pc.currentRemoteDescription) {
      console.warn("⚠️ Ya existe remoteDescription, ignorando answer duplicada");
      return;
    }

    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    console.log("Estado antes de aplicar answer:", pc.signalingState);
    await pc.setRemoteDescription(new RTCSessionDescription(parsed));
    console.log("Answer recibida");

    //cuando se realice setRemoteDescription es cuando se liberan los ICES
    await flushCandidateQueue(from_user); // aplicar candidatos en cola

  } catch(error) {
    console.error("error ANSWER ",error);
    if (pc) pc.close();
    throw error;
  } 
};

//funcion que recibe el candidato y lo aplica o lo pone en cola si el pc no esta listo
export async function handleIncomingICE(room_id, from_user, to_user, payload) {
  const pc = getPeerConnection(from_user);

  if (!pc) {
      console.warn("⚠️ ICE recibido sin PC, encolando");
      queueCandidate(from_user, payload);
      return;
    };
  
  // const ice = typeof payload === 'string' ? JSON.parse(payload) : payload;
  // let ice=payload;
  
  if (typeof payload === "string") {
    try {
      const ice = JSON.parse(payload);
    } catch (err) {
      console.warn("ICE payload no es JSON válido:", payload);
      console.error(err);
      return;
    }
  }

  if (!ice || (!ice.candidate && ice.candidate !== '')) return;

  if (!pc || pc.signalingState === 'stable' || !pc.remoteDescription) {
    
      console.warn('PC no listo, candidato en cola para', from_user);

      queueCandidate(from_user, payload);
    
  } 
  else {
    try {
        await pc.addIceCandidate(new RTCIceCandidate(payload));
        console.log("✅ ICE candidate agregado para", from_user);
    } catch (err) {
        console.warn('Error addIceCandidate', err);
        // si falla, pushearlo
        queueCandidate(from_user, payload);
    }
  }
};
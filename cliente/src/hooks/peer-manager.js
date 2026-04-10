import { sendSignal } from "../supabase-client";

const peerConnections = {}; 
const iceCandidateQueue = {}; // Para almacenar candidatos antes de que el PC esté listo
export const createPeerConnection = (roomId, currentUser, peerId) => {
        if (currentUser === peerId) {
          console.error("❌ Intentando conectar consigo mismo");
          return;
        }
  const configuration = { iceServers: 
    [{ urls:  ['stun:stun1.l.google.com:19302', 
              'stun:stun2.l.google.com:19302'],
      },
      {
        urls: "turns:standard.relay.metered.ca:443?transport=tcp",
        username: "6e91ed4ca990de235a21a66f",
        credential: "mqzh0ARtqA3rjU6e",
      },
    ],
    iceCandidatePoolSize: 10
  };
  const pc = new RTCPeerConnection(configuration);

  console.log("🧠 createPeerConnection", {
  currentUser,
  peerId
});

  // pc.onicecandidate = async (event) => {
  //   if (!event.candidate) return;

  //   await sendSignal({
  //     room_id: roomId,
  //     from_user: currentUser,
  //     to_user: peerId,
  //     type: "ice-candidate",
  //     payload: {
  //       candidate: event.candidate.candidate,
  //       sdpMid: event.candidate.sdpMid,
  //       sdpMLineIndex: event.candidate.sdpMLineIndex
  //     }
  //   });

  //   console.log("❄️ ICE enviado a", peerId);
  // };

  // Almacenar la conexión
  peerConnections[peerId] = pc;
  iceCandidateQueue[peerId] = []; // Inicializar la cola para este peerId
  
  return pc;
};


export const getPeerConnection = (peerId) => {
  console.log("🔍 Buscando PC:", peerId);
  console.log("📦 PCs existentes:", Object.keys(peerConnections));

  return peerConnections[peerId] || null;

};

export const closePeerConnection = (peerId) => {
  const pc = peerConnections[peerId];
  if (pc) {
    pc.close();
    delete peerConnections[peerId];
  }
};

export const closeAllPeerConnections = () => {
  Object.keys(peerConnections).forEach(peerId => {
    closePeerConnection(peerId);
  });
};


// export function queueCandidate(peerId, candidate) {

//   if (!iceCandidateQueue[peerId]) {
//     iceCandidateQueue[peerId] = [];
//   }

//   iceCandidateQueue[peerId].push(candidate);

//   console.log("📥 ICE en cola para", peerId);
// };

// export async function flushCandidateQueue(peerId) {

//   const pc = peerConnections[peerId];
//   const queue = iceCandidateQueue[peerId];

//   if (!pc || !queue) return;

//   console.log("🚀 Procesando cola ICE de", peerId);

//   // Solo procesar si el estado permite agregar candidatos
//   // if (pc.remoteDescription && pc.remoteDescription.type) {
//     for (const candidate of queue) {
//       try {
//         await pc.addIceCandidate(new RTCIceCandidate(candidate));
//         console.log("Candidato adherido")
//       } catch (err) {
//         console.warn("Error agregando ICE:", err);
//       }
//     }  
//     delete iceCandidateQueue[peerId]; // Limpiar la cola después de procesar
//   // }
//   iceCandidateQueue[peerId] = [];
// }
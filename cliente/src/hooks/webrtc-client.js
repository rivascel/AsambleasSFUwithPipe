// Import the new functions
import {
  //... other imports
  getActiveAdmin,
  registerViewer, // Import the existing viewer registration function
  sendSignal,
  setUserIsStreaming
 
} from "../../src/supabase-client";


const API_URL = import.meta.env.VITE_API_URL;


const peerConnections={};
// let localStream;
let remoteStream;
let candidateQueue = [];
const appliedAnswers = new Set();

let configuration=null;


let device;
    let consumerTransport;  // Para recibir streams
    let producerTransport;  // Para enviar streams (NUEVO)
    let localStream = null; // Stream local del viewer
    let isProducing = false;

// Obtener stream local (cámara/micrófono)
export async function getLocalStream(localVideoElement){
  try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      localVideoElement.srcObject = stream;
      
      // Opcional: mostrar preview local
      if (localVideoElement?.current) {
        localVideoElement.current.srcObject = stream;
      }
      
      return stream;
    } catch (error) {
      console.error("❌ Error accediendo a medios:", error);
      return null;
    }

}

  // Función para iniciar transmisión (enviar video/audio)
// Es mejor usar variables locales o referencias que no contaminen el objeto window
let videoProducer = null;
let audioProducer = null;

export async function startProducing(videoTrack, audioTrack,producerTransportRef, isProducingRef) {  
  // 1. Validar que el transporte de envío (SendTransport) exista
  if (!producerTransportRef.current) {
    console.error("❌ producerTransport no inicializado. ¿Se llamó a createSendTransport primero?");
    return;
  }

  try {
    // 2. Producir Video con Simulcast (Configuración válida)
    if (videoTrack) {
      videoProducer = await producerTransportRef.current.produce({
        track: videoTrack,
        encodings: [
          { maxBitrate: 100000 }, // Calidad baja
          { maxBitrate: 300000 }, // Calidad media
          { maxBitrate: 900000 }  // Calidad alta
        ],
        codecOptions: {
          videoGoogleStartBitrate: 1000
        }
      });
      
      console.log("🎥 Video producer creado:", videoProducer.id);

      // Manejar cierre del producer
      videoProducer.on('trackended', () => {
        console.log('Track de video finalizado');
      });
    }

    // 3. Producir Audio
    if (audioTrack) {
      audioProducer = await producerTransportRef.current.produce({
        track: audioTrack,
        encodings: [
          { maxBitrate: 32000 } 
        ]
      });
      
      console.log("🎤 Audio producer creado:", audioProducer.id);
    }

    // 4. Actualizar estados
    isProducingRef.current = true;
    setViewerReady(true);
    
    return { videoProducer, audioProducer };

  } catch (error) {
    console.error("❌ Error produciendo en Mediasoup:", error);
    throw error;
  }
}

  // export async function startProducing(videoTrack, audioTrack) {  
  //   if (!producerTransport) {
  //       console.error("❌ producerTransport no inicializado");
  //       return;
  //     }

  //     try {
  //       // Producir video
  //       if (videoTrack) {
  //         const videoProducer = await producerTransport.produce({
  //           track: videoTrack,
  //           encodings: [
  //             { maxBitrate: 100000 }, // 100kbps
  //             { maxBitrate: 300000 }, // 300kbps
  //             { maxBitrate: 900000 }  // 900kbps
  //           ],
  //           codecOptions: {
  //             videoGoogleStartBitrate: 1000
  //           }
  //         });
          
  //         console.log("🎥 Video producer creado:", videoProducer.id);
          
  //         // Guardar producer
  //         if (!window.videoProducers) window.videoProducers = [];
  //         window.videoProducers.push(videoProducer);
  //       }

  //       // Producir audio
  //       if (audioTrack) {
  //         const audioProducer = await producerTransport.produce({
  //           track: audioTrack,
  //           encodings: [
  //             { maxBitrate: 32000 } // 32kbps para audio
  //           ]
  //         });
          
  //         console.log("🎤 Audio producer creado:", audioProducer.id);
          
  //         if (!window.audioProducers) window.audioProducers = [];
  //         window.audioProducers.push(audioProducer);
  //       }

  //       isProducing = true;
  //       setViewerReady(true);
        
  //     } catch (error) {
  //       console.error("❌ Error produciendo:", error);
  //     }
  
  // }

    // Función para detener transmisión
  export async function stopProducing() {
    // Cerrar producers de video
    if (window.videoProducers) {
      for (const producer of window.videoProducers) {
        producer.close();
      }
      window.videoProducers = [];
    }
    
    // Cerrar producers de audio
    if (window.audioProducers) {
      for (const producer of window.audioProducers) {
        producer.close();
      }
      window.audioProducers = [];
    }
    
    // Detener tracks locales
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    
    isProducing = false;

  }

  

export async function getAdmin(roomId) {
  return await getActiveAdmin(roomId);
};

export async function startLocalStream(roomId, email, localVideoElement) {
  // setViewerIsStreaming(email);
  setUserIsStreaming(email)
  try{
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideoElement.srcObject = localStream;

    await createOfferToAdmin(roomId, email, localStream);

    return localStream;
  } catch(error){
    console.error("Error al obtener el stream local:", error);
    throw error;
  }
};

export async function stopLocalStream(videoElement) {
  localStream = videoElement?.srcObject;
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    videoElement.srcObject = null;
    console.log("stream detenido correctamente")
  } else {
    console.warn("No hay stream activo en el videoElement");
  }
}  

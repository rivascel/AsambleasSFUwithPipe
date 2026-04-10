import React, { useState, useEffect, useRef, useContext } from "react";
import { UserContext } from "../../components/UserContext";
import { io } from "socket.io-client";
import { startBroadcasting, stopLocalStream, joinStreamAsAdmin,listenForApprovals,createOfferToViewer,getLocalStream
 } from "../../hooks/webrtc-manager";
import { getActiveAdmin } from '../../supabase-client';
import AppContext from '../../context/AppContext';

import * as mediasoupClient from "mediasoup-client";


const VideoGeneral = () => {
  const { apiUrl } = useContext(AppContext);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const localRef = useRef();
  const socketRef = useRef(null);
  const remoteRef = useRef();
  const { email } = useContext(UserContext);
  const [stream, setStream] = useState(false);
  const roomId="main-room";
  const [remote, setRemote] = useState(false);
  // const [userId, setUserId] = useState(null);

  const deviceRef = useRef(null);
  const producerTransportRef = useRef(null);
  const consumerTransportRef = useRef(null);
  const isProducingRef = useRef(false);
  
  const ownerInfo = JSON.parse(localStorage.getItem("ownerInfo"));

  socketRef.current = io(`${apiUrl}`, {
    withCredentials: true,
    transports: ["websocket"]
  });

  useEffect(() => {
    if (!socketRef.current || !roomId || !email) return;
  
    const init = async () => {
      try {
        // 1. Unirse y obtener capacidades
        const { rtpCapabilities } = await new Promise(resolve => {
          socketRef.current.emit("join-room", { roomId }, resolve);
        });
  
        // 2. Cargar Device (Única vez)
        const device = new mediasoupClient.Device();
        await device.load({ routerRtpCapabilities: rtpCapabilities });
        deviceRef.current = device;
  
        // 3. Crear Transport de Consumo (RECV)
        const params = await new Promise(resolve => {
          socketRef.current.emit("createTransport", { roomId, direction: "recv" }, resolve);
        });
  
        const transport = device.createRecvTransport(params);
        consumerTransportRef.current = transport;
  
        // Listener para conectar el transport de consumo
        transport.on("connect", ({ dtlsParameters }, callback, errback) => {
          socketRef.current.emit("connectTransport", {
            transportId: transport.id,
            dtlsParameters
          }, (res) => (res?.error ? errback() : callback()));
        });
  
        // 4. Consumir lo que ya exista
        await consumeExistingStreams();
        
        // 5. Solicitar permiso para transmitir (opcional)
        // socketRef.current.emit("request-stream", { userId: email, roomId });
  
      } catch (error) {
        console.error("Error en inicialización:", error);
      }
    };
  
    // --- Listeners de Eventos de Red ---
    
    // Nuevo productor en la sala
    socketRef.current.on("new-producer", async ({ producerId, kind }) => {
      await consumeProducer(producerId, kind);
    });
  
    // Admin cancela transmisión
    socketRef.current.on("canceled", async () => {
      setViewerReady(false);
      if (isProducingRef.current) await stopProducing();
    });
  
    init();
  
    return () => {
      if (consumerTransportRef.current) consumerTransportRef.current.close();
      if (producerTransportRef.current) producerTransportRef.current.close();
      socketRef.current.off("new-producer");
      socketRef.current.off("canceled");
    };
  }, [roomId, email]);
  
  //Funcion de soporte del useEffect anterior
    async function createSendTransport() {
      if (producerTransportRef.current) return; // Ya existe
    
      const params = await new Promise(resolve => {
        socketRef.current.emit("createTransport", { roomId, direction: "send" }, resolve);
      });
    
      const transport = deviceRef.current.createSendTransport(params);
      producerTransportRef.current = transport;
    
      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        socketRef.current.emit("connectTransport", { transportId: transport.id, dtlsParameters }, 
        (res) => (res?.error ? errback() : callback()));
      });
    
      transport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
        socketRef.current.emit("produce", { transportId: transport.id, kind, rtpParameters, appData }, 
        ({ id, error }) => (error ? errback() : callback({ id })));
      });
    };
  
    //   // Consumir streams existentes en la sala
      async function consumeExistingStreams() {
        if (!consumerTransportRef.current) {
          console.error("❌ consumerTransport no inicializado");
          return;
        }
      
        try {
          // Obtener lista de producers existentes en la sala
          const { producers } = await new Promise((resolve) => {
            socketRef.current.emit("getProducers", { roomId: roomId }, resolve);
          });
      
          if (!producers || producers.length === 0) {
            console.log("📭 No hay producers activos en la sala");
            return;
          }
      
          console.log(`📡 Consumiendo ${producers.length} producers existentes...`);
      
          // Consumir cada producer
          for (const producer of producers) {
            await consumeProducer(producer.id);
          }
      
        } catch (error) {
          console.error("❌ Error consumiendo streams existentes:", error);
        }
      
      }
  


  // useEffect(() => {
  //   if (!roomId) return;
  //   let subscribe;
  //       let device;
  //   let consumerTransport;  // Para recibir streams
  //   let producerTransport;  // Para enviar streams (NUEVO)
  //   let localStream = null; // Stream local del viewer
  //   let isProducing = false;


  //   // socketRef.current.on("approved", async ({ userId, roomId })=>{
  //     // console.log(`un nuevo viewer aprobado ${userId} en el cuarto ${roomId}`);

  //     // const admin = await getActiveAdmin(roomId);
      
  //   // });

  //   //1. Escucha cuando un viewer inicia transmisión previa aprobación del Admin
  //   socketRef.current.on("stream-ready-user", async ()=>{
  //     console.log(`El usuario comenzó transmisión`);
  //     await joinStreamAsAdmin
  //     (
  //       roomId, 
  //       email, 
  //       remoteRef.current
  //     );
  //   });

  //   //2. Función que escucha si existe una aprobación de viewer para activar pantalla y escucha todas las señales
  //   const init3 = async () => {
  //     const exists = listenForApprovals(roomId);

  //     if (exists) {
  //       setRemote(true);
  //     } else {
  //       return;
  //     };

  //   }
  //   init3();

  //   //3. recibe mensaje que existe nuevo viewer luego de iniciar transmisión y le crear oferta solo a él.
  //   socketRef.current.on("listen-user", async ({ userId, roomId })=>{
  //     const stream = getLocalStream();
      
  //     if (!stream) {
  //       console.log(`los siguientes usuarios estan conectados ${userId} pero no hay stream local para crear oferta`);
  //       return;
  //     }
  //     // createOfferToViewer(roomId, email, stream);
  //   });

  //   if (!socketRef.current) {
  //         console.error("❌ socket no inicializado");
  //         return;
  //       }
    
  //       if (!socketRef.current) {
  //         console.error("❌ socket no inicializado");
  //         return;
  //       }
    
  //       //Recibe mensaje de que el usuario fue cancelado para transmitir por el admin y bloquea opción para transmitir
  //       socketRef.current.on("canceled", async ({ userId, roomId })=>{
  //         console.log(`viewer cancelado ${userId} en el cuarto ${roomId} para transmitir`);
  //         setViewerReady(false);
  //             // Detener producción si estaba activa
  //         if (isProducing) {
  //           await stopProducing();
  //         }
  //       });
    
  //         // Función para iniciar transmisión (enviar video/audio)
  //       const startProducing = async (videoTrack, audioTrack) => {
  //         if (!producerTransport) {
  //           console.error("❌ producerTransport no inicializado");
  //           return;
  //         }
    
  //         try {
  //           // Producir video
  //           if (videoTrack) {
  //             const videoProducer = await producerTransport.produce({
  //               track: videoTrack,
  //               encodings: [
  //                 { maxBitrate: 100000 }, // 100kbps
  //                 { maxBitrate: 300000 }, // 300kbps
  //                 { maxBitrate: 900000 }  // 900kbps
  //               ],
  //               codecOptions: {
  //                 videoGoogleStartBitrate: 1000
  //               }
  //             });
              
  //             console.log("🎥 Video producer creado:", videoProducer.id);
              
  //             // Guardar producer
  //             if (!window.videoProducers) window.videoProducers = [];
  //             window.videoProducers.push(videoProducer);
  //           }
    
  //           // Producir audio
  //           if (audioTrack) {
  //             const audioProducer = await producerTransport.produce({
  //               track: audioTrack,
  //               encodings: [
  //                 { maxBitrate: 32000 } // 32kbps para audio
  //               ]
  //             });
              
  //             console.log("🎤 Audio producer creado:", audioProducer.id);
              
  //             if (!window.audioProducers) window.audioProducers = [];
  //             window.audioProducers.push(audioProducer);
  //           }
    
  //           isProducing = true;
  //           setViewerReady(true);
            
  //         } catch (error) {
  //           console.error("❌ Error produciendo:", error);
  //         }
  //       };
    
  //       // Función para detener transmisión
  //       const stopProducing = async () => {
  //         // Cerrar producers de video
  //         if (window.videoProducers) {
  //           for (const producer of window.videoProducers) {
  //             producer.close();
  //           }
  //           window.videoProducers = [];
  //         }
          
  //         // Cerrar producers de audio
  //         if (window.audioProducers) {
  //           for (const producer of window.audioProducers) {
  //             producer.close();
  //           }
  //           window.audioProducers = [];
  //         }
          
  //         // Detener tracks locales
  //         if (localStream) {
  //           localStream.getTracks().forEach(track => track.stop());
  //           localStream = null;
  //         }
          
  //         isProducing = false;
  //       };
    
  //       // Obtener stream local (cámara/micrófono)
  //       const getLocalStream = async () => {
  //         try {
  //           const stream = await navigator.mediaDevices.getUserMedia({
  //             video: true,
  //             audio: true
  //           });
            
  //           localStream = stream;
            
  //           // Opcional: mostrar preview local
  //           if (localVideoRef?.current) {
  //             localVideoRef.current.srcObject = stream;
  //           }
            
  //           return stream;
  //         } catch (error) {
  //           console.error("❌ Error accediendo a medios:", error);
  //           return null;
  //         }
  //       };
    
  //       // Escuchar nuevos producers (otros usuarios transmitiendo)
  //       socketRef.current.on("new-producer", async ({ producerId, peerId, kind }) => {
  //         try {
  //           console.log(`🎥 Nuevo producer: ${producerId} de ${peerId} tipo: ${kind}`);
            
  //           // No consumir nuestro propio producer
  //           if (peerId === socketRef.current.id) {
  //             console.log("👤 Es mi propio producer, ignorando");
  //             return;
  //           }
    
  //           // Consumir el nuevo producer
  //           const consumerParams = await new Promise((resolve) => {
  //             socketRef.current.emit("consume", {
  //               roomId: roomId,
  //               producerId: producerId,
  //               rtpCapabilities: device.rtpCapabilities,
  //             }, resolve);
  //           });
    
  //           if (!consumerParams || consumerParams.error) {
  //             console.error("❌ Error en consume:", consumerParams);
  //             return;
  //           }
    
  //           const consumer = await consumerTransport.consume({
  //             id: consumerParams.id,
  //             producerId: consumerParams.producerId,
  //             kind: consumerParams.kind,
  //             rtpParameters: consumerParams.rtpParameters,
  //           });
    
  //           // Agregar track al stream remoto
  //           const stream = remoteRef.current.srcObject || new MediaStream();
  //           stream.addTrack(consumer.track);
  //           remoteRef.current.srcObject = stream;
    
  //           // Reanudar consumo
  //           socketRef.current.emit("resume", { consumerId: consumer.id });
            
  //           console.log(`✅ Consumiendo ${kind} de ${peerId}`);
    
  //         } catch (error) {
  //           console.error("❌ Error consumiendo stream:", error);
  //         }
  //       });
    
  //        // Inicializar como viewer (solo consumir)
  //       const initAsViewer = async () => {
  //         // 1. Unirse a room
  //         const { rtpCapabilities } = await new Promise(resolve => {
  //           socketRef.current.emit("joinRoom", { roomId: "main-room" }, resolve);
  //         });
    
  //         // 2. Crear device
  //         device = new mediasoupClient.Device();
  //         await device.load({ routerRtpCapabilities: rtpCapabilities });
    
  //         // 3. Crear transport para recibir (CONSUMER)
  //         const consumerTransportParams = await new Promise(resolve => {
  //           socketRef.current.emit("createTransport", { roomId: roomId }, resolve);
  //         });
    
  //         if (!consumerTransportParams || consumerTransportParams.error) {
  //           console.error("❌ Error creando consumer transport:", consumerTransportParams);
  //           return;
  //         }
    
  //         consumerTransport = device.createRecvTransport(consumerTransportParams);
    
  //         // Conectar consumer transport
  //         consumerTransport.on("connect", ({ dtlsParameters }, callback) => {
  //           socketRef.current.emit("connectTransport", {
  //             transportId: consumerTransport.id,
  //             dtlsParameters
  //           });
  //           callback();
  //         });
    
  //         // 4. Crear transport para enviar (PRODUCER) - NUEVO
  //         const producerTransportParams = await new Promise(resolve => {
  //           socketRef.current.emit("createTransport", { roomId: roomId }, resolve);
  //         });
    
  //         if (!producerTransportParams || producerTransportParams.error) {
  //           console.error("❌ Error creando producer transport:", producerTransportParams);
  //           return;
  //         }
    
  //         producerTransport = device.createSendTransport(producerTransportParams);
    
  //         // Configurar producer transport
  //         producerTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
  //           socketRef.current.emit("connectTransport", {
  //             transportId: producerTransport.id,
  //             dtlsParameters
  //           }, (response) => {
  //             if (response?.error) {
  //               errback(new Error(response.error));
  //             } else {
  //               callback();
  //             }
  //           });
  //         });
    
  //         // Manejar producción de tracks
  //         producerTransport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
  //           try {
  //             const { id } = await new Promise((resolve, reject) => {
  //               socketRef.current.emit("produce", {
  //                 transportId: producerTransport.id,
  //                 kind,
  //                 rtpParameters
  //               }, (response) => {
  //                 if (response.error) {
  //                   reject(new Error(response.error));
  //                 } else {
  //                   resolve(response);
  //                 }
  //               });
  //             });
  //             callback({ id });
  //           } catch (error) {
  //             errback(error);
  //           }
  //         });
    
  //         console.log("✅ Transports inicializados correctamente");
  //       };
    
  //       // Inicialización principal
  //       const init = async () => {
  //         if (!ownerInfo?.email || !roomId) return;
    
  //         await registerViewer(roomId, email);
          
  //         // Primero inicializar como viewer
  //         await initAsViewer();
          
  //         // Opcional: auto-solicitar permiso para transmitir
  //         socketRef.current.emit("request-stream", { userId: email, roomId });
  //       };
    
  //       // Escuchar cuando el admin permite transmitir
  //       socketRef.current.on("stream-ready", async () => {
  //         console.log("✅ Permiso para transmitir otorgado");
          
  //         // Obtener stream local y empezar a producir
  //         const stream = await getLocalStream();
  //         if (stream) {
  //           const videoTrack = stream.getVideoTracks()[0];
  //           const audioTrack = stream.getAudioTracks()[0];
  //           await startProducing(videoTrack, audioTrack);
  //         }
  //       });
    
  //       // Iniciar
  //       init();
    
  //       // Cleanup al desmontar
  //       return () => {
  //         if (consumerTransport) consumerTransport.close();
  //         if (producerTransport) producerTransport.close();
  //         if (localStream) {
  //           localStream.getTracks().forEach(track => track.stop());
  //         }
  //         stopProducing();
  //       };

    

  // },[roomId, ownerInfo, email]);
  
  //Este inicia transmisión del admin e informa a los usuarios conectados
  
  useEffect(() => {

    const init = async () => {

      if (stream && localRef.current /*&& userStreaming*/) {
        // await startBroadcasting(roomId, email, localRef.current);
        createSendTransport();
        const stream = await getLocalStream(localRef.current);
          if (stream) {
            const videoTrack = stream.getVideoTracks()[0];
            const audioTrack = stream.getAudioTracks()[0];

            // Llamas a tu función startProducing usando producerTransportRef.current
            if (producerTransportRef.current) {
              await startProducing(videoTrack, audioTrack, producerTransportRef.current, isProducingRef);
              isProducingRef.current = true;
              console.log("produciendo...")
            } 
          }

        const admin = await getActiveAdmin(roomId);
        socketRef.current.emit("admin-ready", admin, roomId);
      };
    };
    init();
  }, [stream]);

  const openBroadcasting = async () => {
      try {
        // 1. Obtener stream local
        setStream(true);
        setIsBroadcasting(true);

      } catch (error) {
        console.error("Error al iniciar llamada:", error);
      }
    };
  
    const hangUpBroadcasting = async () => {
      try {
        setStream(false);
        // stopLocalStream(localRef.current);
        setIsBroadcasting(false);
        offStreaming(email);
      } catch (error) {
        console.error("Error al colgar llamada:", error);
      }
    };
  
  return (
    <div className="space-y-6">
  {/* 

      {/* Transmisión en vivo */}
      <div className="bg-white p-4 rounded shadow-md">

        <h3 className="text-lg font-medium mb-2">Transmisión de Asamblea</h3>
        
        {stream ? (
          <>
            <div className="flex gap-4 mb-4">
              <video ref={localRef} autoPlay playsInline muted className="rounded border"></video>
            </div>
          </>
          
          ):(
            <>
            <p className="text-red-600 font-medium mb-4">No hay transmisión en vivo en este momento.</p>
            </>
          )
        }

        <div className="controls">
          {!isBroadcasting ? (
            <button
              onClick={openBroadcasting}
              className="bg-blue-600 text-blue px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              Iniciar transmisión
            </button> 
            ):(
            <button
              onClick={hangUpBroadcasting}
              className="bg-red-600 text-blue px-6 py-2 rounded hover:bg-red-700 disabled:bg-gray-400"
            >
              Detener transmisión
            </button>  
            )
          }
        </div>

        <h3 className="text-lg font-medium mb-2">Intervencion de copropietario</h3>
      
      {
        remote ? (
          <div className="flex gap-4 mb-4">
          <video ref={remoteRef} autoPlay playsInline muted className="rounded border"></video>
        </div>
        ):(
          <p className="text-red-600 font-medium mb-4">No hay intervencion en este momento.</p>
        )
      }
      </div>
    </div>
    )
    
};

export default VideoGeneral;
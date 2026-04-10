import React, { useState, useEffect, useRef, useContext } from "react";
import { UserContext } from "../../components/UserContext";
import { io } from "socket.io-client";
import { startLocalStream, stopLocalStream, getLocalStream, startProducing, 
        stopProducing, consumeProducer } from '../../hooks/webrtc-client';
import { registerViewer, listenToRequests, offStreaming } from '../../supabase-client';
import AppContext from '../../context/AppContext';
import * as mediasoupClient from "mediasoup-client";

const VideoGeneral = () => {
// const API_URL = import.meta.env.VITE_API_URL;
  const { apiUrl } = useContext(AppContext);

  const socketRef = useRef(null);
  const localRef = useRef();
  const remoteRef = useRef();
  const roomId = 'main-room';
  const { email, ownerData, login, checkApprove } = useContext(UserContext);
  const [isAllowed, setIsAllowed] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const ownerInfo = JSON.parse(localStorage.getItem("ownerInfo"));

  const deviceRef = useRef(null);
  const producerTransportRef = useRef(null);
  const consumerTransportRef = useRef(null);
  const isProducingRef = useRef(false);

  socketRef.current = io(`${apiUrl}`, {
    withCredentials: true,
    transports: ["websocket"]
  });

  useEffect(() => {
    let unsuscribeChannel;
    // 1️⃣ Validación temprana
    if (!email || !roomId || !ownerInfo?.email) {
      console.warn("Esperando datos para fetch...");
      return;
    }
    
    // setViewerReady(checkApprove); // sincroniza con el contexto
    
    const fetchData = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/recover-users-id`, { 
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ roomId: "main-room", userId: email })
        });

        if (!response.ok) throw new Error(`Error ${response.status}`);

        const userData = await response.json();
        const userById = userData.approvedUsersById || [];

        unsuscribeChannel  = listenToRequests(roomId, {componentId: 'VideoGeneral'}, (approver) => {
          
          if (approver.status === 'approved') {
            // console.log("Viewer aprobado via listener:", approver.user_id);
            if (!viewerReady) setViewerReady(true);
          }
        });

        if (userById.includes(email)) {
          console.log("Usuario aprobado para enviar stream...");
          if (!viewerReady) setViewerReady(true);
          
          console.log("✅ Permiso para transmitir otorgado"); //UNA VEZ QUE ES APROBADO INICIA AUTOMATICAMENTE
          // Asegurarnos de tener el transport de envío
          await createSendTransport();

          // Obtener stream local y empezar a producir
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
          
        } else {
          console.log("Usuario aun no aprobado");
        };

        //Recibe mensaje de que el usuario fue cancelado para transmitir por el admin y bloquea opción para transmitir
        socketRef.current.on("canceled", async ({ userId, roomId })=>{
          console.log(`viewer cancelado ${userId} en el cuarto ${roomId} para transmitir`);
          setViewerReady(false);
              // Detener producción si estaba activa
          if (isProducingRef) {
            await stopProducing();
          }
        });

      } catch (error) {
        console.error("Error fetching user", error);
      }
    };
    fetchData();
    return () => {
      if (unsuscribeChannel) unsuscribeChannel.removeChannel();
    }
    
  },[checkApprove, roomId, email, ownerInfo]);


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
    
    //corresponde a la libreria mediasoup-client
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
    
  //   let device;
  //   let consumerTransport;  // Para recibir streams
  //   let producerTransport;  // Para enviar streams (NUEVO)
  //   let localStream = null; // Stream local del viewer
  //   let isProducing = false;

  //   if (!socketRef.current) {
  //     console.error("❌ socket no inicializado");
  //     return;
  //   }

  //   //Recibe mensaje de que el usuario fue cancelado para transmitir por el admin y bloquea opción para transmitir
  //   socketRef.current.on("canceled", async ({ userId, roomId })=>{
  //     console.log(`viewer cancelado ${userId} en el cuarto ${roomId} para transmitir`);
  //     setViewerReady(false);
  //         // Detener producción si estaba activa
  //     if (isProducing) {
  //       await stopProducing();
  //     }
  //   });

  //   // Escuchar nuevos producers (otros usuarios transmitiendo)
  //   socketRef.current.on("new-producer", async ({ producerId, peerId, userId, username, kind }) => {
  //     try {
  //       console.log(`🎥 Nuevo producer: ${producerId} de ${peerId}, userId: ${userId}, username: ${username}, tipo: ${kind}`);
        
  //       // No consumir nuestro propio producer
  //       if (peerId === socketRef.current.id) {
  //         console.log("👤 Es mi propio producer, ignorando");
  //         return;
  //       }

  //       // Consumir el nuevo producer
  //       const consumerParams = await new Promise((resolve) => {
  //         socketRef.current.emit("consume", {
  //           roomId: roomId,
  //           producerId: producerId,
  //           rtpCapabilities: device.rtpCapabilities,
  //         }, resolve);
  //       });

  //       if (!consumerParams || consumerParams.error) {
  //         console.error("❌ Error en consume:", consumerParams);
  //         return;
  //       }

  //       const consumer = await consumerTransport.consume({
  //         id: consumerParams.id,
  //         producerId: consumerParams.producerId,
  //         kind: consumerParams.kind,
  //         rtpParameters: consumerParams.rtpParameters,
  //       });

  //       // Agregar track al stream remoto
  //       const stream = remoteRef.current.srcObject || new MediaStream();
  //       stream.addTrack(consumer.track);
  //       remoteRef.current.srcObject = stream;

  //       // Reanudar consumo
  //       socketRef.current.emit("resume", { consumerId: consumer.id });
        
  //       console.log(`✅ Consumiendo ${kind} de ${peerId}`);

  //     } catch (error) {
  //       console.error("❌ Error consumiendo stream:", error);
  //     }
  //   });

  //    // Inicializar como viewer (solo consumir)
  //   const initAsViewer = async () => {
  //     try {
  //       // 1. Unirse a room
  //     const { rtpCapabilities } = await new Promise(resolve => {
  //       socketRef.current.emit("joinRoom", { roomId: "main-room" }, resolve);
  //     });

  //     // 2. Crear device
  //     device = new mediasoupClient.Device();
  //     await device.load({ routerRtpCapabilities: rtpCapabilities });

  //     // 3. Crear transport para recibir (CONSUMER)
  //     const consumerTransportParams = await new Promise(resolve => {
  //       socketRef.current.emit("createTransport", { roomId: roomId }, resolve);
  //     });

  //     if (!consumerTransportParams || consumerTransportParams.error) {
  //       console.error("❌ Error creando consumer transport:", consumerTransportParams);
  //       return;
  //     }

  //     consumerTransport = device.createRecvTransport(consumerTransportParams);

  //     // Conectar consumer transport
  //     consumerTransport.on("connect", ({ dtlsParameters }, callback) => {
  //       socketRef.current.emit("connectTransport", {
  //         transportId: consumerTransport.id,
  //         dtlsParameters
  //       });
  //       callback();
  //     });

  //     console.log("✅ Consumer transport inicializado correctamente");

  //         // Aquí puedes empezar a consumir streams existentes
  //     await consumeExistingStreams();
    

  //     } catch (error) {
  //       console.error("❌ Error inicializando viewer:", error);
  //     }
  //   };

        

  //   // Inicializar como broadcaster (enviar y recibir)
  //   const initAsBroadcaster = async () => {
  //     try {
  //       // 1. Unirse a room
  //       const { rtpCapabilities } = await new Promise(resolve => {
  //         socketRef.current.emit("joinRoom", { roomId: "main-room" }, resolve);
  //       });

  //       // 2. Crear device
  //       device = new mediasoupClient.Device();
  //       await device.load({ routerRtpCapabilities: rtpCapabilities });

  //       // 3. Crear transport para recibir (CONSUMER)
  //       const consumerTransportParams = await new Promise(resolve => {
  //         socketRef.current.emit("createTransport", { roomId: roomId }, resolve);
  //       });

  //       if (!consumerTransportParams || consumerTransportParams.error) {
  //         console.error("❌ Error creando consumer transport:", consumerTransportParams);
  //         return;
  //       }

  //       consumerTransport = device.createRecvTransport(consumerTransportParams);

  //       consumerTransport.on("connect", ({ dtlsParameters }, callback) => {
  //         socketRef.current.emit("connectTransport", {
  //           transportId: consumerTransport.id,
  //           dtlsParameters
  //         });
  //         callback();
  //       });

  //       // 4. Crear transport para enviar (PRODUCER)
  //       const producerTransportParams = await new Promise(resolve => {
  //         socketRef.current.emit("createTransport", { roomId: roomId }, resolve);
  //       });

  //       if (!producerTransportParams || producerTransportParams.error) {
  //         console.error("❌ Error creando producer transport:", producerTransportParams);
  //         return;
  //       }

  //       producerTransport = device.createSendTransport(producerTransportParams);

  //       // Configurar producer transport
  //       producerTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
  //         socketRef.current.emit("connectTransport", {
  //           transportId: producerTransport.id,
  //           dtlsParameters
  //         }, (response) => {
  //           if (response?.error) {
  //             errback(new Error(response.error));
  //           } else {
  //             callback();
  //           }
  //         });
  //       });

  //       producerTransport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
  //         try {
  //           const { id } = await new Promise((resolve, reject) => {
  //             socketRef.current.emit("produce", {
  //               transportId: producerTransport.id,
  //               kind,
  //               rtpParameters
  //             }, (response) => {
  //               if (response.error) {
  //                 reject(new Error(response.error));
  //               } else {
  //                 resolve(response);
  //               }
  //             });
  //           });
  //           callback({ id });
  //         } catch (error) {
  //           errback(error);
  //         }
  //       });

  //       console.log("✅ Transports inicializados correctamente");
        
  //       // Aquí puedes empezar a producir tu stream
  //       await startProducing();
        
  //     } catch (error) {
  //       console.error("❌ Error inicializando broadcaster:", error);
  //     }
  //   };




  //   // Inicialización principal
  //   const init = async () => {
  //     if (!ownerInfo?.email || !roomId) return;

  //     await registerViewer(roomId, email);
      
  //     // Primero inicializar como viewer
  //     await initAsViewer();
      
  //     // Opcional: auto-solicitar permiso para transmitir
  //     socketRef.current.emit("request-stream", { userId: email, roomId });
  //   };

  //   // Escuchar cuando el admin permite transmitir
  //   socketRef.current.on("stream-ready", async () => {
      
  //   });

  //   // Iniciar a consumir
  //   init();

  //   // Cleanup al desmontar
  //   return () => {
  //     if (consumerTransport) consumerTransport.close();
  //     if (producerTransport) producerTransport.close();
  //     if (localStream) {
  //       localStream.getTracks().forEach(track => track.stop());
  //     }
  //     stopProducing();
  //   };
  // }, [roomId, ownerInfo, email]);


  const openCall = async () => {
    try {
      await startLocalStream(roomId, ownerInfo.email, localRef.current);
      socketRef.current.emit("user-ready", ownerInfo.email, roomId);

      setIsAllowed(true);
    } catch (error) {
        console.error("Error al iniciar llamada:", error);
    }
    return () => {
      socketRef.current.disconnect();
    }
  }

  const closeCall = () => {
    stopLocalStream(localRef.current);
    setIsAllowed(false);
    offStreaming(email);
    // if (viewerReady) setViewerReady(false);
  }

  return (
    <div className="space-y-6">
      {/* Transmisión en vivo */}
      <div className="bg-white p-4 rounded shadow-md">

        <h2 className="text-xl font-semibold mb-2">Asamblea en vivo</h2>
        <video ref={remoteRef} autoPlay playsInline className="w-full rounded border"
        ></video>

        <h2 className="text-xl font-semibold mb-2">Intervención del copropietario</h2>
        {viewerReady ? (
          <>
            <video ref={localRef} autoPlay playsInline className="w-full rounded border"
            ></video>

            <div className="controls">
              {!isAllowed ? (
                <button
                  onClick={openCall}
                  className="bg-blue-600 text-blue px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Iniciar llamada
                </button> 
                ):(
                <button
                  onClick={closeCall}
                  className="bg-red-600 text-blue px-6 py-2 rounded hover:bg-red-700 disabled:bg-gray-400"
                >
                  Detener llamada
                </button>  
                )
              }
            </div>
          </>
        ):(
          <p>No hay petición de intervención</p>
        )

        }

      </div>
    </div>
    )
};

export default VideoGeneral;
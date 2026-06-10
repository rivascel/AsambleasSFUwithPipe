import React, { useState, useEffect, useRef, useContext } from "react";
import { UserContext } from "../../components/UserContext";
import { getLocalStream, listenForApprovals } from "../../hooks/webrtc-manager";
import AppContext from '../../context/AppContext';
import * as mediasoupClient from "mediasoup-client";
import { getSocket  } from "../../hooks/socket";
import useVideoQuality from "../../hooks/useVideoQuality";
import useVisibility from "../../hooks/useVisibility";
  
const VideoGeneral = () => {
  const { apiUrl } = useContext(AppContext);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const localRef = useRef();
  const remoteRef = useRef();
  const quality = useVideoQuality(remoteRef);
  const isVisible = useVisibility(remoteRef);
  const [currentQuality, setCurrentQuality] = useState(null);

  const { email } = useContext(UserContext);
  const [stream, setStream] = useState(false);
  const roomId="main-room";
  const [remote, setRemote] = useState(false);
  const ownerInfo = JSON.parse(localStorage.getItem("ownerInfo"));

  const socketRef = useRef(null);
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);

  const producersRef = useRef(new Map());
  const consumersRef = useRef([]);
  const roleRef = useRef("admin");
  const pendingProducersRef=useRef(new Map()); // producerId -> { socketId, kind, role }
  

  const initializedRef = useRef(false); // 🔥 evita doble ejecución (React Strict)
  const rtpCapabilitiesRef = useRef(null);
  const stateRef = useRef("IDLE");

 const encodings = [
  { maxBitrate: 100000, scaleResolutionDownBy: 4 },
  { maxBitrate: 300000, scaleResolutionDownBy: 2 },
  { maxBitrate: 900000, scaleResolutionDownBy: 1 }
];

  //escuchar aprobaciones de viewers para activar pantalla
  useEffect(() => {
      if (!roomId) return;
      if (!socketRef.current || !roomId || !email) return;

      // const socket = socketRef.current;

      //2. Función que escucha si existe una aprobación de viewer para activar pantalla y escucha todas las señales
        const init = async () => {
          const exists = listenForApprovals(roomId);

          if (exists) {
            setRemote(true);
          } else {
            return;
          };

        }
        init();
        
      //3. recibe mensaje que existe nuevo viewer
      // socketRef.current.on("listen-user", async ({ userId, roomId })=>{
        
      //   if (!stream) {
      //     console.log(`los siguientes usuarios estan conectados ${userId} en el cuarto ${roomId} pero no hay stream local para crear oferta`);
      //     return;
      //   }
      // });

      // return () => {
      //     socketRef.current.off("listen-user");
      //   }
    },[]);

  // 1. Estado central (useRef + estado lógico)
  const setState = (newState) => {
    console.log(`🧭 Estado: ${stateRef.current} → ${newState}`);
    stateRef.current = newState;
  };

  // 3. INIT FLOW (el corazón)
  const initFlow = async () => {
    await joinRoom();
    await loadDevice();

    await setupConsumerFlow();
  };

  const startProducing = async () => {
    if (sendTransportRef.current) {
      console.warn("⚠️ Ya estás produciendo");
      return;
    }
    await createSendTransport();
    await produce();
  }

  const stopProducing = async () => {
    // cerrar producers
    // producersRef.current.forEach(p => p.close());
    producersRef.current.clear();

    // cerrar transport
    if (sendTransportRef.current) {
      sendTransportRef.current.close();
      sendTransportRef.current = null;
    }
    // apagar cámara
    if (localRef.current?.srcObject) {
      localRef.current.srcObject.getTracks().forEach(t => t.stop());
      localRef.current.srcObject = null;
    }

    console.log("🛑 Producción detenida");
  };

  // 4. joinRoom
  const joinRoom = () => {
    return new Promise((resolve) => {
      socketRef.current.emit("join-room", { roomId, userid:email }, (data) => { 
        rtpCapabilitiesRef.current = data.rtpCapabilities;
        console.log("✅ Unido a la sala", roomId);
        setState("JOINED");
        resolve();
      });
    });
    
  };

  // 5. loadDevice
  const loadDevice = async () => {
    const device = new mediasoupClient.Device();

    await device.load({ routerRtpCapabilities: rtpCapabilitiesRef.current  });

    deviceRef.current = device;
    setState("DEVICE_LOADED");
  };

  // createSendTransport
  const createSendTransport = () => {
    return new Promise((resolve, reject) => {
      socketRef.current.emit(
        "createTransport", { consumer: false, roomId }, (params) => 
        {
          // Verificar que params tiene los datos necesarios
          if (!params.iceParameters || !params.iceCandidates || !params.dtlsParameters) {
            console.error("❌ Params incompletos:", params);
            reject(new Error("Missing required transport parameters"));
            return;
          }

          const transport = deviceRef.current.createSendTransport(params);

          sendTransportRef.current = transport;

          transport.on("connect", ({ dtlsParameters }, callback, errback) => {
             console.log("🔌 SendTransport conectando...");

            socketRef.current.emit(
              "connectTransport",
              { transportId: transport.id, dtlsParameters, roomId }, ({ error }) => {
                  if (error) {
                    console.error("❌ Error conectando transport:", error);
                    errback(error);
                  } else {
                    console.log(
                      "✅ sendTransport DTLS conectado" 
                    );
                    callback();
                  }
                }
            );
          });

          transport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
            
            console.log("📡 produce event:", kind);

            try {
              const { id } = await emitPromise("produce", {
                transportId: transport.id,
                kind,
                rtpParameters,
                roomId,
                role: "admin"
              });
              
              callback({ id }); 
              console.log("✅ Produce exitoso", id);
            } catch (error) {
              console.error("❌ Error en produce:", error);
              errback(error);
            }
            
          });

          // Manejar cambios de estado

          // Monitoreo de estados
          transport.on("connectionstatechange", (state) => {
            console.log(`📡 5. connectionstatechange: ${state}`);
            
            if (state === "connected") {
              console.log("✅ 6. Transport CONECTADO - Resolviendo promesa!");
              setState("SEND_TRANSPORT_READY");
              // resolve();
            }
            
            if (state === "failed" || state === "closed" || state === "disconnected") {
              console.error(`❌ Transport ${state}`);
              reject(new Error(`Transport ${state}`));
            }
          });

          sendTransportRef.current = transport;

          resolve();
          
        }
      );
    });
  };

  const emitPromise = (event, data) => {
    return new Promise((resolve, reject) => {
      socketRef.current.emit(event, data, (response) => {
        if (response && response.error) {
          reject(response.error);
        } else {
          resolve(response);
        }
        });
    });
  };

  // produce (clave)
  const produce = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localRef.current.srcObject = stream;

    for (const track of stream.getTracks()) {
      const isVideo = track.kind === "video";

      const producer = await sendTransportRef.current.produce({ 
        track,
        ...(isVideo && {
          encodings,
          codecOptions: {
            videoGoogleStartBitrate: 1000,
          },
        }),
        appData: {
          peerId: socketRef.current.id,            // Metadata adicional
        } 
      });
       producersRef.current.set(producer, {socketId: socketRef.current.id, kind: track.kind });
    }

    console.log("🎥 Produciendo...");
    setState("PRODUCING");
  };

  // 7. FLUJO VIEWER
  const setupConsumerFlow = async () => {
    await createRecvTransport();
    listenForNewProducers();
    await consumeExisting();
    
  };

  // createRecvTransport
  const createRecvTransport = () => {

    return new Promise((resolve, reject) => {
      socketRef.current.emit("createTransport", { consumer: true, roomId, email },

        (params) => {

          const transport =  deviceRef.current.createRecvTransport(params);
          recvTransportRef.current = transport;


          transport.on("connect", ({ dtlsParameters }, callback, errback) => {
            console.log("📡 inicia connect recvTransport");

            socketRef.current.emit("connectTransport", { transportId: transport.id, dtlsParameters, roomId }, ({ error }) => {

                if (error) {
                  console.error("❌ Error en connectTransport:", error);
                  isConnecting = false; // Resetear para permitir reintento si falla
                  return errback(error);
                }
                console.log("✅ recvTransport DTLS conectado");

                callback();
                // No reseteamos isConnecting a false porque ya está conectado permanentemente
              } 
            );
          });

          transport.on("connectionstatechange",(state) => {

            console.log("📡 recvTransport state:", state);

            if (state === "connected") {
              console.log("✅ 6. Transport CONECTADO - Resolviendo promesa!");
              setState("RECV_TRANSPORT_READY");
            }

            if (state === "failed" || state === "closed" || state === "disconnected") {
              console.error(`❌ Transport ${state}`);
              reject(new Error(`Transport ${state}`));
            }
          });

            // ✅ GUARDAR transport YA
              // recvTransportRef.current = transport;


            // ✅ RESOLVER YA
            // resolve();
          resolve(transport);
        }
      );
    });
  };

  // consumir existentes
  const consumeExisting = async () => {
    const producers = await new Promise((resolve) => {
      socketRef.current.emit("getProducers", { roomId }, resolve);
      console.log("📡 Solicitando productores existentes para la sala", roomId);
    });

     console.log("📡 respuesta getProducers", producers);

    if (producers === null || producers.length === 0) {
      console.log("📡 No hay productores disponibles");
      return;
    }

    console.log("producers:", producers);

    for (const { producerId, kind, role } of producers) {
        console.log("producer:", producers);

      if (producersRef.current.has(producerId)) continue; 

      producersRef.current.set(producerId, { kind, role: role });

      console.log(`📡 Consumiendo ${kind}:`, producerId);
      await consume({ producerId, kind, role: role }); 
      
    }
    setState("CONSUMING_EXISTING");
  };

  // 🎥 consume
    // const consume = async ({producerId, kind, role}) => {
    //   const data = await new Promise((resolve) => {
    //     socketRef.current.emit(
    //       "consume",
    //       {
    //         producerId,
    //         rtpCapabilities: deviceRef.current.rtpCapabilities,
    //         roomId,
    //         email
    //       },
    //       resolve
    //     );
    //   });

    //   if (!data) {
    //     console.warn("❌ Productor no encontrado:", producerId);
    //     return;
    //   }

    //   console.log("📦 Datos recibidos:", data);
      
    //   const consumer = await recvTransportRef.current.consume({
    //     id: data.id,
    //     producerId: data.producerId,
    //     kind: data.kind,
    //     rtpParameters: data.rtpParameters,
    //   });

    //   console.log("🎥 Consumer creado frontend");
    //   console.log("🎥 kind:", data.kind);
    //   console.log("🎥 track:", consumer.track.kind);


    //   await new Promise((resolve)=>{
    //     socketRef.current.emit("resume-consumer", 
    //       { consumerId: consumer.id }, resolve );
    //   })

    //   consumersRef.current.push(consumer);

    //   // 🔥 1. Asegurar que tenemos un MediaStream limpio
    //   if (!remoteRef.current.srcObject) {
    //       remoteRef.current.srcObject = new MediaStream();
    //   }

    //   const stream = remoteRef.current.srcObject;

    //   // 🔥 2. ELIMINAR tracks antiguos del mismo tipo para evitar el acumulado (el Array(4) que viste)
    //   const existingTracks = stream.getTracks().filter(t => t.kind === data.kind);
    //   existingTracks.forEach(track => {
    //       track.stop(); // Detener el hardware
    //       stream.removeTrack(track); // Quitar del stream
    //   });

    //   // 🔥 3. Agregar el nuevo track limpio

    //   consumersRef.current.forEach(consumer => {
    //     if (!stream.getTracks().find(t => t.id === consumer.track.id)) {
    //       stream.addTrack(consumer.track);
    //     }
    //   });

    //   // ... después de stream.addTrack(consumer.track)
    //   if (remoteRef.current) {
    //       // Forzar que el elemento reconozca el nuevo stream
    //       remoteRef.current.srcObject = stream;
          
    //       // IMPORTANTE: Algunos navegadores necesitan esto para despertar el renderizado
    //       remoteRef.current.load(); 

    //       remoteRef.current.play()
    //           .then(() => console.log("▶️ Reproducción iniciada con éxito"))
    //           .catch(err => {
    //               console.error("❌ Error en play():", err);
    //               // Si falla, intentamos mutearlo de nuevo por si es política de autoplay
    //               remoteRef.current.muted = true;
    //               remoteRef.current.play();
    //           });
    //   }

    //   console.log(`✅ Track de ${data.kind} actualizado. Total tracks:`, stream.getTracks().length);

    //   // 🔥 4. Forzar visibilidad y reproducción
    //   remoteRef.current.muted = true; // Obligatorio para video autoplay
    //   remoteRef.current.playsInline = true;

    //   remoteRef.current.play().catch(e => console.warn("Error play:", e));

    // };


    const consume = async ({producerId, kind, role}) => {

    try {
      const data = await new Promise((resolve, reject) => {

        socketRef.current.emit("consume", {
            producerId,
            rtpCapabilities: deviceRef.current.rtpCapabilities,
            roomId,
            role
          },
          (response) => {
            if (response?.error) {
              reject(new Error(response.error));
            } else {
              resolve(response);
            }
          }
        );
      });

      await createAndSetupConsumer(data);

    } catch (error) {

      console.error(
        "Error consumiendo:",
        error
      );
    }
  };

  // Función auxiliar para crear y configurar el consumer
  
  const createAndSetupConsumer = async (consumerData) => {
    // Limpiar consumer existente del mismo tipo
    const existingConsumer = consumersRef.current.find(
      c => c.kind === consumerData.kind
    );

    if (existingConsumer) {
      existingConsumer.close();
      consumersRef.current = consumersRef.current.filter(
        c => c.id !== existingConsumer.id
      );
    }
    
    // Crear consumer con el transport (puede ser el mismo recvTransport)
    const consumer = await recvTransportRef.current.consume({ 
      id: consumerData.id,
      producerId: consumerData.producerId,
      kind: consumerData.kind,
      rtpParameters: consumerData.rtpParameters,
      role: consumerData.role,
    });

    console.log(`🎥 Consumer creado (${consumerData.isPipe ? 'vía pipe' : 'directo'})`);
    console.log("🎥 kind:", consumerData.kind);
    console.log("🎥 track:", consumer.track.kind);
    console.log("🎥 role:", consumerData.role);

    // Resumir el consumer
    await new Promise((resolve) => {
      socketRef.current.emit("resume-consumer", 
        { consumerId: consumer.id }, resolve );
    });

    consumersRef.current.push(consumer);

    consumer.producerRole = consumerData.role;

    const targetVideo = consumer.producerRole === "admin" ? remoteRef.current : remoteRefTemp.current;

    if (!targetVideo.srcObject) {
      targetVideo.srcObject = new MediaStream();
    }

    const stream = targetVideo.srcObject;
    
    // Eliminar tracks antiguos del mismo tipo
    const existingTracks = stream.getTracks().filter(t => t.kind === consumerData.kind);
    
    existingTracks.forEach(track => { stream.removeTrack(track); });


    // Agregar el nuevo track
    consumersRef.current
      .filter(c => c.producerRole === consumer.producerRole)
      .forEach(consumer => {
        if (!stream.getTracks().find(t => t.id === consumer.track.id)) {
          stream.addTrack(consumer.track);
        }
      });

    // stream.addTrack(consumer.track);

    // Configurar y reproducir el remote cuando recibe del producto admin
    if (targetVideo && recvTransportRef.current.connectionState === 'connected') {
      try {
        targetVideo.muted = true;
        targetVideo.playsInline = true;

        if (targetVideo.srcObject !== stream) {
          targetVideo.srcObject = stream;
        }

        await targetVideo.play();
        console.log("▶️ Reproducción iniciada con éxito para admin");
        
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error("Error real de reproducción:", err);
        }
      }
    } else {
      // remoteRef.current.srcObject.getTracks().forEach(t => t.stop());

      targetVideo.srcObject = null;

    }

    console.log(`✅ Track de ${consumerData.kind} actualizado. Total tracks:`, stream.getTracks().length);
      
    return consumer;
  };


  // 🔴 nuevos producers en tiempo real
  // const listenForNewProducers = () => {
  //   socketRef.current.on("new-producer", async ({ producerId }) => {
  //     console.log("🆕 Nuevo producer:", producerId);
  //     await consume(producerId);
  //   });
  // };

  const listenForNewProducers = () => {
    socketRef.current.on("new-producer", async ({ producerId, producerSocketId, kind, role }) => {
      console.log("🆕 Nuevo producer:", producerId);

      const producerData = { id: producerId, socketId: producerSocketId, kind, role };
      
      // pendingProducersRef.current.set(producerData);

      if (producersRef.current.has(producerId)) return;

      producersRef.current.set(producerId, { socketId: producerSocketId, kind });
      console.log("producersRef:", producersRef);

      //=============
      if (recvTransportRef.current?.connectionState === 'connected' && producerId) {
        
        await consume({ producerId, kind, role });
        pendingProducersRef.current.clear();
      } else {
        // Si no está conectado, guardarlo para procesar después
        console.log(`⏳ Transport no conectado, guardando producer ${producerId}, kind ${kind}, role ${role} `);
        pendingProducersRef.current.set( producerId, {producerId, producerSocketId, kind, role } );
        createConsumerWithRetry(producerId, kind, role );
      };
      //=============

      return () => {
        socketRef.current.off("new-producer");
      };
    })
  };


  const createConsumerWithRetry = async (producerId, kind, role, maxRetries = 5) => {
    let retries = 0;
    
    while (retries < maxRetries) {
      console.log("recvTransport state:", recvTransportRef.current?.connectionState);

      if (recvTransportRef.current?.connectionState === 'connected') {
        return await consume({ producerId, kind, role })
      }
      
      console.log(`⏳ Esperando transport... intento ${retries + 1}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, 500));
      retries++;
    }
    
    console.error(`❌ No se pudo crear consumer después de ${maxRetries} intentos`);
    return null;
  };

const updateConsumers = () => {
  if (!consumersRef.current.length) return;

  consumersRef.current.forEach((consumer) => {
    if (!isVisible) {
      socketRef.current.emit("pause-consumer", {
        consumerId: consumer.id,
      });
      return;
    }

    socketRef.current.emit("resume-consumer", {
      consumerId: consumer.id,
    });

    socketRef.current.emit("set-quality", {
      consumerId: consumer.id,
      quality,
    });
  });
};
  //==============================USE EFFECTS==============================
    useEffect(() => {
    if (!deviceRef.current) {
      console.warn("⚠️ Dispositivo no cargado, no se puede iniciar flujo");
      return;
    }
    if (stream) {
        console.log("activando flujo de productor");
        startProducing();
      } else {
        console.log("Desactivando flujo de productor");
        stopProducing();
      }
  },[stream]);

    useEffect(() => {
      updateConsumers();
  
    }, [quality, isVisible]);


  // 8. useEffect correcto (ANTI-CAOS)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const socket = getSocket(apiUrl);
    socketRef.current = socket;

    socketRef.current.on("connect", async () => {
      console.log("🟢 Conectado:", socket.id);
      await initFlow();
    });

    if (remoteRef.current) {
      remoteRef.current.srcObject = null;

      socketRef.current.on("producer-closed", () => {
        console.log("📴 Stream detenido");
      
      });
    }
  }, []);

  const openBroadcasting = async () => {
      try {
        // 1. Obtener stream local
        setStream(true); //Inicia useEffect para generar proceso de streaming
        setIsBroadcasting(true);

      } catch (error) {
        console.error("Error al iniciar llamada:", error);
      }
  };

  const hangUpBroadcasting = async () => {
    try {
      setStream(false);
      setIsBroadcasting(false);
    } catch (error) {
      console.error("Error al colgar llamada:", error);
    }
  };
    
  return (
    <div className="space-y-6">
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
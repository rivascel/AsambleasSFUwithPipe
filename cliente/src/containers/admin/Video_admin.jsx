import React, { useState, useEffect, useRef, useContext } from "react";
import { UserContext } from "../../components/UserContext";
import { getLocalStream, listenForApprovals } from "../../hooks/webrtc-manager";
import AppContext from '../../context/AppContext';
import * as mediasoupClient from "mediasoup-client";
import { getSocket  } from "../../hooks/socket";
import useVideoQuality from "../../hooks/useVideoQuality";
import useVisibility from "../../hooks/useVisibility";
import { listenToRequests } from "../../../src/supabase-client";
// import sinSenalImage from '..../assets/img/sin_senal.png'; 
// import sin from '../../assets'

const VideoGeneral = () => {
  const { apiUrl } = useContext(AppContext);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const localRef = useRef();
  const remoteRef = useRef();
  // const remoteRefTemp = useRef();
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
  const remoteProducerRef = useRef(new Map()); // Para almacenar el producerId del admin
   const consumingRef = useRef(new Set());
  const consumersRef = useRef([]);
  const roleRef = useRef("admin");
  const pendingProducersRef=useRef(new Map()); // producerId -> { socketId, kind, role }

  const imageRef = useRef(null);

  const [isLive, setIsLive] = useState(false);
  // const [isLiveAttended, setIsLiveAttended] = useState(false);
  const [isLiveOwner, setIsLiveOwner] = useState(false);
  

  const initializedRef = useRef(false); // 🔥 evita doble ejecución (React Strict)
  const rtpCapabilitiesRef = useRef(null);
  const stateRef = useRef("IDLE");
  const [socketReady, setSocketReady] = useState(false);
  let socket;

 const encodings = [
  { maxBitrate: 100000, scaleResolutionDownBy: 4 },
  { maxBitrate: 300000, scaleResolutionDownBy: 2 },
  { maxBitrate: 900000, scaleResolutionDownBy: 1 }
];

  //escuchar aprobaciones de viewers para activar pantalla
  useEffect(() => {
      if (!roomId) return;
      if (!socketRef.current || !roomId || !email) return;

      
        const approvedViewers = new Set();
        const subscription = listenToRequests( roomId, { componentId: "VideoGeneral" },
          (request) => {
            if (request?.status === "approved") {
              approvedViewers.add(request.user_id);
              setRemote(true);
              setIsLiveOwner(true);
            }
          }
        );

        return () => {
          subscription.removeChannel();
        };


        

    },[roomId]);

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
    setIsLive(true);
  }

    useEffect(() => {
      const handler = ( producerId ) => {
  
        console.log("remoteProducerRef en useEffect", remoteProducerRef);
  
        const producerData = remoteProducerRef.current.get(producerId);
        if (producerData) {
          const { kind, role } = producerData;
        }
  
        if (!producerData) return;
  
        remoteProducerRef.current.delete(producerId);

        consumersRef.current = consumersRef.current.filter( (c) => c.producerId !== producerId );
  
        const isOwner = producerData.role === "owner";
        console.log("es owner", isOwner);
  
        if (isOwner) {
          setIsLive(false);
        } else {
          // setIsLiveAttended(false);
          setIsLiveOwner(false);
        }
      };
  
      if (socketRef.current) {
        socketRef.current.on("producerClosed", handler );
      } else {
      console.log("❌ socketRef.current es null");
    }
  
      return () => {
        socketRef.current.off("producerClosed", handler);
      };
  }, []);
  

  const stopProducing = async () => {
    // cerrar producers
    console.log("PRODUCERS REF:", producersRef);
    producersRef.current.forEach((producerInfo, producerId) => {
       new Promise(resolve => {
        socketRef.current.emit("stopProducer",  { roomId, producerId }, resolve);
      })
    });


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

    // return () => {
    //   socketRef.current.off("producerClosed");
    // }

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
      //  producersRef.current.set(producer.id, {socketId: socketRef.current.id, kind: track.kind });
        // console.log("producersRef en produce", producersRef)
      //  console.log("🎥 Producer creado:", producer.id, "kind:", track.kind);
      //  console.log(producersRef.current.has(producer));      // true
        // console.log(producersRef.current.has(producer.id));   // false

        //igual al de cliente
        producersRef.current.set(producer, {socketId: socketRef.current.id, kind: track.kind });
        console.log("producersRef en produce", producersRef)

        
       
    }
    
    console.log("🎥 Produciendo...");
    setState("PRODUCING");
  };

  // 7. FLUJO VIEWER
  const setupConsumerFlow = async () => {
        listenForNewProducers();
    await createRecvTransport();

    await consumeExisting();
    
  };

  // createRecvTransport
  const createRecvTransport = () => {

    return new Promise((resolve, reject) => {
      socketRef.current.emit("createTransport", { consumer: true, roomId, email },

      (params) => {

        const transport =  deviceRef.current.createRecvTransport(params);
        recvTransportRef.current = transport;

        console.log("✅ recvTransport creado", transport.id);

        transport.on("connect", ({ dtlsParameters }, callback, errback) => {
          console.log("📡 inicia connect recvTransport");

          socketRef.current.emit("connectTransport", { 
            transportId: transport.id, dtlsParameters, roomId }, ({ error }) => {

              if (error) {
                console.error("❌ Error en connectTransport:", error);
                return errback(error);
              }
              console.log("✅ recvTransport DTLS conectado");

              callback();
              // No reseteamos isConnecting a false porque ya está conectado permanentemente
            } 
          );
        });

        transport.on("connectionstatechange", async (state) => {

        console.log("📡 recvTransport state:", state);

        if (state === "connected") {
          console.log("✅ 6. Transport CONECTADO - Resolviendo promesa!");
          setState("RECV_TRANSPORT_READY");

          // Procesar productores pendientes
          for (const producer of pendingProducersRef.current.values()) {
              console.log("🔥 Voy a consumir", producer);

            try {
              // await consume({ producerId, kind, role });
              await consume(producer);

            } catch (err) {

              console.error(
                "Error consumiendo producer pendiente",
                producer.producerId,
                err
              );
            }
          }
          pendingProducersRef.current.clear();
        }
          

        if (state === "failed" || state === "closed" || state === "disconnected") {
              console.error(`❌ Transport ${state}`);
              reject(new Error(`Transport ${state}`));
            }
        });

        // ✅ RESOLVER YA
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

      if (remoteProducerRef.current.has(producerId) && role === "owner") continue; 

      remoteProducerRef.current.set(producerId, { kind, role: role });

      console.log(`📡 Consumiendo ${kind}:`, producerId);
      await consume({ producerId, kind, role: role }); 
      
    }
    setState("CONSUMING_EXISTING");
  };

 

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
      c => c.kind === consumerData.kind && c.producerRole === consumerData.role
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
      socketRef.current.emit("resume-consumer", { consumerId: consumer.id }, resolve ); });

    consumer.producerRole = consumerData.role;
    consumersRef.current.push(consumer);

  
    // const targetVideo = consumer.producerRole === "admin" ? localRef.current : remoteRef.current;
    const targetVideo = remoteRef.current;

    if (!targetVideo.srcObject) {
      setIsLiveOwner(true);
      console.log("4. creando MediaStream");
      targetVideo.srcObject = new MediaStream();
    }

    const stream = targetVideo.srcObject;

    // Eliminar tracks antiguos del mismo tipo
    stream.getTracks().filter(t => t.kind === consumerData.kind)
                 .forEach(t => stream.removeTrack(t));
    

    // Agregar el nuevo track
    stream.addTrack(consumer.track);

    // Configurar y reproducir el remote cuando recibe del producto admin
    // 9. Reproducir
    try {
      targetVideo.muted = true;
      targetVideo.playsInline = true;
      await targetVideo.play();
      console.log(`▶️ Reproducción iniciada: ${consumerData.kind} [${consumerData.role}]`);
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Error de reproducción:", err);
      }
    }
      
    console.log(`✅ Track ${consumerData.kind} listo. Total tracks:`, stream.getTracks().length);

    return consumer;
  };


 const listenForNewProducers = () => {
    
    socketRef.current.on("new-producer", async (data) => {

      if (remoteProducerRef.current.has(data.producerId)) return;

      try {
        console.log("rol del productor que esta transmitiendo", data.role);

        remoteProducerRef.current.set(data.producerId, {
          kind: data.kind,
          role: data.role
        } );


        const producerData = remoteProducerRef.current.get(data.producerId);
        if (producerData) {
          const { kind, role } = producerData; 
          console.log("role en admin", role);
        }


        console.log(`oye tengo un productor nuevo con rol ${data.producerId} ${data.role}  ` );


        await consume({
          producerId:data.producerId, 
          kind: data.kind, 
          role: data.role
        });

      } catch (err) {
        console.error("Error consumiendo producer", err);
      } finally {
        consumingRef.current.delete(data.producerId);
      }
    });
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
              <video ref={localRef} autoPlay playsInline muted className="rounded border"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: isLive ? 'block' : 'none' }}
              ></video>
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
            <video ref={remoteRef} autoPlay playsInline muted className="rounded border"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: isLiveOwner ? 'block' : 'none' }}
            ></video>

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
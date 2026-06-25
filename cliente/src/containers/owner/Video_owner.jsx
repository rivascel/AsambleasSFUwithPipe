import React, { useState, useEffect, useRef, useContext } from "react";
import { UserContext } from "../../components/UserContext";
import { io } from "socket.io-client";
import { listenToRequests, offStreaming, getPendingRequestById, getApprovedUserById } from '../../supabase-client';

import AppContext from '../../context/AppContext';
import { getSocket  } from "../../hooks/socket";
import * as mediasoupClient from "mediasoup-client";
import useVideoQuality from "../../hooks/useVideoQuality";
import useVisibility from "../../hooks/useVisibility";
import { useRoomState } from "../../hooks/useRoomState";

// import {image} from "../../assets/img/sin_senal";


const VideoGeneral = () => {
  const userRoutersMap = useRef(new Map()); // userId -> routerId
  const [isAllowed, setIsAllowed] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const { apiUrl } = useContext(AppContext);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const localRef = useRef();
  const remoteRef = useRef();
  const remoteRefTemp = useRef();
  const quality = useVideoQuality(remoteRef);
  const isVisible = useVisibility(remoteRef);
  const [currentQuality, setCurrentQuality] = useState(null);

  const { email, ownerData, login, checkApprove } = useContext(UserContext);
  const [stream, setStream] = useState(false);
  const roomId="main-room";
  const [remote, setRemote] = useState(false);
  const ownerInfo = JSON.parse(localStorage.getItem("ownerInfo"));

  const socketRef = useRef(null);
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);

  const producersRef = useRef(new Map()); // producerId -> { socketId, kind }
  
  const remoteProducerRef = useRef(new Map()); // Para almacenar el producerId del admin
  const consumingRef = useRef(new Map());
  const consumersRef = useRef([]);
  const roleRef = useRef("owner"); // Guardar el rol actual

  const initializedRef = useRef(false); // 🔥 evita doble ejecución (React Strict)
  const rtpCapabilitiesRef = useRef(null);
  const myRouterIdRef = useRef(null); // Guardar mi router asignado
  const producerRouterIdRef=useRef(null);;
  const consumerRouterIdsRef=useRef(null);
  const pendingProducersRef=useRef(new Map()); // producerId -> { socketId, kind, role }

  const [peers, setPeers] = useState([]);

  const [isLive, setIsLive] = useState(false);
  const [isLiveAttended, setIsLiveAttended] = useState(false);
  const [isLiveOwner, setIsLiveOwner] = useState(false);
  const imageRef = useRef(null);
  const [socketReady, setSocketReady] = useState(false);
  let socket;


 // Usar el hook de estado de la sala
  const { getUserRouter,getMyRouter, areInSameRouter, myRouterId, producerRouterId, consumerRouterIds } = useRoomState(socketRef, roomId);

  const stateRef = useRef("IDLE");

   const encodings = [
  { maxBitrate: 100000, scaleResolutionDownBy: 4 },
  { maxBitrate: 300000, scaleResolutionDownBy: 2 },
  { maxBitrate: 900000, scaleResolutionDownBy: 1 }
  ];

  useEffect(() => {
    let unsuscribeChannel;
    // 1️⃣ Validación temprana
    if (!email || !roomId || !ownerInfo?.email) {
      console.warn("Esperando datos para fetch...");
      return;
    }
    
    const fetchData = async () => {
      try {
        const approvedUsersById = await getApprovedUserById(roomId, email);

        // const userData = await response.json();
        const userById = await approvedUsersById || [];

        unsuscribeChannel  = listenToRequests(roomId, {componentId: 'VideoOwner'}, (approver) => {
          
          if (approver.status === 'approved') {
            // console.log("Viewer aprobado via listener:", approver.user_id);
            if (!viewerReady) { 
              setViewerReady(true);
              setStream(true);
            }
          }
          if (approver.status === null || approver.status === undefined) {
            // console.log("Viewer aprobado via listener:", approver.user_id);
            if (viewerReady) {
              setViewerReady(false);
              setStream(false);
            }
          }
        });

        if (userById.includes(email)) {
          console.log("Usuario aprobado para enviar stream...");
          if (!viewerReady) setViewerReady(true);
        } else {
          console.log("Usuario aun no aprobado");
        };

      } catch (error) {
        console.error("Error fetching user", error);
      }
    };
    fetchData();
    return () => {
      if (unsuscribeChannel) unsuscribeChannel.removeChannel();
    }
    
  },[checkApprove, roomId, email, ownerInfo]);
  
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
    setIsLiveOwner(true);
    await createSendTransport();
    await produce();
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

      const isAdmin = producerData.role === "admin";

      if (isAdmin) {
        setIsLive(false);
      } else {
        setIsLiveAttended(false);
        setIsLiveOwner(false);
      }
    };

    if (socketRef.current) {
      console.log("✅ Registrando listener producerClosed");
      socketRef.current.on("producerClosed", handler );
    } else {
    console.log("❌ socketRef.current es null");
  }

    return () => {
      socketRef.current.off("producerClosed", handler);
    };
}, []);

const stopProducing =  () => {
    // cerrar producers
    console.log("PRODUCERS REF:", producersRef);
    producersRef.current.forEach((producerInfo, producerId) => {
       new Promise(resolve => {
        socketRef.current.emit("stopProducer",  { roomId, producerId }, resolve);
      })
      // producer.close();
    });

    // producersRef.current.clear();


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
    return new Promise((resolve, reject) => {
      socketRef.current.emit("join-room", { roomId, email }, (data) => { //se incluyo el email que no estaba 
        if (data.error) {
          reject(data.error);
          return;
        }

        rtpCapabilitiesRef.current = data.rtpCapabilities;

        myRouterIdRef.current = data.routerId; // Guardar mi router asignado

        console.log("✅ Unido a la sala", roomId, "Router asignado:", data.routerId);
        setState("JOINED");
        resolve();
      });
    });
    
  };

  // 5. loadDevice
  const loadDevice = async () => {
    const device = new mediasoupClient.Device();
    // iceServers: [{ urls: "stun:stun.l.google.com:19302" }]

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
    setIsAllowed(true);
  };

  // 7. FLUJO VIEWER
  const setupConsumerFlow = async () => {
    listenForNewProducers();
    await createRecvTransport();
    
    await consumeExisting();
  };

  const createRecvTransport = () => {

    return new Promise((resolve, reject) => {
      socketRef.current.emit(
        "createTransport",
        { consumer: true, roomId, email }, (params) => 
          {

            const transport =  deviceRef.current.createRecvTransport(params);
            recvTransportRef.current = transport;

            // resolve(transport);

            // Variable fuera de la función o en un Ref para controlar el estado

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

            transport.on("connectionstatechange", async (state) => {
              console.log("📡 recvTransport state:", state);

              if (state === "connected") {
                console.log("✅ 6. Transport CONECTADO - Resolviendo promesa!");
                setState("RECV_TRANSPORT_READY");


                // Procesar productores pendientes
                for (const producer of pendingProducersRef.current.values()) {
                  console.log(
                    "🔥 Voy a consumir",
                    producer
                  );

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

    if (producers === null || producers.length === 0) {
      console.log("📡 No hay productores disponibles");
      return;
    }

    console.log("producers:", producers);

    for (const { producerId, kind, role } of producers) {

      if (remoteProducerRef.current.has(producerId) && role === "owner") continue; 

      remoteProducerRef.current.set(producerId, { kind, role: role });

      console.log(`📡 Consumiendo ${kind}:`, producerId);
      await consume({ producerId, kind, role: role }); 
      
    }
    setState("CONSUMING_EXISTING");
  };

  // 🎥 consume
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
    const existingConsumer = consumersRef.current.find( c => c.kind === consumerData.kind && c.producerRole === consumerData.role );

    if (existingConsumer) {
      existingConsumer.close();
      consumersRef.current = consumersRef.current.filter(  c => c.id !== existingConsumer.id  );
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
      socketRef.current.emit("resume-consumer", { consumerId: consumer.id }, resolve ); 
    });

    console.log("1. consumersRef push");
    consumer.producerRole = consumerData.role;
    consumersRef.current.push(consumer);
    console.log(" XX rol consumicor ",consumer.producerRole );


    console.log("2. targetVideo", remoteRef.current);
    const targetVideo = consumer.producerRole === "admin" ? remoteRef.current : remoteRefTemp.current ;

    if (consumer.producerRole === "admin") {
      console.log("rol del consumidor", consumer.producerRole)
      setIsLive(true)
    } else {
      setIsLiveAttended(true)
    }
    
    if (!targetVideo.srcObject) {
      console.log("4. creando MediaStream");
      targetVideo.srcObject = new MediaStream();
    }

    const stream = targetVideo.srcObject;
    console.log("5. stream creado", stream);

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

  // 🔴 nuevos producers en tiempo real
  
  const listenForNewProducers = () => {
    
    socketRef.current.on("new-producer", async (data) => {
      // if (consumingRef.current.has(producer.producerId)) return;

      if (remoteProducerRef.current.has(data.producerId)) return;

      try {
        // consumingRef.current.add(producer.producerId, { role });
        // consumingRef.current.set(producer.producerId, { role });
        console.log("rol del productor que esta transmitiendo", data.role);

        remoteProducerRef.current.set(data.producerId, {
          kind: data.kind,
          role: data.role
        } );


        const producerData = remoteProducerRef.current.get(data.producerId);
        if (producerData) {
          const { kind, role } = producerData; 
          console.log("role en owner", role);
        }


        console.log(`oye tengo un productor nuevo con rol ${data.producerId} ${data.role}  ` );


        // Array.from(remoteProducerRef.current.keys()).find( c => c.producerId === producerId );

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
  
  // 🔥 CONTROL DINÁMICO
  useEffect(() => {
    updateConsumers();

  }, [quality, isVisible]);
  
  // 8. useEffect correcto (ANTI-CAOS)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    socket = getSocket(apiUrl);
    socketRef.current = socket;
    

    socketRef.current.on("connect", async () => {
      console.log("🟢 Conectado:", socket.id);
      await initFlow();
      setSocketReady(true);
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
        // setStream(true); //Inicia useEffect para generar proceso de streaming
        setIsAllowed(true);
        setIsBroadcasting(true);

      } catch (error) {
        console.error("Error al iniciar llamada:", error);
      }
  };

  const hangUpBroadcasting = async () => {
    try {
      setStream(false);
      setIsAllowed(false);
      setIsBroadcasting(false);
    } catch (error) {
      console.error("Error al colgar llamada:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Transmisión en vivo */}
      <div className="bg-white p-4 rounded shadow-md">

        <div>
          <h2 className="text-xl font-semibold mb-2">Asamblea en vivo</h2>
          {/* <video ref={remoteRef} autoPlay playsInline muted={true} className="w-full rounded border"></video> */}
          
          <div 
          // style={{ width: '100%', aspectRatio: '16/9', backgroundColor: '#1a1a1a' }} 
          className="rounded overflow-hidden">
                <video 
                    ref={remoteRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: isLive ? 'block' : 'none' }}
                />
          </div>

          <h2 className="text-xl font-semibold mb-2">Intervención asambleista</h2>
          <div 
          // style={{ width: '100%', aspectRatio: '16/9', backgroundColor: '#1a1a1a' }}
          className="rounded overflow-hidden">
              <video 
                  ref={remoteRefTemp} 
                  autoPlay 
                  playsInline 
                  muted 
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: isLiveAttended ? 'block' : 'none' }}
              />

          </div>
        </div>

        <h2 className="text-xl font-semibold mb-2">Intervención del copropietario</h2>
        {viewerReady && stream ? (
          <>
            <video ref={localRef} autoPlay playsInline className="w-full rounded border" 
             style={{ width: '100%', height: '100%', objectFit: 'cover', display: isLiveOwner ? 'block' : 'none' }}
            ></video>

            <div className="controls">
              {!isAllowed ? 
              (
                // <button
                //   onClick={openBroadcasting}
                //   className="bg-blue-600 text-blue px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
                // >
                //   Iniciar llamada
                // </button> 
                <button
                  onClick={hangUpBroadcasting}
                  className="bg-red-600 text-blue px-6 py-2 rounded hover:bg-red-700 disabled:bg-gray-400"
                >
                  Detener llamada
                </button> 
                ):(
                // <button
                //   onClick={hangUpBroadcasting}
                //   className="bg-red-600 text-blue px-6 py-2 rounded hover:bg-red-700 disabled:bg-gray-400"
                // >
                //   Detener llamada
                // </button>
                <p>Transmitiendo...</p>  
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
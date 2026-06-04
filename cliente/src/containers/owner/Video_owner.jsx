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
  const consumersRef = useRef([]);
  const roleRef = useRef("owner"); // Guardar el rol actual

  const initializedRef = useRef(false); // 🔥 evita doble ejecución (React Strict)
  const rtpCapabilitiesRef = useRef(null);
  const myRouterIdRef = useRef(null); // Guardar mi router asignado
  const producerRouterIdRef=useRef(null);;
  const consumerRouterIdsRef=useRef(null);

  const [peers, setPeers] = useState([]);


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
            if (!viewerReady) setViewerReady(true);
          }
          if (approver.status === null || approver.status === undefined) {
            // console.log("Viewer aprobado via listener:", approver.user_id);
            if (viewerReady) setViewerReady(false);
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
    // Escuchar lista de peers existentes
    // socketRef.current.on("existing-peers", ({ peers: existingPeers, userRouterMap }) => {
    //   // Inicializar mapa de routers con usuarios existentes
    //   Object.entries(userRouterMap).forEach(([userId, routerId]) => {
    //     userRoutersMap.set(userId, routerId);
    //   });
    //   setPeers(existingPeers);
    // });

    await joinRoom();
    
    // Escuchar nuevos peers
    // socketRef.current.on("peer-joined", ({ peerId, userId, routerId }) => {
    //   userRoutersMap.set(userId, routerId);
    //   setPeers(prev => [...prev, { id: peerId, userId, routerId }]);
    // });

    await loadDevice();
    
    await setupConsumerFlow();

    return () => {
      socketRef.current.off("existing-peers");
      socketRef.current.off("peer-joined");
    };
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
    return new Promise((resolve, reject) => {
      socketRef.current.emit("join-room", { roomId, email }, (data) => { //se incluyo el email que no estaba 
        if (data.error) {
          reject(data.error);
          return;
        }

        rtpCapabilitiesRef.current = data.rtpCapabilities;

        myRouterIdRef.current = data.routerId; // Guardar mi router asignado

        console.log("✅ Unido a la sala", roomId, "Router asignado:", data.routerId);

        resolve();
      });
    });
    setState("JOINED");
  };

  // 5. loadDevice
  const loadDevice = async () => {
    const device = new mediasoupClient.Device();
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]

    await device.load({ routerRtpCapabilities: rtpCapabilitiesRef.current  });

    deviceRef.current = device;
    setState("DEVICE_LOADED");
  };

  // createSendTransport
  const createSendTransport = () => {
    return new Promise((resolve) => {
      socketRef.current.emit("createTransport", { consumer: false, roomId },
        (params) => {
          const transport = deviceRef.current.createSendTransport(params);

          transport.on("connect", ({ dtlsParameters }, callback) => {
            socketRef.current.emit(
              "connectTransport",
              { transportId: transport.id, dtlsParameters, roomId },
              callback
            );
          });

          transport.on("produce", ({ kind, rtpParameters }, callback) => {

            socketRef.current.emit("produce",
              {
                transportId: transport.id,
                kind,
                rtpParameters,
                roomId,
                role: "owner",
              },
              ({ id }) => callback({ id })
            );
          });

          sendTransportRef.current = transport;
          resolve();
        }
      );
      setState("SEND_TRANSPORT_READY");
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
      producersRef.current.push(producer);
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

  const createRecvTransport = () => {

    return new Promise((resolve, reject) => {
      socketRef.current.emit(
        "createTransport",
        { consumer: true, roomId, email },

        (params) => {

          const transport =  deviceRef.current.createRecvTransport(params);
          recvTransportRef.current = transport;

          // Variable fuera de la función o en un Ref para controlar el estado
          let isConnecting = false;

          transport.on("connect", ({ dtlsParameters }, callback, errback) => {
              console.log("📡 inicia connect recvTransport");

              socketRef.current.emit("connectTransport",
                { transportId: transport.id, dtlsParameters, roomId }, ({ error }) => {

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
            }
          );

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
            }
          );

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

    for (const { producerId, kind, roleRef } of producers) {
      console.log("📡 Productor existente:", producerId, "Tipo:", kind, "Rol:", roleRef.current);

      if (producersRef.current.has(producerId)) continue; 

      producersRef.current.set(producerId, { kind, role: roleRef.current });
      console.log(`📡 Consumiendo ${kind}:`, producerId);
      await consume({ producerId, roleRef, kind }); 
      
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
    //data que recibe // id: consumer.id, 
    //                 producerId, 
    //                 kind: consumer.kind, 
    //                 rtpParameters: consumer.rtpParameters,

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

    // Manejar el stream remoto
    if (consumer.produceRole === "admin") {
      if (!remoteRefTemp.current.srcObject) {
      remoteRefTemp.current.srcObject = new MediaStream();
      } else {
        if (!remoteRef.current.srcObject) {
        remoteRef.current.srcObject = new MediaStream();
        }
      }
    }

    // Manejar el stream remoto
    // if (!remoteRef.current.srcObject) {
    //   remoteRef.current.srcObject = new MediaStream();
    // }
    // const stream = remoteRef.current.srcObject;

    const stream = remoteRef.current.srcObject ? remoteRef.current.srcObject : remoteRefTemp.current.srcObject;
    
    // Eliminar tracks antiguos del mismo tipo
    const existingTracks = stream.getTracks().filter(t => t.kind === consumerData.kind);
    
    existingTracks.forEach(track => { stream.removeTrack(track); });

    // Agregar el nuevo track
    consumersRef.current.forEach(consumer => {
      if (!stream.getTracks().find(t => t.id === consumer.track.id)) { stream.addTrack(consumer.track); }
    });

    // Configurar y reproducir el remote cuando recibe del producto admin
    if (remoteRef.current && recvTransportRef.current.connectionState === 'connected') {
      try {
        remoteRef.current.muted = true;
        remoteRef.current.playsInline = true;

        if (remoteRef.current.srcObject !== stream) {
          remoteRef.current.srcObject = stream;
        }
        
        await remoteRef.current.play();
        console.log("▶️ Reproducción iniciada con éxito para admin");
        
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error("Error real de reproducción:", err);
        }
      }
    }

    if (remoteRefTemp.current && recvTransportRef.current.connectionState === 'connected') {
      try {
        remoteRefTemp.current.muted = true;
        remoteRefTemp.current.playsInline = true;

        if (remoteRefTemp.current.srcObject !== stream) {
          remoteRefTemp.current.srcObject = stream;
        }
        
        await remoteRefTemp.current.play();
        console.log("▶️ Reproducción iniciada con éxito para intervención");
        
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error("Error real de reproducción:", err);
        }
      }
    } else {
      remoteRefTemp.current.srcObject.getTracks().forEach(t => t.stop());
      remoteRefTemp.current.srcObject = null;

    }

    console.log(`✅ Track de ${consumerData.kind} actualizado. Total tracks:`, stream.getTracks().length);
      
    return consumer;
  };


  // const attachStreamToRef = async ({ ref, stream, label }) => {
  //     if (!ref.current) return;

  //     if (recvTransportRef.current.connectionState !== 'connected') {
  //       console.warn(`⚠️ No se puede reproducir ${label} porque el transport no está conectado`);
  //       return;
  //     }
      
  //     try {
  //       ref.current.muted = true;
  //       ref.current.playsInline = true;

  //       if (ref.current.srcObject !== stream) {
  //         ref.current.srcObject = stream;
  //       }

  //       await ref.current.play();
  //       console.log("▶️ Reproducción iniciada con éxito para intervención");
    
  //     }
  //     catch (err) {
  //       if (err.name !== "AbortError") {
  //         console.error(`Error reproduciendo ${label}:`, err);
  //       }
  //     }  
  // };


  // 🔴 nuevos producers en tiempo real
  
  const listenForNewProducers = () => {
    socketRef.current.on("new-producer", async ({ producerId, producerSocketId, kind, role }) => {
      console.log("🆕 Nuevo producer:", producerId);

      console.log("producersRef:", producersRef.current);
      // console.log("es Map?", producersRef.current instanceof Map);
      // console.log("constructor:", producersRef.current?.constructor?.name);
       
      if (producersRef.current.has(producerId)) return;

      producersRef.current.set(producerId, { socketId: producerSocketId, kind });

      if (producerId) await consume({ producerId, kind, role });
    });

    return () => {
      socketRef.current.off("new-producer");
    };
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


  // Dentro de tu función consume o en un useEffect que escuche los consumers
  useEffect(() => {
    const videoElement = remoteRef.current;
    if (!videoElement) return;

    // Creamos el stream si no existe
    if (!videoElement.srcObject) {
      videoElement.srcObject = new MediaStream();
    }

    const stream = videoElement.srcObject;

    // Cada vez que un consumer cambie o se agregue
    consumersRef.current.forEach(consumer => {
      if (!stream.getTracks().find(t => t.id === consumer.track.id)) {
        stream.addTrack(consumer.track);
      }
    });

    // 🔥 Truco para local: forzar el play tras asegurar el mute
    videoElement.muted = true; 
    videoElement.play().catch(console.error);

  }, [consumersRef.current.length]); // Se dispara cuando cambia la cantidad de consumers

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
      {/* Transmisión en vivo */}
      <div className="bg-white p-4 rounded shadow-md">

        <div>
          <h2 className="text-xl font-semibold mb-2">Asamblea en vivo</h2>
          {/* <video ref={remoteRef} autoPlay playsInline muted={true} className="w-full rounded border"></video> */}
          
          <div style={{ width: '100%', aspectRatio: '16/9', backgroundColor: '#1a1a1a' }} className="rounded overflow-hidden">
              <video 
                  ref={remoteRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
          </div>

          <h2 className="text-xl font-semibold mb-2">Intervención asambleista</h2>
          <div style={{ width: '100%', aspectRatio: '16/9', backgroundColor: '#1a1a1a' }} className="rounded overflow-hidden">
              <video 
                  ref={remoteRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
          </div>
        </div>


        <h2 className="text-xl font-semibold mb-2">Intervención del copropietario</h2>
        {viewerReady ? (
          <>
            <video ref={localRef} autoPlay playsInline className="w-full rounded border"></video>

            <div className="controls">
              {!isAllowed ? (
                <button
                  onClick={openBroadcasting}
                  className="bg-blue-600 text-blue px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Iniciar llamada
                </button> 
                ):(
                <button
                  onClick={hangUpBroadcasting}
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
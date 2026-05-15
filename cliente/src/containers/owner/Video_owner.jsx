import React, { useState, useEffect, useRef, useContext } from "react";
import { UserContext } from "../../components/UserContext";
import { io } from "socket.io-client";
// import { startLocalStream, stopLocalStream, getLocalStream } from '../../hooks/webrtc-client';
import { listenToRequests, offStreaming, getPendingRequestById, getApprovedUserById } from '../../supabase-client';
import AppContext from '../../context/AppContext';
import { getSocket  } from "../../hooks/socket";
import * as mediasoupClient from "mediasoup-client";
import useVideoQuality from "../../hooks/useVideoQuality";
import useVisibility from "../../hooks/useVisibility";
import { useRoomState } from "../../hooks/useRoomState";


const VideoGeneral = () => {
  const [isAllowed, setIsAllowed] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const { apiUrl } = useContext(AppContext);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const localRef = useRef();
  const remoteRef = useRef();
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

  const producersRef = useRef([]);
  const consumersRef = useRef([]);

  const initializedRef = useRef(false); // 🔥 evita doble ejecución (React Strict)
  const rtpCapabilitiesRef = useRef(null);
  const myRouterIdRef = useRef(null); // Guardar mi router asignado
  const producerRouterIdRef=useRef(null);;
  const consumerRouterIdsRef=useRef(null);

  const [peers, setPeers] = useState([]);


 // Usar el hook de estado de la sala
  const {
    getUserRouter,
    getMyRouter,
    areInSameRouter,
    myRouterId,
    producerRouterId,
    consumerRouterIds
  } = useRoomState(socketRef, roomId);


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
    socketRef.current.on("existing-peers", ({ peers: existingPeers, userRouterMap }) => {
      // Inicializar mapa de routers con usuarios existentes
      Object.entries(userRouterMap).forEach(([userId, routerId]) => {
        userRoutersMap.set(userId, routerId);
      });
      setPeers(existingPeers);
    });

    await joinRoom();
    
    // Escuchar nuevos peers
    socketRef.current.on("peer-joined", ({ peerId, userId, routerId }) => {
      userRoutersMap.set(userId, routerId);
      setPeers(prev => [...prev, { id: peerId, userId, routerId }]);
    });

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
    producersRef.current.forEach(p => p.close());
    producersRef.current = [];

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
        producerRouterIdRef.current = data.producerRouterId;
        consumerRouterIdsRef.current = data.consumerRouterIds;

        console.log("✅ Unido a la sala", roomId, "Router asignado:", data.routerId);
        console.log("📡 Mi router ID:", myRouterId.current);
        console.log("🎬 Producer router ID:", producerRouterId.current);
        console.log("👥 Consumer routers IDs:", consumerRouterIds.current);

        resolve();
      });
    });
    setState("JOINED");
  };

  // 5. loadDevice
  const loadDevice = async () => {
    const device = new mediasoupClient.Device();
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]

    await device.load({
      routerRtpCapabilities: rtpCapabilitiesRef.current,
    });

    deviceRef.current = device;
    setState("DEVICE_LOADED");
  };

  // createSendTransport
  const createSendTransport = () => {
    return new Promise((resolve) => {
      socketRef.current.emit(
        "createTransport",
        { consumer: false }, // 🔥 CLAVE
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
            socketRef.current.emit(
              "produce",
              {
                transportId: transport.id,
                kind,
                rtpParameters,
                roomId,
                userId
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
    await listenForNewProducers();
    await consumeExisting();
  };

  const createRecvTransport = () => {

    return new Promise((resolve, reject) => {

      socketRef.current.emit(
        "createTransport",
        { consumer: true, roomId, email },

        (params) => {

          const transport =  deviceRef.current.createRecvTransport(params);

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
            recvTransportRef.current = transport;

          // ✅ RESOLVER YA
          resolve();
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

    for (const producerId of producers) {
      console.log("📡 Producers disponibles:", producers);
      await consume(producerId);
    }
    setState("CONSUMING_EXISTING");
  };

  // 🎥 consume
  const consume = async (producerId) => {

    try {
      // Obtener router del productor
      const producerRouter = await getUserRouter(producerId);
      const myRouter = getMyRouter();
      
      console.log(`🔍 Productor ${producerUserId} está en router ${producerRouter}`);
      console.log(`🔍 Mi router es ${myRouter}`);

      if (producerRouter === myRouter) {
        console.log("✅ Mismo router - consumir directamente");

        const data = await new Promise((resolve) => {
          socketRef.current.emit(
            "consume",
            {
              producerId,
              rtpCapabilities: deviceRef.current.rtpCapabilities,
              consumerRouterId: myRouter,
              roomId,
              email
            },
            resolve
          );
        })
      } 
      else {
        console.log("🔗 Diferentes routers - crear pipe transport");
        
        // Crear pipe entre routers
        socketRef.current.emit("create-pipe", {
          roomId,
          producerSocketId,
          targetRouterId: myRouter // Mi router como destino
        }, (response) => {
          console.log("Pipe creado:", response);
          // Manejar el pipe...
        });
        
        // Escuchar pipe creado
        socketRef.current.once("pipe-created", (data) => {
          console.log(`✅ Pipe creado entre routers ${producerRouter} -> ${myRouter}`);
          // Crear consumer con el pipe...
        });
      }
    }
    catch (error) {
      console.error("Error al consumir stream:", error);
    }

    if (!data) {
      console.warn("❌ Productor no encontrado:", producerId);
      return;
    }
    

    //se limpia el consumerRef para evitar acumulados de tracks (🔥 clave para el caos que viste)
    const existingConsumer = consumersRef.current.find(
      c => c.kind === data.kind
    );

    if (existingConsumer) {
      existingConsumer.close();

      consumersRef.current =
        consumersRef.current.filter(
          c => c.id !== existingConsumer.id
        );
    }
    
    const consumer = await recvTransportRef.current.consume({
      id: data.id,
      producerId: data.producerId,
      kind: data.kind,
      rtpParameters: data.rtpParameters,
    });

    console.log("🎥 Consumer creado frontend");
    console.log("🎥 kind:", data.kind);
    console.log("🎥 track:", consumer.track.kind);

    await new Promise((resolve)=>{
      socketRef.current.emit("resume-consumer", 
        { consumerId: consumer.id }, resolve );
    })

    consumersRef.current.push(consumer);

    // 🔥 1. Asegurar que tenemos un MediaStream limpio
    if (!remoteRef.current.srcObject) {
        remoteRef.current.srcObject = new MediaStream();
    }

    const stream = remoteRef.current.srcObject;

    // 🔥 2. ELIMINAR tracks antiguos del mismo tipo para evitar el acumulado (el Array(4) que viste)
    const existingTracks = stream.getTracks().filter(t => t.kind === data.kind);
    existingTracks.forEach(track => {
        // track.stop(); // Detener el hardware
        stream.removeTrack(track); // Quitar del stream
    });

    // 🔥 3. Agregar el nuevo track limpio


    consumersRef.current.forEach(consumer => {
      if (!stream.getTracks().find(t => t.id === consumer.track.id)) {
        stream.addTrack(consumer.track);
      }
    });

    if (remoteRef.current && recvTransportRef.current.connectionState === 'connected') {
      // Forzar que el elemento reconozca el nuevo stream
      try {
        remoteRef.current.srcObject = stream;
      
        // IMPORTANTE: Algunos navegadores necesitan esto para despertar el renderizado
        remoteRef.current.play()
          .then(() => console.log("▶️ Reproducción iniciada con éxito"))
          .catch(err => {
              console.error("❌ Error en play():", err);
              // Si falla, intentamos mutearlo de nuevo por si es política de autoplay
              remoteRef.current.muted = true;
              remoteRef.current.play();
          });
          
      } catch (err) {
        if (err.name !== 'AbortError') {
            console.error("Error real de reproducción:", err);
        }
      }
    }

    console.log(`✅ Track de ${data.kind} actualizado. Total tracks:`, stream.getTracks().length);

    // 🔥 4. Forzar visibilidad y reproducción
    remoteRef.current.muted = true; // Obligatorio para video autoplay
    remoteRef.current.playsInline = true;

    remoteRef.current.play().catch(e => console.warn("Error play:", e));

  };

  
  // 🔴 nuevos producers en tiempo real
  const listenForNewProducers = () => {
    socketRef.current.on("new-producer", async ({ producerId }) => {
      console.log("🆕 Nuevo producer:", producerId);
      if (producerId)
      await consume(producerId);
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


        <h2 className="text-xl font-semibold mb-2">Intervención del copropietario</h2>
        {viewerReady ? (
          <>
            <video ref={localRef} autoPlay playsInline className="w-full rounded border"
            ></video>

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
import React, { useState, useEffect, useRef, useContext } from "react";
import { UserContext } from "../../components/UserContext";
import { getLocalStream, listenForApprovals, startProducing } from "../../hooks/webrtc-manager";
import AppContext from '../../context/AppContext';
import * as mediasoupClient from "mediasoup-client";
import { getSocket  } from "../../hooks/socket";
import send from "send";
  
const VideoGeneral = () => {
 
  const { apiUrl } = useContext(AppContext);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const localRef = useRef();
  const remoteRef = useRef();
  const { email } = useContext(UserContext);
  const [stream, setStream] = useState(false);
  const roomId="main-room";
  const [remote, setRemote] = useState(false);
  // const isProducingRef = useRef(false);
  // const [deviceReady, setDeviceReady] = useState(false);
  
  const ownerInfo = JSON.parse(localStorage.getItem("ownerInfo"));

  const socketRef = useRef(null);
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);

  const producersRef = useRef([]);
  const consumersRef = useRef([]);

  const initializedRef = useRef(false); // 🔥 evita doble ejecución (React Strict)
  const rtpCapabilitiesRef = useRef(null);
  const stateRef = useRef("IDLE");
  
  //crea los sockets
  // useEffect(() => {
  //   socketRef.current = getSocket(apiUrl);
  // }, []);

  //escuchar aprobaciones de viewers para activar pantalla
  useEffect(() => {
      if (!roomId) return;
      if (!socketRef.current || !roomId || !email) return;

      // const socket = socketRef.current;

      //2. Función que escucha si existe una aprobación de viewer para activar pantalla y escucha todas las señales
        const exists = listenForApprovals(roomId);

        if (exists) {
          setRemote(true);
        } else {
          return;
        };
        
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
    return new Promise((resolve) => {
      socketRef.current.emit("join-room", { roomId }, (data) => {
        rtpCapabilitiesRef.current = data.rtpCapabilities;
        console.log("✅ Unido a la sala", roomId);
        resolve();
      });
      });
      setState("JOINED");
  };

  // 5. loadDevice
  const loadDevice = async () => {
    const device = new mediasoupClient.Device();

    await device.load({
      routerRtpCapabilities: rtpCapabilitiesRef.current,
    });

    deviceRef.current = device;
    setState("DEVICE_LOADED");
  };

  // 6. FLUJO ADMIN (PRODUCTOR)
  // const setupProducerFlow = async () => {
  //   await createSendTransport();
  //   await produce();

  //   // opcional consumir también
  //   await createRecvTransport();
  //   listenForNewProducers();
  // };

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
              { transportId: transport.id, dtlsParameters },
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
      const producer = await sendTransportRef.current.produce({ track });
      producersRef.current.push(producer);
    }

    console.log("🎥 Produciendo...");
    setState("PRODUCING");
  };

  

  // 7. FLUJO VIEWER
  const setupConsumerFlow = async () => {
    await createRecvTransport();
    await consumeExisting();
    listenForNewProducers();
  };

  // createRecvTransport
  const createRecvTransport = () => {
    return new Promise((resolve) => {
      socketRef.current.emit(
        "createTransport",
        { consumer: true }, // 🔥 CLAVE
        (params) => {
          const transport = deviceRef.current.createRecvTransport(params);

          transport.on("connect", ({ dtlsParameters }, callback) => {
            socketRef.current.emit(
              "connectTransport",
              { transportId: transport.id, dtlsParameters },
              callback
            );
          });
          recvTransportRef.current = transport;
          resolve();
        }
      );
      setState("RECV_TRANSPORT_READY");
    });
  };
  

  // consumir existentes
  const consumeExisting = async () => {
    const producers = await new Promise((resolve) => {
      socketRef.current.emit("getProducers", resolve);
    });

    console.log("📡 Producers disponibles:", producers);

    for (const producerId of producers) {
      await consume(producerId);
    }
    setState("CONSUMING_EXISTING");
  };

  // 🎥 consume
  const consume = async (producerId) => {
    const data = await new Promise((resolve) => {
      socketRef.current.emit(
        "consume",
        {
          producerId,
          rtpCapabilities: deviceRef.current.rtpCapabilities,
        },
        resolve
      );
    });

    if (!data) {
      console.warn("❌ Productor no encontrado:", producerId);
      return;
    }

    const consumer = await recvTransportRef.current.consume({
      id: data.id,
      producerId: data.producerId,
      kind: data.kind,
      rtpParameters: data.rtpParameters,
    });

    consumersRef.current.push(consumer);

    // 🎥 montar en video
    const stream = new MediaStream();
    stream.addTrack(consumer.track);

    if (remoteRef.current) {
    remoteRef.current.srcObject = stream;

    setState("READY");
    };
  };

  // 🔴 nuevos producers en tiempo real
  const listenForNewProducers = () => {
    socketRef.current.on("new-producer", async ({ producerId }) => {
      console.log("🆕 Nuevo producer:", producerId);
      await consume(producerId);
    });
  };

  // 8. useEffect correcto (ANTI-CAOS)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const socket = getSocket(apiUrl);
    socketRef.current = socket;

    await initFlow();

    // socket.on("connect", async () => {
    //   console.log("🟢 Conectado:", socket.id);
    //   await initFlow();
    // });

    if (remoteRef.current) {
      remoteRef.current.srcObject = null;

    // socket.on("producer-closed", () => {
    //   console.log("📴 Stream detenido");
    
    // if (remoteRef.current) {
    //   remoteRef.current.srcObject = null;
    }
    // });
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
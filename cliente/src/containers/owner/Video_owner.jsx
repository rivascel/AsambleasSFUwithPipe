import React, { useState, useEffect, useRef, useContext } from "react";
import { UserContext } from "../../components/UserContext";
import { io } from "socket.io-client";
import { startLocalStream, stopLocalStream, getLocalStream, 
        stopProducing } from '../../hooks/webrtc-client';
import { listenToRequests, offStreaming } from '../../supabase-client';
import AppContext from '../../context/AppContext';
import * as mediasoupClient from "mediasoup-client";

const VideoGeneral = () => {
  const { apiUrl } = useContext(AppContext);

  const localRef = useRef();
  const remoteRef = useRef();
  const roomId = 'main-room';
  const { email, ownerData, login, checkApprove } = useContext(UserContext);
  const [isAllowed, setIsAllowed] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const ownerInfo = JSON.parse(localStorage.getItem("ownerInfo"));

  const socketRef = useRef(null);
   // 2. Referencias necesarias
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);

  const producersRef = useRef([]);
  const consumersRef = useRef([]);

  const initializedRef = useRef(false); // 🔥 evita doble ejecución (React Strict)
  const rtpCapabilitiesRef = useRef(null);

 useEffect(() => {
    let unsuscribeChannel;
    // 1️⃣ Validación temprana
    if (!email || !roomId || !ownerInfo?.email) {
      console.warn("Esperando datos para fetch...");
      return;
    }
    
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
  
  //crea los sockets
  useEffect(() => {
    socketRef.current = getSocket(apiUrl);
  }, []);

  // 1. Estado central (useRef + estado lógico)
  const stateRef = useRef("IDLE");

  const setState = (newState) => {
    console.log(`🧭 Estado: ${stateRef.current} → ${newState}`);
    stateRef.current = newState;
  };


  // 3. INIT FLOW (el corazón)
  const initFlow = async () => {
    await joinRoom();
    await loadDevice();

    if (stream) {
      await setupProducerFlow();
    } else {
      await setupConsumerFlow();
    }
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
    };

    // 5. loadDevice
    const loadDevice = async () => {
      const device = new mediasoupClient.Device();

      await device.load({
        routerRtpCapabilities: rtpCapabilitiesRef.current,
      });

      deviceRef.current = device;
    };

    // 6. FLUJO ADMIN (PRODUCTOR)
    const setupProducerFlow = async () => {
      await createSendTransport();
      await produce();

      // opcional consumir también
      await createRecvTransport();
      listenForNewProducers();
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
      });
    };

    // produce (clave)
    const produce = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      for (const track of stream.getTracks()) {
        const producer = await sendTransportRef.current.produce({ track });
        producersRef.current.push(producer);
      }

      console.log("🎥 Produciendo...");
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

      // const video = document.createElement("video");
      // video.srcObject = stream;
      // video.autoplay = true;
      // video.playsInline = true;

      // document.body.appendChild(video);

      remoteRef.current.srcObject = stream
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

      socket.on("connect", async () => {
        console.log("🟢 Conectado:", socket.id);
        await initFlow();
      });
    }, []);

    const openBroadcasting = async () => {
      try {
        // 1. Obtener stream local
        setStream(true); //Inicia useEffect para generar proceso de streaming

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
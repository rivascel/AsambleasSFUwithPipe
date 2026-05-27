// server.js

import { Server } from "socket.io";

import {
  createRoom,
  getRoom,
  addPeerToRoom,
  getPeer,
  removePeerFromRoom,
  registerProducer,
  getProducerInfo,
  pipeProducerToRouter
} from "./mediasoup/router.js";

import {
  createWebRtcTransport
} from "./mediasoup/transport.js";

export default (httpServer) => {

  const io = new Server(httpServer, {
    cors: {
      origin: "https://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

    const ADMIN_EMAIL = "admin";
    let administrador = "";
    let userIdentifier;
    const transports = new Map();
    const userRouterMap = new Map(); // userId -> routerId
    const userSocketMap = new Map(); // userId -> socketId

  io.on("connection", socket => {

    console.log("🟢 Socket conectado", socket.id);

    /* =========================================================
       AUTH COOKIE
    ========================================================= */

    const cookieString = socket.handshake.headers.cookie || "";

    const getCookie = (name) => {
      const value = `; ${cookieString}`;
      const parts = value.split(`; ${name}=`);

      if (parts.length === 2) {
        return parts.pop().split(";").shift();
      }

      return null;
    };

    const sessionCookie = getCookie("session");

    let email = null;

    if (sessionCookie) {
      try {
        const decoded = decodeURIComponent(sessionCookie);
        const session = JSON.parse(decoded);
        email = session.email;

      } catch (err) {
        console.error("❌ Error cookie", err.message);
      }
    }

    /* =========================================================
       JOIN ROOM
    ========================================================= */

    socket.on("join-room", async ({ roomId }, callback) => {
        try {
          let room = getRoom(roomId);
          if (!room) {

            room = await createRoom(roomId);

            console.log(`🏠 Sala creada ${roomId}`);
          }

          const isBroadcaster = email === ADMIN_EMAIL;

          // devuelve router
          const router = await addPeerToRoom(roomId, socket.id, isBroadcaster);

          const peer = getPeer(roomId, socket.id);

          socket.roomId = roomId;
          socket.userId = email;
          socket.routerId = router.id;

          socket.join(roomId);

          console.log(`👤 Peer ${socket.id} -> Router ${router.id}`);

          callback({
            routerId: router.id,
            rtpCapabilities: router.rtpCapabilities,
            socketId: socket.id
          });

        } catch (err) {

          console.error("❌ join-room error", err);

          callback({
            error: err.message
          });
        }
      }
    );

    /* =========================================================
       CREATE TRANSPORT
    ========================================================= */

    socket.on("createTransport",
      async ({ consumer }, callback) => {

        try {

          const peer =
            getPeer(
              socket.roomId,
              socket.id
            );

          if (!peer) {
            throw new Error(
              "Peer no encontrado"
            );
          }

          const transport =
            await createWebRtcTransport(
              peer.router
            );

          transport.appData = {
            consumer
          };

          peer.transports.push(
            transport
          );

          transport.on("close", () => {

            peer.transports =
              peer.transports.filter(
                t => t.id !== transport.id
              );
          });

          console.log(
            `🚀 Transport ${transport.id}`
          );

          callback({
            id: transport.id,

            iceParameters:
              transport.iceParameters,

            iceCandidates:
              transport.iceCandidates,

            dtlsParameters:
              transport.dtlsParameters
          });

        } catch (err) {

          console.error(
            "❌ createTransport",
            err
          );

          callback({
            error: err.message
          });
        }
      }
    );

    /* =========================================================
       CONNECT TRANSPORT
    ========================================================= */

    socket.on(
      "connectTransport",
      async (
        {
          transportId,
          dtlsParameters
        },
        callback
      ) => {

        try {

          const peer =
            getPeer(
              socket.roomId,
              socket.id
            );

          if (!peer) {
            throw new Error(
              "Peer no encontrado"
            );
          }

          const transport =
            peer.transports.find(
              t => t.id === transportId
            );

          if (!transport) {
            throw new Error(
              "Transport no encontrado"
            );
          }

          await transport.connect({
            dtlsParameters
          });

          console.log(
            `✅ Transport conectado ${transport.id}`
          );

          callback({
            connected: true
          });

        } catch (err) {

          console.error(
            "❌ connectTransport",
            err
          );

          callback({
            error: err.message
          });
        }
      }
    );

    /* =========================================================
       PRODUCE
    ========================================================= */

    socket.on("produce", async ({ transportId, kind, rtpParameters }, callback) => {

        try {
            const peer = getPeer(socket.roomId, socket.id);

            if (!peer) {
                throw new Error("Peer no encontrado");
            }

            const transport = peer.transports.find(t => t.id === transportId);

            if (!transport) {
                throw new Error("Transport no encontrado");
            }

          const producer = await transport.produce({kind, rtpParameters, appData: { peerId: socket.id } });

          peer.producers.push( producer );

          // REGISTRO GLOBAL
          registerProducer({ producer, roomId: socket.roomId, peerId: socket.id, routerId: peer.routerId, workerId: peer.workerId });

          console.log(`🎥 Producer ${producer.id}`);

          callback({
            id: producer.id
          });

          socket.to(peer.roomId)
            .emit("new-producer", {
                producerId: producer.id,
                peerId: socket.id,
                kind: producer.kind
              }
            );

          producer.on("close", () => {
            socket.to(peer.roomId)
              .emit("producer-closed", { producerId: producer.id }
              );
          });

        } catch (err) {
          console.error("❌ produce", err);
          callback({
            error: err.message
          });
        }
      }
    );

    /* =========================================================
       GET PRODUCERS
    ========================================================= */

    socket.on(
      "getProducers",
      (_, callback) => {

        try {

          const room =
            getRoom(socket.roomId);

          if (!room) {
            return callback([]);
          }

          const producers =
            Array
              .from(
                room.peers.values()
              )
              .flatMap(peer =>
                peer.producers.map(
                  producer => ({

                    producerId:
                      producer.id,

                    peerId:
                      peer.id,

                    kind:
                      producer.kind
                  })
                )
              );

          callback(producers);

        } catch (err) {

          console.error(
            "❌ getProducers",
            err
          );

          callback([]);
        }
      }
    );

    /* =========================================================
       CONSUME
    ========================================================= */

    socket.on(
      "consume",
      async (
        {
          producerId,
          rtpCapabilities
        },
        callback
      ) => {

        try {

          const peer =
            getPeer(
              socket.roomId,
              socket.id
            );

          if (!peer) {
            throw new Error(
              "Peer no encontrado"
            );
          }

          // producer global
          const producerInfo =
            getProducerInfo(
              producerId
            );

          if (!producerInfo) {
            throw new Error(
              "Producer no encontrado"
            );
          }

          // transport consumidor
          const transport =
            peer.transports.find(
              t => t.appData.consumer
            );

          if (!transport) {
            throw new Error(
              "Transport consumer no encontrado"
            );
          }

          const consumer = await transport.consume({
                producerId,
                rtpCapabilities,
                paused: false,
            });

            if (!peer.consumers) peer.consumers = [];
            peer.consumers.push(consumer);

            console.log("📺 Consumer creado:", consumer.id);

            

          // PIPE AUTOMÁTICO
          const {
            pipeProducer
          } =
            await pipeProducerToRouter({

              producerId,

              targetRouter:
                peer.router
            });

          // VALIDAR CONSUMO
          const canConsume =
            peer.router.canConsume({

              producerId:
                pipeProducer.id,

              rtpCapabilities
            });

          if (!canConsume) {

            throw new Error(
              "Cannot consume"
            );
          }

          // CONSUMER NORMAL
          const consumer =
            await transport.consume({

              producerId:
                pipeProducer.id,

              rtpCapabilities,

              paused: false
            });

          peer.consumers.push(
            consumer
          );

          console.log(
            `📺 Consumer ${consumer.id}`
          );

          callback({

            id:
              consumer.id,

            producerId,

            kind:
              consumer.kind,

            rtpParameters:
              consumer.rtpParameters
          });

          consumer.on("close", () => {

            peer.consumers =
              peer.consumers.filter(
                c => c.id !== consumer.id
              );
          });

        } catch (err) {

          console.error(
            "❌ consume",
            err
          );

          callback({
            error: err.message
          });
        }
      }
    );

    /* =========================================================
       RESUME CONSUMER
    ========================================================= */

    socket.on(
      "resume-consumer",
      async (
        { consumerId },
        callback
      ) => {

        try {

          const peer =
            getPeer(
              socket.roomId,
              socket.id
            );

          if (!peer) {
            throw new Error(
              "Peer no encontrado"
            );
          }

          const consumer =
            peer.consumers.find(
              c => c.id === consumerId
            );

          if (!consumer) {
            throw new Error(
              "Consumer no encontrado"
            );
          }

          await consumer.resume();

          callback({
            success: true
          });

        } catch (err) {

          console.error(
            "❌ resume-consumer",
            err
          );

          callback({
            error: err.message
          });
        }
      }
    );

    /* =========================================================
       DISCONNECT
    ========================================================= */

    socket.on(
      "disconnect",
      () => {

        console.log(
          `❌ Disconnect ${socket.id}`
        );

        removePeerFromRoom(
          socket.roomId,
          socket.id
        );

        socket.to(socket.roomId)
          .emit(
            "peer-left",
            {
              peerId: socket.id
            }
          );
      }
    );
  });
};
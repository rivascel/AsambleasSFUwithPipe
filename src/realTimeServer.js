//una funcion que se esta exportando para ser usada en otro
//archivo, y crea el servidor socket.io en tiempo real

// import { normalizeModuleId } from "vite/module-runner";
import { createRoom,  getRoom,  addPeerToRoom,  getPeer,  removePeerFromRoom,  registerProducer,  getProducerInfo,
  pipeProducerToRouter, removePeerFromProducers } from "./mediasoup/router.js";

import { createWebRtcTransport } from "./mediasoup/transport.js";
import { Server } from "socket.io";
// import { registerSocketHandlers } from ".   /socketHandlers.js";

export default (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: 'https://localhost:5173',
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    let connectedUsers = [];
    const ADMIN_EMAIL = "administrador";
    let administrador = "";
    let userIdentifier;
    const transports = new Map();
    const userRouterMap = new Map(); // userId -> routerId
    const userSocketMap = new Map(); // userId -> socketId

    // Configuración de Socket.IO con CORS
    io.on("connection", socket => {
    /* =======================================================
       AUTH COOKIE
    ========================================================= */

        const cookieString = socket.handshake.headers.cookie || ""; 

        const getCookie = (name) => {  
            const value = `; ${cookieString}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop().split(';').shift();
            return null;
        };

        const sessionCookie = getCookie('session');

        if (sessionCookie) {
            try {
            // 1. Decodificar caracteres especiales (como %22 para comillas)
            const decodedSession = decodeURIComponent(sessionCookie);
            // 2. Parsear el string JSON a objeto JS
            const sessionData = JSON.parse(decodedSession);
            
            // Usamos el email como identificador en la lista
            userIdentifier = sessionData.email;

            // console.log("🔐 Socket autenticado:", socket.id, userIdentifier);

            if (!userIdentifier) return;

            if (userIdentifier && !connectedUsers.includes(userIdentifier)) {
                connectedUsers.push(userIdentifier);
                // io.emit("updateConnectedUsers", connectedUsers);
                console.log("lista de conectados",connectedUsers)
            }
            } catch (e) {
                console.error("Error al parsear la cookie session en Socket:", e.message);
            }
            console.log("Usuarios conectados actualmente:", connectedUsers);
        }

        if (userIdentifier != '') {
    
            socket.emit("updatedUser", userIdentifier );

            // Manejar la desconexión
            socket.on("disconnect", () => {
                connectedUsers = connectedUsers.filter(id => id !== userIdentifier);
                console.log("Usuario desconectado:", userIdentifier);
                io.emit("updateConnectedUsers", connectedUsers); // ⬅️ importante
                console.log("lista de conectados", connectedUsers);
            });

            socket.on("wordUser", ({ user, action}) =>{
                if (!global.currentAskUsers){ //si no hay usuarios solicitando, array en blanco
                    global.currentAskUsers = []
                }
                if (action === 'add'){
                    if(!global.currentAskUsers.includes(user)){
                        global.currentAskUsers.push(user)
                    }
                
                }else if (action === 'remove'){
                    global.currentAskUsers = global.currentAskUsers.filter(u => u !== user);
                }

                io.emit("wordUser", global.currentAskUsers);
                console.log("wordUser:", global.currentAskUsers);
            });
            
            // ================= ENVIO DEL DECISION A CLIENTES ===================
            socket.on("send-decision", text => {
                socket.broadcast.emit("receive-decision", text );
            });
            
            // ================= ENVIO DE VOTOS A CLIENTES =================
            //enviar el mensaje y el usuario
            socket.on("message", (data) => {
                // socket.broadcast.emit("message", data);

                console.log("Recibido de:", socket.id);

                socket.broadcast.emit("message", {
                    ...data,
                    server: true,
                    from: socket.id
                });

            });

            // ===================== ACTUALIZAR USE EFFECT SOLICITUDES REALIZADAS =======
            socket.on("request-update", (userId, roomId, status, timeStamp) => {
                socket.broadcast.emit("request-update", (userId, roomId, status, timeStamp));
            });

            socket.on("request-update-cancel", (userId, status, timeStamp) => {
                socket.broadcast.emit("request-update", (userId, status, timeStamp));
            });

            // ===================== ENVIA APROBACION PARA EMITIR =======
            socket.on("approve", (userId) => {
                socket.broadcast.emit("approve", (userId));
            });

            //============== ENVIA SOLICITUD PARA UNIRSE AL STREAM
            socket.on("admin-ready", () =>{
                console.log("transmisión del admin");
                socket.broadcast.emit("stream-ready");
            });

            socket.on("user-ready", (userId, roomId) =>{
                console.log("transmisión del user",userId, roomId);
                socket.broadcast.emit("stream-ready-user",userId, roomId);
            });

            socket.on("request-stream", ({ userId, roomId }) =>{
                socket.broadcast.emit("listen-user",{ userId, roomId });
            });

            socket.on("approval-notification", ({ userId, roomId }) =>{
                console.log("notificación de aprobación para unirse al stream",userId, roomId);
                socket.broadcast.emit("approved", { userId, roomId });
            });

            socket.on("cancel-notification", ({ userId, roomId }) =>{
                console.log("notificación de cancelacion para unirse al stream",userId, roomId);
                socket.broadcast.emit("canceled", { userId, roomId });
            });

            socket.on("quorumCalculated", (quorumPercentage) => {
                // console.log("📊 Quorum calculado:", quorumPercentage);
                socket.broadcast.emit("quorumCalculated", quorumPercentage);
            });

            socket.on("sesionStarted", (numberSesion) => {
                console.log(
        "RECIBIDO sesionStarted",
        socket.id,
        numberSesion,
        typeof numberSesion
    );
    
                // console.log("📊 Quorum calculado:", quorumPercentage);
                socket.broadcast.emit("sesionStarted", numberSesion);
            });
        

                    // ================= ENVIO DEL CRONOMETRO A CLIENTES ===================
            // Escuchar el inicio del cronómetro
            socket.on('start-cronometer', ({ time })  => {

                io.emit('start-cronometer', { 
                    time 

                });
                console.log("cronometro iniciado", time);
            });

            // Escuchar las actualizaciones del cronómetro
            socket.on('update-cronometer', data => {
                io.emit('update-cronometer', data);
            });

            socket.on('end-cronometer', () => {
                io.emit('end-cronometer');
            });

            socket.on('ocultar', data => {
                socket.broadcast.emit('ocultar', data);
            });

            socket.on('signal', data => {
                // Retransmitir señal a todos excepto al emisor
                socket.broadcast.emit('signal', data);
            });

            socket.on('send-votes', data => {
                socket.broadcast.emit('send-votes', data);
            });

            socket.on("disconnect", () => {
                console.log("🔴 Usuario desconectado:", socket.id);
            });
            
        };

        registerSocketHandlers(socket,io);
    });

    function registerSocketHandlers(socket, io) {

        //===========SFU==============


        // 🔹 Unirse a la sala
        socket.on("join-room", async ({ roomId, userId:email }, callback) => {

            let room = getRoom(roomId); //busca en router.js
            if (!room) {
                room = await createRoom(roomId); // lo crea usando router.js
                console.log("🏠 Sala creada:", roomId);
            }

            const isBroadcaster = email === ADMIN_EMAIL;

            // devuelve router
            const router = await addPeerToRoom(roomId, socket.id, isBroadcaster);

            const peer = getPeer(roomId, socket.id);

            // Agregar peer y obtener el router asignado
            const assignedRouterId = router.id;

            // Notificar a otros usuarios sobre el router de este usuario
            socket.to(roomId).emit("user-router-assigned", {
                userId: email,
                routerId: userRouterMap.email
            });

            socket.join(roomId);
            socket.roomId = roomId;
            socket.userId = email; //aca es donde guarda el socket
            socket.routerId = router.id; // Guardar el router del peer

            // Guardar relación usuario-router
            userRouterMap.set(email, router.id);
            userSocketMap.set(email, socket.id);


            console.log(`✅ Peer ${socket.id} asignado al router ${assignedRouterId}`);

            // Enviar a todos los demás usuarios que un nuevo usuario se unió y su router
            socket.to(roomId).emit("peer-joined", {
                peerId: socket.id,
                userId: email,
                routerId: router.id
            });

            // Enviar al nuevo usuario la lista de peers existentes con sus routers
            const existingPeers = [];
            const existingUserRouterMap = {};
            
            for (const [userId, routerId] of userRouterMap.entries()) {
                if (userId !== email) {
                    const userSocketId = userSocketMap.get(userId);
                    if (userSocketId) {
                    existingPeers.push({
                        id: userSocketId,
                        userId: userId,
                        routerId: routerId
                    });
                    existingUserRouterMap[userId] = routerId;
                    }
                }
            }
            
            socket.emit("existing-peers", {
                peers: existingPeers,
                userRouterMap: existingUserRouterMap
            });


            // ✅ Verificar que el peer se guardó correctamente
            const savedPeer = getPeer(roomId, socket.id); 

            console.log("✅ Peer guardado:", socket.id, savedPeer?.roomId);

            // Consultar router de un usuario
            socket.on("get-user-router", ({ userId }, callback) => {
                const routerId = userRouterMap.get(userId);
                if (routerId) {
                    callback({ routerId });
                } else {
                    callback({ error: "Usuario no encontrado" });
                }
            });

            // Limpiar cuando un usuario se desconecta
            socket.on("disconnect", () => {
                const userId = socket.userId;
                const roomId = socket.roomId;
                
                if (userId && roomId) {
                    userRouterMap.delete(userId);
                    userSocketMap.delete(userId);
                    
                    socket.to(roomId).emit("user-left", { userId });
                    console.log(`👋 Usuario ${userId} desconectado, router eliminado`);
                }
            });
            
            // Devolver las capacidades del router para que el cliente cargue su device
            callback({
                rtpCapabilities: router.rtpCapabilities,
                routerId: router.id,
                socketId: socket.id,
                // producerRouterId: room.producerRouter.id, // Para referencia
                // consumerRouterIds: room.consumerRouters.map(cr => cr.router.id) // Todos los routers disponibles
            });
        });

        // 🔹 Crear transport (WebRTC)
        socket.on("createTransport", async ({ consumer, roomId }, callback) => {
            const room = await getRoom(roomId);

            if (!room) {
                console.error("❌ Sala no existe");
                return callback({ error: "Sala no existe" });
            }

            try {

                const peer = getPeer(roomId, socket.id);
                if (!peer) { throw new Error("Peer no encontrado"); }

                const transport = await createWebRtcTransport(peer.router);

                transport.appData = { consumer };

                peer.transports.push(transport);

                transport.on("close", () => {
                    peer.transports = peer.transports.filter(t => t.id !== transport.id);
                });

                console.log(`🚀 Transport ${transport.id}`);

                callback({
                    id: transport.id,
                    iceParameters: transport.iceParameters,
                    iceCandidates: transport.iceCandidates,
                    dtlsParameters: transport.dtlsParameters
                });

            } catch (err) {
                console.error("❌ createTransport", err );
                callback({ error: err.message });
            }
        });

        // 🔹 Conectar transport
        socket.on("connectTransport", async ({ transportId, dtlsParameters }, callback) => {            
            try {
            
                const peer = getPeer(socket.roomId, socket.id);
    
                if (!peer) {throw new Error("Peer no encontrado");}
    
                const transport = peer.transports.find(t => t.id === transportId);
    
                if (!transport) { throw new Error("Transport no encontrado"); }
    
                await transport.connect({ dtlsParameters });
    
                console.log(`✅ Transport conectado ${transport.id}`);
    
                callback({ connected: true });
    
            } catch (err) {
    
                console.error("❌ connectTransport", err);
    
                callback({
                error: err.message
                });
            }
        });

        // 🔹 Producir (Enviar stream al SFU)
        socket.on("produce", async ({ transportId, kind, rtpParameters, roomId, role }, callback) => {
            const room = await getRoom(roomId);
            // const peer = await getOnePeerInRoom(roomId, socket.id);

            const peer = getPeer(socket.roomId, socket.id);

            if (!peer) {
                throw new Error("Peer no encontrado");
            }

            const transport = peer.transports.find(t => t.id === transportId);

            try {
                const producer = await transport.produce({ kind, rtpParameters, appData: { peerId: socket.id, } });

                console.log("ANTES push:",peer.producers.length);

                peer.producers.push(producer);
                peer.role = role; // Guardar el rol del peer
                // room.activeProducerId = socket.id;

                console.log("DESPUES push:",peer.producers.length);

                
                // REGISTRO GLOBAL
                registerProducer({ producer, roomId: socket.roomId, peerId: socket.id, routerId: peer.routerId, 
                                    workerId: peer.workerId, role: peer.role });
                console.log("🎥 Producer creado y rol:", producer.id, role);

                callback({ id: producer.id });

                // 🔥 Notificar a otros
                socket.to(peer.roomId).emit("new-producer", {
                    producerId: producer.id,
                    producerSocketId: socket.id, // 👈 Socket ID del productor
                    // peerId: socket.id,
                    kind: producer.kind,
                    role: role
                });

                console.log("📢 Emitiendo a:", peer.roomId, role, producer.id);

                producer.on("close", () => {
                    room.activeProducerId = null;

                    peer.producers = peer.producers.filter(p => p.id !== producer.id);

                    socket.to(roomId).emit("producer-closed", { producerId: producer.id });
                console.log("DESPUES DE CERRAR push:",peer.producers.length);
                }
                
                );

                producer.on("transportclose", () => {

                peer.producers =
                peer.producers.filter(
                    p => p.id !== producer.id
                );

            });

            } catch (error) {
                console.error("❌ Error en produce:", error);
                callback?.({ error: error.message });
            }
        });
        // const globalProducers = [];
        socket.on("stopProducer", async ( { roomId, producerId }  ) => {
            console.log("roomId recibido:", roomId, typeof roomId);
            // console.log("🛑 stopProducer recibido", { producerId });
            // const room = await getRoom(roomId);

            try {
                const peer = await getPeer(roomId, socket.id);

                if (!peer) {
                    console.error("❌ Peer no encontrado");
                    return;
                }

                const producer = peer.producers.find(p => p.id === producerId);
                if (!producer) {
                    console.error("❌ Producer no encontrado");
                    return;
                }

                await producer.close();

                // Eliminar producer del peer
                peer.producers = peer.producers.filter(p => p.id !== producerId);


                // ✅ Notificar a todos los peers de la sala
                socket.to(roomId).emit("producerClosed", producerId );


                console.log(`🛑 Producer ${producerId} detenido y eliminado`);

            } catch (err) {
                console.error("💥 Error en stopProducer:", err);
            }
        });



        // 🔹 Obtener productores existentes (para usuarios que entran tarde)
        socket.on("getProducers", (data, callback) => {
              console.log("📥 getProducers recibido", data);
            const { roomId } = data; //extraemos roomId del objeto data

            try {
            const room = getRoom(roomId);
            if (!room) return callback?.([]);

            const producers = Array.from(room.peers.values())
                .flatMap(peer => {
                    console.log("👤 Peer:", peer.id,
                    "role:", peer.role,
                    "producers:", peer.producers.length);

                    return peer.producers.map(producer => ({
                        producerId: producer.id,
                        peerId: peer.id,
                        kind: producer.kind,
                        role: peer.role
                    }));
                });
            callback(producers);

            } catch (err) {

            console.error(
                "❌ getProducers",
                err
            );

            callback([]);
            }
        });

        // 🔹 Consumir (Recibir stream del SFU)
        socket.on("consume", async ({ producerId, rtpCapabilities, roomId, role }, callback) => {

            try {

                const consumerPeer = getPeer(roomId, socket.id);

                if (!consumerPeer) {throw new Error("Consumer peer no encontrado");}

                // 🔥 Buscar transport de consumo
                const transport = consumerPeer.transports.find(t => t.appData?.consumer);

                if (!transport) { throw new Error("Transport consumer no encontrado"); }

                
                // PIPE AUTOMÁTICO
                const { pipeProducer } = await pipeProducerToRouter({ producerId, targetRouter: consumerPeer.router });

                // VALIDAR CONSUMO
                if (!consumerPeer.router.canConsume({ producerId: pipeProducer.id, rtpCapabilities }) ) {
                    throw new Error("Cannot consume");
                }
                
                // CONSUMER NORMAL
                const consumer = await transport.consume({ producerId: pipeProducer.id, rtpCapabilities, paused: false });

                consumerPeer.consumers.push(consumer);

                console.log("📺 Consumer creado:", consumer.id);
          

                callback({ 

                    id: consumer.id, 
                    producerId, 
                    kind: consumer.kind, 
                    rtpParameters: consumer.rtpParameters,
                    role
                    
                });

                consumer.on("producerclose", () => {
                    peer.consumers = peer.consumers.filter(c => c.id !== consumer.id);
                    // socket.emit("consumerClosed", { consumerId: consumer.id });
                });
                
                consumer.on("close", () => { 
                    consumerPeer.consumers = consumerPeer.consumers.filter(c => c.id !== consumer.id);
                    console.log("Consumidor cerrador", consumer.id);
                });

            } 
            catch (err) {
                console.error("❌ consume", err );
                callback({ error: err.message });
            }
        })
    
        // 🔹 Reanudar consumo
        socket.on("resume-consumer", async ({ consumerId }, callback) => {
            
            try {
                const peer = getPeer(socket.roomId, socket.id );

                if (!peer) { throw new Error("Peer no encontrado" );}

                console.log("▶️ Resume solicitado:", consumerId);
                // const peer = getOnePeerInRoom(socket.roomId, socket.id);

                console.log("👤 Peer:", !!peer);
                const consumer = peer?.consumers.find(c => c.id === consumerId);

                if (!consumer  ) {
                        console.warn("⚠️ consumer no existe");
                        return;
                        }

                        if (consumer.closed) {
                        console.warn("⚠️ consumer ya cerrado (skip resume)");
                        return;
                        }

                // 🔵 USO SEGURO
                if (consumer.paused) {
                await consumer.resume();
                }

                console.log("✅ consumer resumido:", consumerId);
            
                console.log("📺 Consumer encontrado:", !!consumer);
                console.log("Tipo consumers:", peer.consumers.constructor.name);

                try {
                            console.log("consumer state:", {
                            id: consumer.id,
                            closed: consumer.closed,
                            producerId: consumer.producerId,
                            paused: consumer.paused
                            });


                     await consumer.resume();
                    
                } catch (err) {
                    console.error("Error resumiendo consumer:", err);
                }

                callback?.({ success: true });
            } 
            catch (err) { 
                console.error( "❌ resume-consumer",err);
                callback?.({ error: err.message });
            }
        });

        
        socket.on("pause-consumer", async ({ consumerId }) => {
            const peer = getPeer(socket.roomId, socket.id );
            const consumer = peer.consumers.find(c => c.id === consumerId);

            if (!consumer || consumer.closed) return;

            await consumer.pause();
        });

        socket.on("set-quality", async ({ consumerId, quality }) => {
            const peer = getPeer(socket.roomId, socket.id );

            const consumer = peer.consumers.find(c => c.id === consumerId);

            if (!consumer || consumer.closed) return;

            const map = { low: 0, mid: 1, high: 2 };

            await consumer.setPreferredLayers({
                spatialLayer: map[quality],
                temporalLayer: 2,
            });
        });


        //reconect
        socket.on("connect", () => {
            console.log("🟢 Reconectado");
        
            if (wasConnectedBefore) {
                rejoinRoom();
            }
        });

        // 🔹 Desconexión
        socket.on("disconnect", ({ roomId, socketId }) => {
            console.log("❌ Socket desconectado:", socket.id);

            const room = getRoom(socket.roomId);
            const peer = getPeer(socket.roomId, socket.id);

            removePeerFromRoom( roomId, socket.id);

            // socket.to(socket.roomId)
            //     .emit("peer-left",  { peerId: socket.id } );


            if (!peer) return;

            // 🔴 NO borres todo inmediatamente
            // espera unos segundos por reconexión

            setTimeout(() => {
                const stillPeer = getPeer(socket.roomId, socket.id);

                if (!stillPeer) return;
                console.log("⏳ Verificando reconexión de:", socket.id);

                removePeerFromRoom(socket.roomId, socket.id); //lo elimina de la sala usando router.js
                socket.to(peer.roomId).emit("peer-left", { peerId: socket.id });

            }, 5000); // ventana de reconexion
        });

    }
}
//una funcion que se esta exportando para ser usada en otro
//archivo, y crea el servidor socket.io en tiempo real

import { createWorker } from "./mediasoup/worker.js";
import { createRoom, getRoom } from "./mediasoup/router.js";
import { createWebRtcTransport } from "./mediasoup/transport.js";
import { addPeer, getPeer, addTransport, getAllPeers  } from "./mediasoup/helpers.js";
import { Server } from "socket.io";

export default (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: 'https://localhost:5173',
            methods: ['GET', 'POST'],
            credentials: true
        }
    }
    );

     // ✅ WORKER GLOBAL
     let worker;

        (async () => {
            worker = await createWorker();
            console.log("✅ Worker creado (único)");
        })();

    let connectedUsers = [];
    const ADMIN_EMAIL = "admin";
    let administrador = "";
    let userIdentifier;

    // Configuración de Socket.IO con CORS
    io.on("connection", socket => {
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

            if (userIdentifier && !connectedUsers.includes(userIdentifier)) {
                connectedUsers.push(userIdentifier);
                io.emit("updateConnectedUsers", connectedUsers);
                console.log("lista de conectados",connectedUsers)
            }
        } catch (e) {
            console.error("Error al parsear la cookie session en Socket:", e.message);
        }
        console.log("Usuarios conectados actualmente:", connectedUsers);

        }

        // const user = decodeURIComponent(cookie.split("username=").pop()?.split(";")[0]); 
        // Validar la existencia de la cookie if (!user) return;
        
        if (!userIdentifier) return;

        if (userIdentifier != '') {
            // if (user ) {
            //     if (!connectedUsers.includes(user)) {
            //         connectedUsers.push(user); // Agregar usuario si no está en la lista
            //     };
    
            //     //Enviar la lista actualizada a todos los clientes
            //     io.emit("updateConnectedUsers", connectedUsers);
            //     console.log("lista de conectados",connectedUsers)
            // }
    
            socket.emit("updatedUser", userIdentifier );

            // Manejar la desconexión
            socket.on("disconnect", () => {
                // console.log("Usuario desconectado:", user);
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
                socket.broadcast.emit("message", data);
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
        };
        // ===============CONEXION VIDEO ===================================
        // Manejar eventos de WebRTC (señalización)
        socket.on("offer", data => {
            const { to, offer } = data;
            io.to(to).emit("offer", { from: socket.id, offer });
        });

        socket.on("answer", data => {
            const { to, answer } = data;
            io.to(to).emit("answer", { from: socket.id, answer });
        });

        socket.on("ice-candidate", data => {
            const { to, candidate } = data;
            io.to(to).emit("ice-candidate", { from: socket.id, candidate });
        });

        // Notificar a otros usuarios sobre nuevas conexiones
        socket.on("join-room", roomId => {
            socket.join(roomId);
            socket.to(roomId).emit("user-connected", socket.id);
        });

        socket.on("broadCasting",   (email)   => {
            console.log("Administrador transmitiendo:", administrador);
            // Enviar mensaje a todos los clientes conectados   
            io.emit("admin-connected", email );
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

        
        //===========SFU==============
       
        // 🔹 Unirse a sala (crear o unirse)
          // Cuando un usuario se une a una sala

        // 🔹 Unirse a la sala
        socket.on("join-room", async ({ roomId, userId, username }, callback) => {
            console.log("📥 joinRoom:", socket.id, "sala:", roomId);
            
            let room = getRoom(roomId);
            if (!room) {
                room = await createRoom(roomId); // Asumiendo que createRoom usa el worker internamente
                console.log("🏠 Sala creada:", roomId);
            }
            
            // Guardar peer con datos básicos
            addPeer(socket.id, { 
                roomId, 
                userId, 
                username, 
                transports: [], 
                producers: [], 
                consumers: [] 
            });
            
            socket.join(roomId);

            // Devolver las capacidades del router para que el cliente cargue su device
            callback({
                rtpCapabilities: room.router.rtpCapabilities,
            });
        });

        // 🔹 Crear transport (WebRTC)
        socket.on("createTransport", async ({ roomId, direction }, callback) => {
            const room = getRoom(roomId);
            const peer = getPeer(socket.id);
            
            if (!room || !peer) return callback({ error: "Sala o Peer no encontrado" });

            // Crear el transport en el router del SFU
            const transport = await createWebRtcTransport(room.router);

            // Guardar transport en la estructura del peer
            peer.transports.push(transport);
            
            // Importante: Guardar si es para producir o consumir
            transport.appData = { direction };

            callback({
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            });
        });

        // 🔹 Conectar transport
        socket.on("connectTransport", async ({ transportId, dtlsParameters }, callback) => {
            const peer = getPeer(socket.id);
            const transport = peer?.transports.find(t => t.id === transportId);
            
            if (!transport) return callback?.({ error: "Transport no encontrado" });

            try {
                await transport.connect({ dtlsParameters });
                callback?.({ success: true });
            } catch (error) {
                callback?.({ error: error.message });
            }
        });

        // 🔹 Producir (Enviar stream al SFU)
        socket.on("produce", async ({ transportId, kind, rtpParameters, appData }, callback) => {
            const peer = getPeer(socket.id);
            const transport = peer?.transports.find(t => t.id === transportId);
            
            if (!transport) return callback?.({ error: "Transport no encontrado" });

            try {
                const producer = await transport.produce({ kind, rtpParameters, appData });
                
                peer.producers.push(producer);
                
                // Agregar referencia en la sala para que otros lo encuentren
                const room = getRoom(peer.roomId);
                if (!room.producers) room.producers = [];
                room.producers.push(producer);

                callback({ id: producer.id });

                // Notificar a todos los demás en la sala que hay un nuevo productor
                socket.to(peer.roomId).emit("new-producer", {
                    producerId: producer.id,
                    peerId: socket.id,
                    userId: peer.userId,
                    username: peer.username,
                    kind: producer.kind
                });
            } catch (error) {
                callback?.({ error: error.message });
            }
        });

        // 🔹 Consumir (Recibir stream del SFU)
        socket.on("consume", async ({ producerId, transportId, rtpCapabilities }, callback) => {
            const peer = getPeer(socket.id);
            const room = getRoom(peer?.roomId);
            const transport = peer?.transports.find(t => t.id === transportId);

            if (!room || !transport) return callback?.({ error: "Recursos no encontrados" });

            // Buscar el productor globalmente en la sala
            const producer = room.producers.find(p => p.id === producerId);
            if (!producer) return callback?.({ error: "Productor no encontrado" });

            if (!room.router.canConsume({ producerId, rtpCapabilities })) {
                return callback?.({ error: "No se puede consumir" });
            }

            try {
                const consumer = await transport.consume({
                    producerId,
                    rtpCapabilities,
                    paused: true, // Siempre pausado inicialmente
                });

                peer.consumers.push(consumer);

                callback({
                    id: consumer.id,
                    producerId,
                    kind: consumer.kind,
                    rtpParameters: consumer.rtpParameters,
                });
            } catch (error) {
                callback?.({ error: error.message });
            }
        });

        // 🔹 Reanudar consumo
        socket.on("resume", async ({ consumerId }, callback) => {
            const peer = getPeer(socket.id);
            const consumer = peer?.consumers.find(c => c.id === consumerId);

            if (consumer) {
                await consumer.resume();
                callback?.({ success: true });
            }
        });

        // 🔹 Obtener productores existentes (para usuarios que entran tarde)
        socket.on("getProducers", (callback) => {
            const peer = getPeer(socket.id);
            const room = getRoom(peer?.roomId);

            if (!room) return callback({ producers: [] });

            // Filtrar productores que no sean del propio usuario
            const producers = room.producers
                .filter(p => !peer.producers.includes(p))
                .map(p => ({
                    producerId: p.id,
                    kind: p.kind
                }));

            callback({ producers });
        });

        // 🔹 Desconexión
        socket.on("disconnect", () => {
            const peer = getPeer(socket.id);
            if (!peer) return;

            // 1. Eliminar sus productores de la sala
            const room = getRoom(peer.roomId);
            if (room) {
                room.producers = room.producers.filter(p => !peer.producers.includes(p));
            }

            // 2. Cerrar todos sus transports (cierra automáticamente producers y consumers asociados)
            peer.transports.forEach(t => t.close());

            removePeer(socket.id);
            socket.to(peer.roomId).emit("peer-left", { peerId: socket.id });
        });
    });
}
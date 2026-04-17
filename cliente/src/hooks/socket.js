import { io } from "socket.io-client";

let socket = null;

export const getSocket  = (apiUrl) => {
  if (!socket) {
    socket = io(apiUrl, {
    withCredentials: true,
    reconnection: false,         // Desactivar reconexión automática
    transports: ["websocket"],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000

    });

    socket.on("connect", () => {
      console.log("🟢 Socket único:", socket.id);
    });
  }

  return socket;
};


// export const getSocket = () => socket;
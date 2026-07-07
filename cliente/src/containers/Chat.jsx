import React, { useState, useContext, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { UserContext } from "../components/UserContext";
import AppContext from '../context/AppContext';
import { getSocket  } from "../hooks/socket";

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL_LOCAL; 
const apiUrl = API_URL;

const Chat = () => {
  const socketRef = useRef(null);
  // const { apiUrl } = useContext(AppContext);

  useEffect(() => {
    const socket = getSocket(apiUrl);
    socketRef.current = socket;
    
    socketRef.current.on("connect", () => {
      console.log("🟢 Conectado en chat:", socketRef.current.id);
    });
  },[]);

  const { email, logout, ownerData } = useContext(UserContext);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [alias, setAlias]=useState("");
  const username = email; // Podrías obtenerlo desde props o contexto

  const handleSend = () => {
    if (message.trim() === "") return;

      const newMessage = {
        user: ownerData?.alias || username,
        text: message,
        timestamp: new Date().toLocaleTimeString()
      }

    setMessages([...messages, newMessage]);

    // console.log(socketRef.current.id);
    socketRef.current.emit("message", newMessage);
    setMessage(""); // sólo limpias el input, el servidor se encargará de reflejarlo
  };

  //este useEffect se usa para recibir un mensaje, agregarlo al final de mensajes previos
  // y escuchar los que recibe
  useEffect(() => {
    const handleIncoming = (msg) => {
        //  console.log("RECIBIDO", msg);
          //  console.log("socket local:", socketRef.current.id);

          // console.log("from:", msg.from);

      setMessages((prevMessages) => [...prevMessages, msg]);
    };

    socketRef.current.on("message", handleIncoming);

    return () => {
      socketRef.current.off("message", handleIncoming);
    };
  }, []);

//   useEffect(() => {
//     console.log("messages:", messages);
// }, [messages]);

  return (
    <div className="bg-white p-4 rounded shadow-md">
      <h2 className="text-xl font-semibold mb-4">Comentarios de los asistentes</h2>

      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-red-600">
          Bienvenido, <b>{username}</b>
        </p>
        <button className="text-red-500 hover:underline text-sm">Salir</button>
      </div>

      <div className="border rounded p-2 h-48 overflow-y-auto bg-gray-50 mb-4">
        {messages.length === 0 ? (
          <p className="text-blue-500">No hay mensajes aún.</p>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className="mb-1">
              <span className="font-medium">{msg.user}:</span> 
                {msg.text}{" "}
              <span className="text-xs text-gray-400">({msg.timestamp})</span>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          className="border rounded px-2 py-1 flex-1"
          placeholder="Escribe un mensaje..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button
          className="bg-blue-600 text-black px-4 py-1 rounded hover:bg-blue-700"
          onClick={handleSend}
        >
          Enviar
        </button>
      </div>
    </div>
  );
};

export default Chat;

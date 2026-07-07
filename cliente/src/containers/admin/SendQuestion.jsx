import React, { useState, useContext, useRef, useEffect } from "react";
import { io } from "socket.io-client";
import { UserContext } from "../../components/UserContext";
import AppContext from '../../context/AppContext';
import { getSocket  } from "../../hooks/socket";



const SendQuestions = () => {
  const { apiUrl } = useContext(AppContext);
  const socketRef = useRef(null);

      useEffect(() => {
        const socket = getSocket(apiUrl);
        socketRef.current = socket;
        
        // socketRef.current.on("connect", () => {
        //   console.log("🟢 Conectado:", socketRef.current.id);
        // });
      },[]);


  // const [decisionText, setDecisionText] = useState("Propuesta de ejemplo para ser votada.");
  const { decisionText, setDecisionText } = useContext(UserContext);

  const SendtoUsers = (e) => {
    socketRef.current.emit('send-decision', decisionText);
  };

  return (
    <div className="bg-white p-4 rounded shadow-md space-y-4">
      <div>
        <textarea
          value={decisionText}
          onChange={(e) => setDecisionText(e.target.value)}
          className="w-full border rounded p-2"
          rows={4}
        />
        <button
            onClick={SendtoUsers}
            className="bg-blue-600 text-black px-6 py-2 rounded hover:bg-blue-700"
          >
            Envie Pregunta a los asistentes
          </button>
      </div>

      
    </div>
  );
};

export default SendQuestions;


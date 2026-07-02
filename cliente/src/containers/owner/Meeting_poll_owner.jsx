import React, { useState, useEffect, useContext, useRef } from "react";
import { io } from "socket.io-client";
import { UserContext } from "../../components/UserContext";
import AppContext from '../../context/AppContext';

const PollManage = () => {

  const { apiUrl } = useContext(AppContext);
  const socketRef = useRef(null);

  socketRef.current = io(`${apiUrl}`, {
    withCredentials: true,
    transports: ["websocket"]
  });

    const [decisionText, setDecisionText] = useState("Propuesta de ejemplo para ser votada.");
    const [displayTime, setDisplayTime] = useState("00:00");
    const { setVotingEnabled } = useContext(UserContext);
    let flag = false;
  
    useEffect(() => {
      socketRef.current.on('receive-decision', (text) => {
        setDecisionText(text);
      });

      socketRef.current.on('update-cronometer', ({ time }) => {
        if (!flag) {
          setVotingEnabled(true);
          setDisplayTime(time); // Necesitas un estado displayTime
          flag = true;
          return;
          } 
      });

      socketRef.current.on('end-cronometer', () => {
        alert("Tiempo terminado");
        flag=false;
        setVotingEnabled(false);
    });  
    

      // Limpieza para evitar múltiples listeners
      return () => {
        socketRef.current.off('receive-decision');
        socketRef.current.off('update-cronometer');
        socketRef.current.off('end-cronometer');
      };
    }, []);

    return (
        <div className="meeting__polling">
            <div className="meeting__polling--cronometer">
              <h3 className="text-red-600 mb-2">Cronometro: {displayTime}</h3>
              {/* {votingEnabled ? (
                <p>Opciones habilitadas</p>
              ) : (
                <p>Esperando inicio del cronómetro o ya terminó.</p>
              )} */}

            </div>
            <div className="meeting__poll--summary">
              <h2 className="text-red-600 mb-2">Resultados Votación</h2>
                  <canvas id="results" width="300" height="200"></canvas>
                  <div id="statical" hidden></div>
            </div>
        </div>
    );
};
export default PollManage;
import React, { useState, useEffect, useContext, useRef } from "react";
import { io } from "socket.io-client";
import axios from 'axios';
import { UserContext } from "../../components/UserContext";
import AppContext from '../../context/AppContext';
import { getSocket  } from "../../hooks/socket";

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL_LOCAL; 
const apiUrl = API_URL;

const Questions = () => {
  // const { apiUrl } = useContext(AppContext);
  const socketRef = useRef(null);

      useEffect(() => {
        const socket = getSocket(apiUrl);
        socketRef.current = socket;
        
        // socketRef.current.on("connect", () => {
        //   console.log("🟢 Conectado:", socketRef.current.id);
        // });
      },[]);

  const [selected, setSelected] = useState(null);
  const [decisionText, setDecisionText] = useState("");
  const { email, ownerData } = useContext(UserContext);
  // const [votingEnabled, setVotingEnabled] = useState(false); // Cambia a true cuando debas habilitar la votación
  const { votingEnabled, setVotingEnabled  } = useContext(UserContext);


  useEffect(() => {
      socketRef.current.on('receive-decision', text => {
        setDecisionText(text);
      });

      // Limpieza para evitar múltiples listeners
      return () => {
        socketRef.current.off('receive-decision');
      };
    }, []);

    //de userContext, votingEnabled viene falso.
  const handleVoteChange = async (e, decision) => {
    if (!votingEnabled) return;
    const value = e.target.value;
    setVotingEnabled(false); // Deshabilita la votación después de votar


    
    //solo pueden votar los que tienen participacion, es decir, son propietarios
    if (ownerData.participacion !== 0) {
      const nuevoVoto = {
        interior: ownerData.interior,
        apartamento: ownerData.apartamento,
        correo: email,
        proposicion: decision, 
        valor: parseInt(value),
      };
    }
    setSelected(null); //despues de registrar el voto, select pasa a null

    await axios.post(`${apiUrl}/api/votacion`, nuevoVoto)
      .then(response => {
      })
    .catch(error => {
      console.error('Error al enviar votos:', error);
     }); 
  };

  return (
    <div className="bg-white p-4 rounded shadow-md space-y-4">
      <div>
        <textarea
          value={decisionText}
          readOnly
          className="w-full border rounded p-2"
          rows={4}
        />
      </div>

      {votingEnabled ? (
        <p className="text-green-600">¡Puedes votar ahora! ✅</p>
      ) : (
        <p className="text-red-400">La votación aún no está habilitada ⏳</p>
      )}


      <form className="space-y-2">
        <fieldset>
          <legend className="font-medium mb-2">Opciones para decidir sobre propuesta</legend>
          <label className="block">
            <input
              type="radio"
              name="myRadio"
              value="1"
              disabled={!votingEnabled}
              checked={selected === "1"}
              onChange={ (e) => handleVoteChange(e, decisionText)}
            />{" "}
            Aprueba
          </label>
          <label className="block">
            <input
              type="radio"
              name="myRadio"
              value="2"
              disabled={!votingEnabled}
              checked={selected === "2"}
              onChange={ (e) => handleVoteChange(e, decisionText) } 
            />{" "}
            Rechaza
          </label>
          <label className="block">
            <input
              type="radio"
              name="myRadio"
              value="0"
              disabled={!votingEnabled}
              checked={selected === "0"}
              onChange={ (e) => handleVoteChange(e, decisionText) }
            />{" "}
            Blanco
          </label>
        </fieldset>
      </form>
    </div>
  );
};

export default Questions;


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

// const group = useRef(null);
  // const [decisionText, setDecisionText] = useState("Propuesta de ejemplo para ser votada.");
  const { decisionText, setDecisionText, setGroupId, groupId, setOptionsLabel, optionsLabel, } = useContext(UserContext);
  const [campos, setCampos] = useState(['']);

  const deleteVoting = () => {
    socketRef.current.emit('delete-voting');
    setDecisionText("Propuesta de ejemplo para ser votada.");
    setGroupId("");
    setOptionsLabel({});
    setCampos(['']);
  };

  const SendtoUsers = (e) => {
    socketRef.current.emit('send-decision', decisionText);
    SendValuesToUsers();
  };
  //aprueba, rechaza, blanco
  const SendValuesToUsers =  (e) => {

    const options = {
      option1: "Aprueba",
      option2: "Rechaza",
      option3: "Blanco"
    };
    setOptionsLabel(options);

    socketRef.current.emit('send-values',  options );
    setOptionsLabel({});
  };

  const SendOptionsToUsers = (e) => {
    socketRef.current.emit('send-options',   { campos, groupId }  );
  };

  

  const agregarCampo = () => {
    setCampos([...campos, '']);
  };

  const manejarCambioCampo = (index, event) => {
    const nuevosCampos = [...campos];
    nuevosCampos[index] = event.target.value;
    setCampos(nuevosCampos);
  };

  const eliminarCampo = (index) => {
    const nuevosCampos = campos.filter((_, i) => i !== index);
    setCampos(nuevosCampos);
  }


  return (
    <div className="bg-white p-4 rounded shadow-md space-y-4">
      <>
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

        <button
            onClick={deleteVoting}
            className="bg-blue-600 text-black px-6 py-2 rounded hover:bg-blue-700"
          >
            Reiniciar Votación
        </button>



        <div>
      <h3>Lista de Opciones</h3>
      <input
        type="text"
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        placeholder="Ingrese identificador"
      />
      {campos.map((campo, index) => (
        <div key={index} style={{ marginBottom: '8px' }}>
          <input
            type="text"
            value={campo}
            onChange={(e) => manejarCambioCampo(index, e)}
            placeholder={`Opción ${index + 1}`}
          />
          <button type="button" onClick={() => eliminarCampo(index)} style={{ marginLeft: '8px' }}>
            Eliminar
          </button>
        </div>
      ))}

        <button type="button" onClick={agregarCampo} style={{ marginTop: '10px' }}>
        + Agregar Campo
          </button>
        </div>

       
        <button
            onClick={ () => {
                SendOptionsToUsers();
            } }
            className="bg-blue-600 text-black px-6 py-2 rounded hover:bg-blue-700"
          >
            Envie Opciones a los asistentes
        </button>
        
      </>
      
    </div>
  );
};

export default SendQuestions;


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
  const { decisionText, setDecisionText, setGroupId, groupId } = useContext(UserContext);
  const [campos, setCampos] = useState(['']) ;
  const [option1, setOption1] = useState("");
  const [option2, setOption2] = useState("");
  const [option3, setOption3] = useState("");


  const SendtoUsers = (e) => {
    socketRef.current.emit('send-decision', decisionText);
  };
  //aprueba, rechaza, blanco
  const SendValuesToUsers = (e) => {
    socketRef.current.emit('send-values',  { option1, option2, option3 } );
  };

  const SendOptionsToUsers = (e) => {
    socketRef.current.emit('send-options',   campos, groupId  );
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

        <br />
        <input 
          value={option1} 
          onChange={(e) => setOption1(e.target.value)} 
          className="border rounded p-2"
          placeholder="Opción 1"
        />
        <br />
        <input 
          value={option2} 
          onChange={(e) => setOption2(e.target.value)} 
          className="border rounded p-2"
          placeholder="Opción 2"
        />
        <br />
        <input 
          value={option3} 
          onChange={(e) => setOption3(e.target.value)} 
          className="border rounded p-2"
          placeholder="Opción 3"
        />
        <br />

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
              if (option1 || option2 || option3) {
                SendValuesToUsers();
              } else {
                SendOptionsToUsers();
              }
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


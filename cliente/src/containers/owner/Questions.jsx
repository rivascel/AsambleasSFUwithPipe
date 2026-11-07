import React, { useState, useEffect, useContext, useRef } from "react";
import { io } from "socket.io-client";
import axios from 'axios';
import { UserContext } from "../../components/UserContext";
import AppContext from '../../context/AppContext';
import { getSocket  } from "../../hooks/socket";

import API_URL from '../../config/api';
// const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL_LOCAL; 


const apiUrl = API_URL;

const Questions = () => {
  // const { apiUrl } = useContext(AppContext);
  const socketRef = useRef(null);
  const group = useRef(null);

  useEffect(() => {
    const socket = getSocket(apiUrl);
    socketRef.current = socket;
    
    // socketRef.current.on("connect", () => {
    //   console.log("🟢 Conectado:", socketRef.current.id);
    // });
  },[]);

  const [selected, setSelected] = useState(false);
  const [decisionText, setDecisionText] = useState("");
  const { email, ownerData, setOptionsLabel, optionsLabel, setCampos, campos, groupId, setGroupId } = useContext(UserContext);
  const [voting, setVoting] = useState(false); // Cambia a true cuando debas habilitar la votación
  const [voteOptions, setVoteOptions] = useState(false);
  const [voteOpenValues, setVoteOpenValues] = useState(false);
  // const { setVotingEnabled  } = useContext(UserContext);
  // const [options, setOptions] = useState("");

  useEffect(() => {
      socketRef.current.on('receive-decision', text => {
        setSelected(false); // Reinicia el estado de selección
        setDecisionText(text);
      });

      socketRef.current.on('receive-values', options => {
        console.log("Valores recibidos:", options);
        // Aquí puedes manejar los valores recibidos según tus necesidades
        setVoteOptions(true);

        setOptionsLabel({
          option1: options.option1,
          option2: options.option2,
          option3: options.option3
        });
      });

      socketRef.current.on('receive-options', ( { options, groupId }) => {
        console.log("Opciones recibidas abiertas:", { options, groupId });
        // Aquí puedes manejar las opciones recibidas según tus necesidades
        console.log("Opciones recibidas abiertas sin grupo:", options);
        setGroupId(groupId); // Asigna el valor del identificador al input
        setVoteOpenValues(true);
        setCampos(options);

      });

      socketRef.current.on("inicioVotacion", text=>{
        setSelected(true);
        setVoting(text);
      });
      // Limpieza para evitar múltiples listeners
      return () => {
        socketRef.current.off('receive-decision');
        socketRef.current.off('receive-options');
        socketRef.current.off('inicioVotacion');
      };
    }, []);

    //de userContext, votingEnabled viene falso.
  const handleVoteChange = async (e, decision) => {
    // if (!votingEnabled) return;
    const value = e.target.value;

    setVoting(false); //deshabilita la votacion

    setTimeout(()=>{
      setSelected(false);
    }, 5000)
    
    //solo pueden votar los que tienen participacion, es decir, son propietarios
    // if (ownerData.participacion !== 0) {
      const nuevoVoto = {
        interior: ownerData.interior,
        apartamento: ownerData.apartamento,
        correo: email,
        proposicion: decision, 
        valor: parseInt(value),
      };
    // }
    // setSelected(null); //despues de registrar el voto, select pasa a null

    await axios.post(`${apiUrl}/api/votacion`, nuevoVoto, { withCredentials: true })
      .then(response => {
      })
    .catch(error => {
      console.error('Error al enviar votos:', error);
     }); 
  };

  //manejo voto de opciones 
  const handleVoteChangeOptions = async (e, option) => {
    // if (!votingEnabled) return;
    const value = e.target.value;
    // console.log("Voto de opciones:", option, "Valor:", value);

    setVoting(false); //deshabilita la votacion
    

    setTimeout(()=>{
      setSelected(false);
    }, 5000)
    
    //solo pueden votar los que tienen participacion, es decir, son propietarios
    // if (ownerData.participacion !== 0) {
      const nuevoVoto = {
        interior: ownerData.interior,
        apartamento: ownerData.apartamento,
        correo: email,
        proposicion: option, 
        valor: parseInt(value),
        groupId: groupId // Incluye el identificador del grupo
      };
    // }
    // setSelected(null); //despues de registrar el voto, select pasa a null

    await axios.post(`${apiUrl}/api/votacion`, nuevoVoto, { withCredentials: true })
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
      <div>
        {Object.values(campos).map((option, index) => (

          <label className="block" key={option}>
            <p key={index}>{option}</p>
            {" "}
          </label>
          
        ))}
      </div>


      {selected? ( 
      
        voting ? (
          voteOpenValues ? (
            <>
            <p className="text-green-600">¡Puedes votar ahora! ✅</p>

            <div className="text-gray-500 text-sm">
              <h3 className="font-semibold mb-1">Opciones para decidir sobre planillas:</h3>
              <br />
              <div className="text-gray-500 text-sm">
                <p>Seleccione una opción</p>
              </div>
              {Object.values(campos).map((option, index) => (
                <label className="block" key={option}>
                  <input
                    type="radio"
                    name="myRadio"
                    value={index+1}
                    disabled={!voting}
                    // checked={selected === "1"}
                    onChange={ (e) => handleVoteChangeOptions(e, option)}
                    placeholder={`Opción ${index + 1} - ${option}`}
                    className="mr-2"
                  />{" "}
                  {option}
                </label>
                // <p key={index}>{option}</p>
              ))}
            </div>
            </>
          ) : 
            voteOptions ? (
            <>
              <p className="text-green-600">¡Puedes votar ahora! ✅</p>

            <form className="space-y-2">
              <fieldset>
                <legend className="font-medium mb-2">Opciones para decidir sobre propuesta</legend>
                <label className="block">
                  <input
                    type="radio"
                    name="myRadio"
                    value="1"
                    disabled={!voting}
                    // checked={selected === "1"}
                    onChange={ (e) => handleVoteChange(e, decisionText)}
                    className="mr-2"
                  />{" "}
                  {optionsLabel.option1}
                  
                </label>
                <label className="block">
                  <input
                    type="radio"
                    name="myRadio"
                    value="2"
                    disabled={!voting}
                    // checked={selected === "2"}
                    onChange={ (e) => handleVoteChange(e, decisionText) } 
                    className="mr-2"
                  />{" "}
                  {optionsLabel.option2}
                </label>
                <label className="block">
                  <input
                    type="radio"
                    name="myRadio"
                    value="0"
                    disabled={!voting}
                    // checked={selected === "0"}
                    onChange={ (e) => handleVoteChange(e, decisionText) }
                  />{" "}
                  {optionsLabel.option3}
                </label>
              </fieldset>
            </form>
            </>
          ):  (
        
          <p className="text-red-400">Ya votó por planillas ⏳</p>
          
          )
        ) : (
          <p className="text-red-400">Ya votó ⏳</p>
        )
        ):(
          <p className="text-gray-500">Esperando inicio de votación ⏳</p>

        )
      }



    </div>
  );
};

export default Questions;


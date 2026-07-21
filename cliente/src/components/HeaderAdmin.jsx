import React, { useEffect, useState, useContext, useRef } from 'react';
import axios from 'axios';
import '../styles/Header.css';
import { getSocket  } from "../hooks/socket";

// import { UserContext } from "../components/UserContext";

import { UserContext } from "./UserContext";

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL_LOCAL; 
const apiUrl = API_URL;


const Header = () => {
    const { email, ownerData, quorumPercentage  } = useContext(UserContext);
    const [connectedUsers, setConnectedUsers] = useState([]);

    const socketRef = useRef(null);
    const [quorum, setQuorum] = useState(0);
    const numberHousesRef = useRef(null); // Ref para mantener el valor actual
    const sesionRef = useRef(null); // Ref para mantener el valor actual

    const ownerDataRef   = useRef([]); // Ref para mantener el valor actual

    const [sesion, setSesion] = useState(null);
    const [numberHouses, setNumberHouses] = useState(0);


    useEffect(() => {

        if (sesion === null || sesion === undefined || sesion === 0) return; 
        const socket = getSocket(apiUrl);
        socketRef.current = socket;
        socketRef.current.emit("sesionStarted", sesion);
        fetchOwners(); // Recupera propietarios al iniciar sesión
        calcularQuorum(ownerDataRef.current); // Calcula el quorum al iniciar sesión
        

        return () => { 
          socketRef.current.off("sesionStarted"); 
          socketRef.current.off("updateConnectedUsers",  handleUpdate)
        }

    }, [sesion]);

    useEffect(() => {

      const socket = getSocket(apiUrl);
      socketRef.current = socket;

      const handleUpdate = () => {
        fetchOwners(); //recupera inscritos al momento
      };

      if (numberHouses > 0 && ownerDataRef.current.length > 0) {
        calcularQuorum(ownerDataRef.current);
      }
  
      socketRef.current.on("requestJoinSesion",  handleUpdate);

      return () => {
        if (socketRef.current) {
            socketRef.current.off("requestJoinSesion");
            // })
        } 
      }
        
    },[]);

    
    const fetchOwners = async () => {
        console.log("🔄 fetchOwners llamado - ");
        
        try {
          const response = await axios.get(`${apiUrl}/api/emailFile`, {
            withCredentials: true,
          });
          if (Array.isArray(response.data)) {

            ownerDataRef.current = response.data; 
            calcularQuorum(response.data);

          } else {
            console.error("❌ El endpoint no devolvió un array.");
          }
        } catch (err) {
          console.error("Error al obtener todos los propietarios:", err);
        }
    };

    const calcularQuorum = (data) => {

      const currentNumberHouses  = Number(numberHousesRef.current.value); // Usar el valor actual de la ref

      console.log("📊 Calculando quorum con:", {
            dataLength: data?.length || 0,
            numberHouses: currentNumberHouses
        });
      
      if (!data || !data.length || currentNumberHouses === 0) {
        setQuorum(0);
        return 0;
      };
  
      const SumItems = data.reduce((acumulator, objeto) => acumulator + parseInt(objeto.participacion), 0);

      const quorumPercentage = (SumItems / currentNumberHouses) * 100;
      
      // console.log("SumItems:", SumItems);
      // console.log("numberHouses:", currentNumberHouses);
      // console.log("quorumPercentage:", quorumPercentage);
      
      setQuorum(quorumPercentage);
      
       // ✅ EMITIR EL QUORUM POR SOCKET - Verificar que socket existe
        if (socketRef.current) {
            console.log("📤 Emitiendo quorumCalculated:", quorumPercentage);
            socketRef.current.emit("quorumCalculated", quorumPercentage);
            socketRef.current.emit("numberHouses", numberHouses);
        }

      
      return quorumPercentage;

    }
    
     // Manejar cambios en el input
    // const handleNumberHousesChange = (e) => {
    //     const value = parseInt(e.target.value);
    //     if (!isNaN(value) && value >= 0) {
    //         setNumberHouses(value);
    //     }
    // };

    // const handleSesionChange = (e) => {
    //     const value = parseInt(e.target.value);
    //     if (!isNaN(value) && value >= 0) {
    //         setSesion(value);
    //     }
    // };

    const handleUpdateValues = () => {
       // Obtener valores directamente del DOM
      const numberHousesValue = parseInt(numberHousesRef.current.value);
      const sesionValue = parseInt(sesionRef.current.value);

      console.log(numberHousesRef.current.value);
      console.log(numberHousesValue);
      
      // Validar y actualizar estados
      if (!isNaN(numberHousesValue) && numberHousesValue >= 0) {
          setNumberHouses(numberHousesValue);
      }
      
      if (!isNaN(sesionValue) && sesionValue >= 0) {
          setSesion(sesionValue);
      }
    }

    return (
        <header style={{
            backgroundColor: '#282c34',
            padding: '1rem',
            color: 'white',
            textAlign: 'center',
          }}>
            <h1>Web Asambleas</h1>
            <h3>Sesion Administrador</h3>
            <div className="flex flex-row p-2 m-2 bg-blue gap-6 place-content-center">
              <div>
                <div className="p-1">
                        <strong>Inmuebles copropiedad </strong>
                        <input 
                          type="number" 
                          id="inmuebles" 
                          ref={numberHousesRef}
                          // defaultValue={numberHouses}  // Usar defaultValue en lugar de value
                          // min="0"
                        // value={numberHouses}
                        // onChange={handleNumberHousesChange}
                        // onChange={(e) => setNumberHouses(parseInt(e.target.value)) } 
                        // min="0 
                        />
                </div>

                <div className="p-1">
                    <strong>Sesion Asamblea </strong>
                    <input 
                      type="number" 
                      id="sesion" 
                      ref={sesionRef}
                      // defaultValue={sesion}
                      // min="0"
                    />
                </div>

                <div className="bg-blue-600 text-black px-6 py-2 rounded hover:bg-blue-700">
                  <button onClick={() => {
                    handleUpdateValues()
                  }}
                  >Actualizar propietarios - Iniciar sesión</button>
                </div>

              </div>
                    
                <div className="p-1">
                    <strong>Porcentaje de asistencia - quorum </strong>
                    <div id="quorum">
                        {typeof quorum === "number" && !isNaN(quorum) ? `${quorum.toFixed(2)}%` : "No disponible"}
                    </div>
                </div>

                  <p id="mensajeError"></p>
                  <p id="resultado">  </p>
            </div>
            
        </header>
    );
};

export default Header;
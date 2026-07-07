import React, { useEffect, useState, useContext, useRef } from 'react';
import axios from 'axios';
import '../styles/Header.css';
import { getSocket  } from "../hooks/socket";

// import { UserContext } from "../components/UserContext";

import { UserContext } from "./UserContext";

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL_LOCAL; 
const apiUrl = API_URL;


const Header = () => {
    const { email, ownerData, properties, quorumPercentage  } = useContext(UserContext);
    const [connectedUsers, setConnectedUsers] = useState([]);
    const [numberHouses, setNumberHouses] = useState(0);
    const socketRef = useRef(null);
    const [quorum, setQuorum] = useState(0);
    const numberHousesRef = useRef(0); // Ref para mantener el valor actual
    const ownerDataRef   = useRef([]); // Ref para mantener el valor actual
    // let calcularQuorum = 0;
    // let quorumPercentage = 0;


    useEffect(() => {
      const socket = getSocket(apiUrl);
      socketRef.current = socket;

      fetchOwners();

      const handleUpdate = () => {
        fetchOwners();
      };
  
      socketRef.current.on("updateConnectedUsers",  handleUpdate);
      console.log("🟢 Escuchando 'updateConnectedUsers'");

      return () => {
        if (socketRef.current) {
          // socketRef.current.off("updateConnectedUsers", handleUpdate);
            socketRef.current.off("updateConnectedUsers",  handleUpdate);
        } 
      }
        
    },[]);


    const calcularQuorum = (data) => {

      const currentNumberHouses  = numberHousesRef.current; // Usar el valor actual de la ref

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
      
      console.log("SumItems:", SumItems);
      console.log("numberHouses:", currentNumberHouses);
      console.log("quorumPercentage:", quorumPercentage);
      
      setQuorum(quorumPercentage);
      // QuorumPercentage(quorumPercentage); //el que va a userContext

      
       // ✅ EMITIR EL QUORUM POR SOCKET - Verificar que socket existe
        if (socketRef.current) {
            console.log("📤 Emitiendo quorumCalculated:", quorumPercentage);
            socketRef.current.emit("quorumCalculated", quorumPercentage);
        } else {
            console.warn("⚠️ Socket no disponible para emitir quorum");
        }
        
      return quorumPercentage;

    }
    
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

    useEffect(() => {

      numberHousesRef.current = numberHouses;
      
      const handleUpdate = () => {
          fetchOwners();
      };

      if (numberHouses > 0 && ownerDataRef.current.length > 0) {
        calcularQuorum(ownerDataRef.current);
      }
    
      socketRef.current.on("updateConnectedUsers",  handleUpdate);
      console.log("🟢 Escuchando 'updateConnectedUsers'");

      return () => socketRef.current.off("updateConnectedUsers", handleUpdate);

    },[numberHouses]);

     // Manejar cambios en el input
    const handleNumberHousesChange = (e) => {
        const value = parseInt(e.target.value);
        if (!isNaN(value) && value >= 0) {
            setNumberHouses(value);
        }
    };

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

                    <div className="p-1">
                        <strong>Inmuebles copropiedad </strong>
                        <input type="number" id="inmuebles" 
                        value={numberHouses}
                        onChange={handleNumberHousesChange}
                        // onChange={(e) => setNumberHouses(parseInt(e.target.value)) } 
                        // min="0 
                        />
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
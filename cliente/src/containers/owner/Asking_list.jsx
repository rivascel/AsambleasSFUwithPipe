import React, { useState, useEffect, useContext, useRef } from "react";
import { connect, io } from "socket.io-client";
import axios from 'axios';
import { listenToRequests, getPendingRequest, ApprovedUserQuery, approveUser, deleteCandidate } from "../../supabase-client";
import AppContext from '../../context/AppContext';
import { UserContext } from "../../components/UserContext";
import { getSocket  } from "../../hooks/socket";

const AttendeesList = () => {
  const { apiUrl } = useContext(AppContext);
  const { email } = useContext(UserContext);
  const socketRef = useRef(null);
  const roomId = 'main-room';
  const [loading, setLoading] = useState(true);
  const [pendingUsersIds, setPendingUsersIds] = useState([]);
  const ownerData = useRef();

   // Elimina updatedUsers y usa los estados directamente
  const hasPending = pendingUsersIds.length > 0;

  const usersPending = useRef({});

  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);


  useEffect(() => {
    const socket = getSocket(apiUrl);
    socketRef.current = socket;
    
    // socketRef.current.on("connect", () => {
    //   console.log("🟢 Conectado:", socketRef.current.id);
    // });
  },[]);
  
  useEffect( ()=>{
    let isMounted = true;
    let channelRequests, channelApprovals,channelReqAppr;

    const fetchUsers = async () => {
      try {
        console.log("🔄 Ejecutando fetchUsers...");
          const pendingRes=await getPendingRequest(roomId);

        console.log("pendingUsers:", pendingRes);

        const pendingIds = Array.isArray(pendingRes) 
          ? pendingRes.map(user => user?.user_id || user?.id).filter(id => id) 
          : [];

        console.log(`📊 Resultado fetchUsers - Pendientes: ${pendingIds.length}`);

        if (isMounted) {
          setPendingUsersIds(pendingIds);
          setLoading(false);
          
          console.log("✅ Estados actualizados:", {
            pending: pendingIds,
          });
        }
      } catch (error) {
          // console.error("Error cargando usuarios:", error);
          if (isMounted) {
            setLoading(false);
          }
        }
    };

    // Función para manejar cambios, carga usuarios si hay un cambio en el listenToRequests
    const handleChange = (type) => {
      console.log(`📡 Cambio detectado en ${type}`);
      if (isMounted) {
        fetchUsers();
      }
    };

    //este recupera los usuarios cuando carga pagina
    fetchUsers();


    // Configurar suscripciones (sin filtrar)
      channelReqAppr = listenToRequests(
        "main-room",
        { componentId: 'AttendeesList' },
        () => handleChange('solicitudes/Aprobacion'),
        // false
      );

    // Limpieza
    return () => {
      console.log("🧹 Limpiando efectos...");
      isMounted = false;
      if (channelReqAppr) {
        console.log("Desuscribiendo channelRequests");
        channelReqAppr.removeChannel();
      }
    };
},[]);

useEffect(() => {
   if (hasLoaded) return; // Evita ejecuciones múltiples

  const fetchOwners = async () => {
    try {
      setIsLoading(true);

      const response = await axios.get(`${apiUrl}/api/emailFile`, {
        withCredentials: true,
      });
      console.log("Respuesta de /api/emailFile en asking:", response.data);
      if (Array.isArray(response.data)) {

        setPendingUsersIds(prevPending => {
          return prevPending.map((userId) => {
             // Buscar el owner por correo
            const owner = response.data.find(owner => owner.correo === userId);
            
            if (owner) {
              console.log(`✅ Reemplazado: ${userId} -> ${owner.alias}`);
              return owner;
            } else {
              console.warn(`⚠️ Usuario no encontrado: ${userId}`);
              return userId; // Mantener el string si no se encuentra
            }

          });
        });
          
      setHasLoaded(true);
      } else {
        console.error("❌ El endpoint no devolvió un array.");
      }
    } catch (err) {
      console.error("Error al obtener todos los propietarios:", err);
    } finally {
      setIsLoading(false);
    }
  };
  fetchOwners();
}, [pendingUsersIds, hasLoaded]); 

  // Keep only the logging useEffect for debugging
  // useEffect(() => {
  //   console.log("📊 Estado actual:", {
  //     pendingUsersIds, 
  //     hasPending,
  //     loading
  //   });
  // }, [pendingUsersIds, hasPending, loading]);


    // Renderizado simplificado
  const renderContent = () => {
    if (loading) {
      return <p>Cargando...</p>;
    }

    if (!hasPending) {
      return <p className="text-gray-600 mb-2">No hay usuarios pendientes.</p>;
    }

    return (
        <>
          {hasPending && (
            <div className="mb-6">
              <h2 className="text-lg font-bold mb-2">Usuarios pendientes</h2>
              {pendingUsersIds.map((user, index) => (

                
                <div key={`pending-${index}`} className="mb-2 p-2 border rounded">
                  <p>
                    
                    {
                    typeof user === 'object' && user !== null 
                    ? 
                    user.alias 
                    : user
                    }
                  </p>
 
                </div>
              ))}
            </div>
          )}
          

        </>
      );
  };

  return (
    <div className="bg-white p-4 rounded shadow-md text-center">
      <p className="text-green-600 font-medium mb-4">Solicitudes recibidas</p>
      {renderContent()}
    </div>
  );
};

export default AttendeesList;

       
import React, { useState, useEffect, useContext, useRef } from "react";
import { io } from "socket.io-client";
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
  const [approvedUsersIds, setApprovedUsersIds] = useState([]);

   // Elimina updatedUsers y usa los estados directamente
  const hasPending = pendingUsersIds.length > 0;
  const hasApproved = approvedUsersIds.length > 0;


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
          const approvedRes=await ApprovedUserQuery(roomId);

        console.log("pendingUsers:", pendingRes);
        console.log("approvedUsers:", approvedRes);

        const pendingIds = Array.isArray(pendingRes) 
          ? pendingRes.map(user => user?.user_id || user?.id).filter(id => id) 
          : [];

        const approvedIds = Array.isArray(approvedRes) 
          ? approvedRes.filter(id => id) 
          : [];
        
        console.log(`📊 Resultado fetchUsers - Pendientes: ${pendingIds.length}, Aprobados: ${approvedIds.length}`);

        if (isMounted) {
          setPendingUsersIds(pendingIds);
          setApprovedUsersIds(approvedIds);
          setLoading(false);
          
          console.log("✅ Estados actualizados:", {
            pending: pendingIds,
            approved: approvedIds
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

  // Keep only the logging useEffect for debugging
  useEffect(() => {
    console.log("📊 Estado actual:", {
      pendingUsersIds, 
      approvedUsersIds,
      hasPending,
      hasApproved,
      loading
    });
  }, [pendingUsersIds, approvedUsersIds, hasPending, hasApproved, loading]);


  const handleApprove = async (userId) => {
    try {
      console.log(`✅ Aprobando usuario ${userId} en el servidor...`);
      approveUser(roomId, userId);

      // if (response.ok) {
        // console.log(`✅ Usuario ${userId} aprobado en el servidor`);

        socketRef.current.emit("approval-notification", { userId, roomId: "main-room" });
        
        // CORRECCIÓN AQUÍ: Filtrar por ID (string), no por user.user_id
        setPendingUsersIds(prev => prev.filter(id => id !== userId));
        
        // CORRECCIÓN AQUÍ: Agregar a aprobados
        setApprovedUsersIds(prev => [...prev, userId]);
        
        // console.log(`✅ Estados locales actualizados: 
        //   Pendientes eliminado: ${userId}
        //   Aprobados agregado: ${userId}`);
      // } else {
      //   console.error("❌ Error en la respuesta del servidor");
      // }
    } catch (err) {
      console.error("❌ Error al aprobar usuario:", err);
    }
  }

  const handleCancel = async (userId) => {
    try {

      deleteCandidate(userId);
      
      // if (response.ok) {
        console.log(`✅ Aprobación de ${userId} cancelada en el servidor`);

        socketRef.current.emit("cancel-notification", { userId, roomId: "main-room" });
        
        // Actualiza los estados localmente
        setApprovedUsersIds(prev => prev.filter(id => id !== userId));
        
        // console.log(`✅ Estado local actualizado: Aprobados eliminado: ${userId}`);
      // } else {
      //   console.error("❌ Error en la respuesta del servidor");
      // }
    } catch (err) {
      console.error("❌ Error al cancelar aprobación:", err);
    }
  };
    // Renderizado simplificado
  const renderContent = () => {
    if (loading) {
      return <p>Cargando...</p>;
    }

    if (!hasPending && !hasApproved) {
      return <p className="text-gray-600 mb-2">No hay usuarios pendientes ni aprobados.</p>;
    }

    return (
        <>
          {hasPending && (
            <div className="mb-6">
              <h2 className="text-lg font-bold mb-2">Usuarios pendientes</h2>
              {pendingUsersIds.map((userId, index) => (
                <div key={`pending-${userId}-${index}`} className="mb-2 p-2 border rounded">
                  <p>{userId}</p>
                  <button
                    onClick={() => handleApprove(userId)}
                    className="bg-green-500 text-red px-3 py-1 rounded hover:bg-green-600 mt-1"
                  >
                    Aprobar
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {hasApproved && (
            <div>
              <h2 className="text-lg font-bold mb-2">Usuarios aprobados</h2>
              {approvedUsersIds.map((userId, index) => (
                <div key={`approved-${userId}-${index}`} className="mb-2 p-2 border rounded">
                  <p>{userId}</p>
                  <button
                    onClick={() => handleCancel(userId)}
                    className="bg-red-500 text-red px-3 py-1 rounded hover:bg-red-600 mt-1"
                  >
                    Cancelar aprobación
                  </button>
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

       
import React, { useState, useEffect, useContext, useRef } from "react";
import axios from "axios";
import { UserContext } from "../../components/UserContext";
import { io } from "socket.io-client";
import { listenToUserRequests, requestToJoinRoom, getPendingRequest, getPendingRequestById, 
  getApprovedUserById, deleteCandidate /*ApprovedUserQuery,approveUser*/ } from '../../supabase-client';
import AppContext from '../../context/AppContext';
import { getSocket  } from "../../hooks/socket";
import Button from '../../components/components/Button/';
import Title from '../../components/components/Title';

const AskToParticipate = () => {
  const { apiUrl } = useContext(AppContext);
  
  const socketRef = useRef(null);
  const roomId = 'main-room';
  const [loading, setLoading] = useState(true);
  const [displayTime, setDisplayTime] = useState("00:00");
  const { email, setCheckApprove } = useContext(UserContext);
  const [requestStatus, setRequestStatus] = useState(() => {
  const saved = localStorage.getItem("requestStatus");
  let flag;
  
  // console.log("💾 [AskToParticipate] Estado cargado de localStorage:", saved);
  if (!saved || saved === "undefined") return "none";
  return saved;
  });


  useEffect(() => {
    const socket = getSocket(apiUrl);
    socketRef.current = socket;
    
    // socketRef.current.on("connect", () => {
    //   console.log("🟢 Conectado:", socketRef.current.id);
    // });
  },[]);

  useEffect(() => {
    localStorage.setItem("requestStatus", requestStatus);

    if (requestStatus === undefined || requestStatus === "undefined") {
      localStorage.setItem("requestStatus", "none");
      // return;
    } else {
      localStorage.setItem("requestStatus", requestStatus);
      // console.log("🔄 requestStatus cambió:", requestStatus);
    }
    
  }, [requestStatus]);

  useEffect(() => {
  if (!email) return;
  
  // console.log("👤 [AskToParticipate] Configurando listener para usuario:", email);
  
  const channel = listenToUserRequests(
    roomId, 
    email, 
    (requestData) => {
      // console.log("📨 [AskToParticipate] Datos recibidos:", {
      //   data: requestData,
      //   timestamp: new Date().toISOString(),
      //   // currentStatus: requestStatus // Agrega el estado actual
      // }
      // );
      
      if (requestData._deleted) {
        // console.log("🗑️ [AskToParticipate] DELETE detectado, cambiando a 'none'");
        // console.log("🗑️ user_id:", requestData.user_id, "email:", email);
        setRequestStatus('none');
      } 
      else if (requestData._event === 'approved') {
        console.log("✅ [AskToParticipate] Solicitud aprobada!");
        setRequestStatus('approved');
      }
      // else if (requestData._event === 'created') {
      //   console.log("📝 [AskToParticipate] Solicitud creada");
      //   setRequestStatus('pending');
      // }
      // else if (requestData._event === 'updated') {
      //   console.log("✏️ [AskToParticipate] Solicitud actualizada:", requestData.status);
      //   setRequestStatus(requestData.status);
      // }
    },
    {
      componentId: 'AskToParticipate', // Cambia a nombre del componente
    }
  );
  
  return () => {
    // console.log("🧹 [AskToParticipate] Limpiando listener");
    channel.unsubscribe();
  };
}, [email, roomId]);

  useEffect( ()=>{
    if (!email) return;

    try {

        const pendingUsersById=getPendingRequestById(roomId, email) || [];
        const approvedUsersById=getApprovedUserById(roomId, email) || [];

      if (Array.isArray(pendingUsersById) && pendingUsersById.includes(email)) {
      } else if (Array.isArray(approvedUsersById) && approvedUsersById.includes(email)) {
      }


    } catch (error) {
      console.error("Error cargando usuarios:", error);
    } finally {
      setLoading(false);
    }
    
  },[email]);

  const handleRequest = async () => {
    try {
      requestToJoinRoom(roomId, email);
      
      // setReq(true);
      setRequestStatus('pending');

    } catch (err) {
      console.error(err);
      console.log("Error al enviar la solicitud.");
    }
  };

  const cancelRequest = async () => {
    try {
      deleteCandidate(email, roomId )
      setRequestStatus('none');
      // setReq(false);

    } catch (err) {
      console.error(err);
      console.log("Error al enviar la solicitud.");
    }
  };

 useEffect(() => {

  socketRef.current.on('update-cronometer', ({ time }) => {
    // if (!flag) {
      setCheckApprove(true);
      setDisplayTime(time); // Necesitas un estado displayTime
      // flag = true;
      return;
      // } 
  });

    socketRef.current.on('end-cronometer', () => {
      alert("Tiempo terminado");
      setCheckApprove(false);
      // flag=false;
  });  


  // Limpieza para evitar múltiples listeners
  return () => {
    socketRef.current.off('update-cronometer');
    socketRef.current.off('end-cronometer');
  };
}, []);

  return (
    <div className="bg-white p-4 rounded shadow-md text-center">
      {/* <h3 className="text-lg font-semibold mb-4 text-teal-600">¿Solicitudes enviadas?</h3> */}
      <Title>¿Solicitudes enviadas?</Title>

      {loading ? (
        <p> Cargando </p>
        ): 

        (() => 
          {
            switch (requestStatus) {
              case 'none':
                return (
                  <>
                    <p className="text-red-600 mb-2">No has enviado ninguna solicitud.</p>
                    <Button 
                      onClick={handleRequest} 
                      className="bg-blue-600 text-black px-6 py-2 rounded hover:bg-blue-700"
                    >
                      Solicitar participación
                    </Button>
                  </>
                );
              
              case 'pending':
                return (
                  <>
                    <p className="text-red-600 mb-2">Tu solicitud ({email}) está pendiente de aprobación.</p>
                    <button 
                      onClick={cancelRequest} 
                      className="bg-blue-600 text-black px-6 py-2 rounded hover:bg-blue-700"
                    >
                      Cancelar participación
                    </button>
                  </>
                );
              
              case 'approved':
                return (
                  <>
                    <p className="text-green-600 font-medium">¡Tu solicitud ha sido aprobada! Puedes activar la cámara</p>

                    <div className="meeting__polling">
                      <div className="meeting__polling--cronometer">
                        <h3 className="text-red-600 mb-2">Cronometro: {displayTime}</h3>
                        {/* {votingEnabled ? (
                          <p>Opciones habilitadas</p>
                        ) : (
                          <p>Esperando inicio del cronómetro o ya terminó.</p>
                        )} */}

                      </div>
                      
                    </div>


                  </>
                );
              
              default:
                return (
                  <>
                    <p className="text-red-600 mb-2">No has enviado ninguna solicitud.</p>
                  </>
                );
            }
          }
        )()
      }
    </div>
  );
};

export default AskToParticipate;
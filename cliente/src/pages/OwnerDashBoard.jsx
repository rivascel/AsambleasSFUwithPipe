import React, { useEffect, useState, useContext, useRef } from 'react';
import axios from 'axios';
import { io } from "socket.io-client";
import Ask from '../containers/owner/Ask';
import Chat from '../containers/Chat';
import Graph from '../containers/Graph';
import VideoOwner from '../containers/owner/Video_owner';
import MeetingPollOwner from '../containers/owner/Meeting_poll_owner';
import Questions from '../containers/owner/Questions';
import { UserContext } from "../components/UserContext";
import AppContext from '../context/AppContext';
import { getSocket  } from "../hooks/socket";

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL_LOCAL; 
const apiUrl = API_URL;

// Verificar que apiUrl esté definida
if (!apiUrl) {
    console.error('❌ API_URL no está definida en las variables de entorno');
}


const Section = ({ title, children }) => (
  <div className="bg-white p-4 rounded-lg shadow-md">
    <h2 className="text-xl font-semibold mb-2">{title}</h2>
    <div>{children}</div>
  </div>
);

const DashBoardOwner = () => {
  // const { apiUrl } = useContext(AppContext);

  // const { apiUrl } = axios.get(`${API_URL}/api/request-magic-link`);
    // const [email, setEmail] = useState(null);
  const [error, setError] = useState(null);
  // const [quorum, setQuorum] = useState(null);
  // const [votesData, setVotesData] = useState({}); // lista de todos los propietarios
  const { email, login, role, setQuorum, setApprovalVotes, setRejectVotes, setBlankVotes } = useContext(UserContext);
  const ownerData = useRef();
  const sesion = useRef(null);
  const socketRef = useRef(null);
  const [participacion, setParticipacion] = useState(0); // Estado para forzar re-renderizado cuando cambie la participación
  const particRef = useRef(null); // Ref para mantener el valor actual de la participación


  useEffect(() => {
    const socket = getSocket(apiUrl);
    socketRef.current = socket;

    // Configurar listener UNA VEZ
    const handleSesionStarted = async (numberSesion) => {
      console.log("📊 Sesion iniciada en peer:", numberSesion);

      if (numberSesion == null || numberSesion === 0) {
        console.log("Ignorando sesión:", numberSesion);
        return;
    }

      sesion.current = numberSesion;
      await ownerRegister(email, numberSesion);
      // await fetchOwners();

    }
    socketRef.current.on("sesionStarted", handleSesionStarted);

  },[]);


  useEffect(() => {
    axios.get(`${apiUrl}/api/owner-data`, {
      withCredentials: true,
      })
      .then((res) => {
            // email;
            login(res.data.email); // ✅ Actualiza el contexto global
      })
      .catch((err) => {
        console.error(err);
        setError("No autorizado. Redirigiendo...");
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      });
  }, []);

  useEffect(() => {
    if (!email) return;

    axios.post(`${apiUrl}/api/fileOwnerByEmail`, 
      
      { email },
      { withCredentials: true },
      )
      .then((response) => {

        // 3. Mapea los nombres del archivo a los que usa tu aplicación
        ownerData.current = {
            correo: response.data.owner.correo,  // "correo" en el archivo -> "email" en tu app
            interior: response.data.owner.interior,
            apartamento: response.data.owner.apto,  // "apto" en el archivo -> "apartamento" en tu app
            participacion: response.data.participacion,
            alias: response.data.owner.alias
        };

        // 3. Guarda los datos en el contexto
        login(email, role, ownerData.current); // Pasa los datos al login

      })

      .catch(error =>{
        console.error("Error", error);
      })

      // Cleanup: eliminar listener cuando el componente se desmonta
      return () => {
        if (socketRef.current) {
            socketRef.current.off("sesionStarted");
        }
      };
  }, []); 

  //este debe usarse cuando ingresa despues de haber iniciado la sesion, para que se registre
  useEffect(() => {
    const handleUpdate = async () => {
      // fetchOwners();
      await socketRef.current.emit("requestJoinSesion");
      await ownerRegister(email, numberSesion);

    };

    socketRef.current.on("updateConnectedUsers",  handleUpdate);
    return () => socketRef.current.off("updateConnectedUsers", handleUpdate);
  }, [email]);      

  useEffect(() => {
    const handleUpdateVotes = (data) => {
        setApprovalVotes(data.approval);
        setRejectVotes(data.reject);
        setBlankVotes(data.blank);
    };

    socketRef.current.on('send-votes', handleUpdateVotes);

    return () => {
        socketRef.current.off('send-votes', handleUpdateVotes);
    };
}, [setApprovalVotes, setRejectVotes, setBlankVotes]);

   
  // const fetchOwners = async () => {
  //   try {
  //     const response = await axios.get(`${apiUrl}/api/emailFile`, {
  //       withCredentials: true,
  //     });
  //     console.log("Respuesta de /api/emailFile:", response.data);
  //     if (Array.isArray(response.data)) {
  //       // setVotesData(response.data);
  //       calcularQuorum(response.data);
  //     } else {
  //       console.error("❌ El endpoint no devolvió un array.");
  //     }
  //   } catch (err) {
  //     console.error("Error al obtener todos los propietarios:", err);
  //   }
  // };

  const calcularParticipacion = (data) => {
    let quorumPercentage = 0;
    if (!data.length) return;

    const SumItems = data.reduce((acumulator, objeto) => acumulator + parseInt(objeto.participacion), 0);
    for (let i = 0; i < data.length; i++) {

      console.log("email estado:", email);
      console.log("email archivo:", data[i].correo);
      console.log("email archivo:", data[i].participacion);
        
      if (data[i].correo.trim() === email) {
          quorumPercentage = (parseInt(data[i].participacion) / SumItems) * 100;
          console.log("quorumPercentage",quorumPercentage);
          setQuorum(quorumPercentage); // Actualiza el estado del quorum
          break;
        }
        else {
        console.log(`No se encontró el correo: ${email}`);
      }
    }
    return participacionPercentage;
  };


  const ownerRegister = async (email, sesion) => {

      const registro = {
        correo: ownerData.current.correo,
        interior: ownerData.current.interior,
        apartamento: ownerData.current.apartamento,
        participacion: ownerData.current.participacion,
        alias: ownerData.current.alias,
        asistencia: 1, 
        fecha: new Date().toISOString(),
        sesion: sesion
      };

      try {
        const response = await axios.post(`${apiUrl}/api/registro`, registro);
        console.log("4. Respuesta:", response.data.message);
        if (response.data.registered) {
            console.log("El correo ya estaba registrado, no se registrará de nuevo.");
        }


      } catch (error) {
          console.error('5. Error al registrar propietario:', error);
          // console.error('5.1 Error details:', error.response?.data || error.message);



      }


  //     await axios.post(`${apiUrl}/api/registro`, registro)
      
  //     .then(response => {
  //     })
  //     .catch(error => {
  //     console.error('Error al registrar propietario:', error);
  //     }); 
  };

  
  // if (error) return <p>{error}</p>;


  return (
    <>
      <div className="p-6 bg-gray-100 min-h-screen">
        <h1 className="text-3xl font-bold mb-6">Bienvenido al panel del propietario</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Section title="Transmisión General">
            <VideoOwner />
          </Section>

          <Section title="Preguntas Recibidas">
            <Questions />
          </Section>

          <Section title="Pedir la Palabra">
            <Ask />
          </Section>

          <Section title="Votación">
            <MeetingPollOwner />
          </Section>

          <Section title="Chat">
            <Chat />
          </Section>

          <Section title="Gráficos">
            {/* <VoteUpdater /> */}
            <Graph />
          </Section>
        </div>
      </div>
    </>
  );

};

export default DashBoardOwner;
import React from 'react';
import { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import { io } from "socket.io-client";
import Approve from '../containers/admin/Approve';
import Chat from '../containers/Chat';
import Graph from '../containers/Graph';
import VideoAdmin from '../containers/admin/Video_admin';
import MeetingPoll from '../containers/admin/Meeting_poll';
import Questions from '../containers/admin/SendQuestion';
import { UserContext } from "../components/UserContext";
import AppContext from '../context/AppContext';

// const socketRef = useRef(null);

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL_LOCAL; 
const apiUrl = API_URL;

const Section = ({ title, children }) => (
  <div className="bg-white p-4 rounded-lg shadow-md">
    <h2 className="text-xl font-semibold mb-2">{title}</h2>
    <div>{children}</div>
  </div>
);

const DashBoardAdmin = () => {
  // const { apiUrl } = useContext(AppContext);
  // const [email, setEmail] = useState(null);
  const socketRef = useRef(null);

  socketRef.current = io(`${apiUrl}`, {
    withCredentials: true,
    transports: ["websocket"]
  });

  const [error, setError] = useState(null);
  const { email, login, setQuorum } = useContext(UserContext);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [ownerData, setOwnerData] = useState([]);

  useEffect(() => {
    axios.get(`${apiUrl}/api/admin-data`, {
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
    if (!socketRef.current) return;

    const handleUpdateConnectedUsers = async (users) => {
      // console.log("usuarios conectados para quorum:", users);
      setConnectedUsers(users);

      const data = await fetchOwners();
      if (data) {
        setOwnerData(data);
        // console.log("data",data)
      }
    };

    socketRef.current.on("updateConnectedUsers", handleUpdateConnectedUsers);

  return () => {
    socketRef.current.off("updateConnectedUsers", handleUpdateConnectedUsers);
  };
}, []);

useEffect(() => {
  if (!connectedUsers.length) {
    setQuorum(0);
    return;
  }
  
  if (!ownerData.length) return; // data del backend
  
  // console.log("Calculando quorum con datos de propietarios y usuarios conectados...");

  calcularQuorum(ownerData, connectedUsers);

}, [connectedUsers, ownerData]);

  const fetchOwners = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/emailFile`, {
        withCredentials: true,
      });
      if (Array.isArray(response.data)) {
        console.log("Ok datos propietarios para quorum");
        return response.data;
      } else {
        console.error("❌ El endpoint no devolvió un array.");
      }
    } catch (err) {
      console.error("Error al obtener todos los propietarios:", err);
    }
  };

  const calcularQuorum = (data, connectedUsers) => {
    const total = data.reduce((acc, o) => acc + parseInt(o.participacion),0);

    const conectados = data.filter(o =>
      connectedUsers.includes(o.correo)
    );

    // console.log("conectados reales:", conectados);

    const sumaConectados = conectados.reduce((acc, o) => acc + parseInt(o.participacion),0);

    const quorumPercentage = (sumaConectados / total) * 100;

    console.log("quorumPercentage:", quorumPercentage);
    setQuorum(quorumPercentage);
  };

  if (error) return <p>{error}</p>;

  return (
        <>
    
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Bienvenido al panel del Administrador</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        <Section title="Transmisión General">
          <VideoAdmin />
        </Section>

        <Section title="Punto a ser votado">
          <Questions />
        </Section>

        <Section title="Otorgar la Palabra">
          <Approve />
          <MeetingPoll />
        </Section>

        <Section title="Chat">
          <Chat />
        </Section>

        <Section title="Gráficos">
          <Graph />
        </Section>
      </div>
    </div>
    </>
    );
};

export default DashBoardAdmin;
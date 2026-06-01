import React, { useState, useContext, useEffect } from "react";
import axios from "axios";
import { UserContext } from "../components/UserContext";
import "../styles/Header.css";
// import AppContext from '../context/AppContext';

const API_URL = import.meta.env.VITE_API_URL;

const RegisterOwner = ({ onRegister }) => {
    // const { API_URL } = useContext(AppContext);
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const { login } = useContext(UserContext);
    const handleSendLink = async () => {
      try {
        // await axios.post(`${API_URL}/api/request-magic-link`, 
        await axios.post(`api/request-magic-link`, 
            {   email,
                role: "owner"
            },
            { withCredentials: true }
        );
        console.log("Enlace mágico solicitado para:", email, role);


        setMessage("Enlace enviado. Revisa tu correo.");
        onRegister?.(email); // si quieres avanzar al siguiente paso visual
        login(email);
        // localStorage.setItem("userEmail", email); // Guardar el email en localStorage
        // login(email);
      } catch (error) {
        console.error(error);
        setMessage("Hubo un error al enviar el enlace.");
      }
    };

    return (
        <>
        <div className="input-group">
            <label htmlFor="username">Escribe tu correo electrónico</label>
            <input type="email" id="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            />
        </div>
        <div className="button-container">
            <button type="button" className="btn primary" id="login" onClick={handleSendLink}>
                Entrar al chat
            </button>
        </div>
        </>
    ); 
};

export default RegisterOwner;



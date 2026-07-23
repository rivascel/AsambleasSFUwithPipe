import React, { useState, useContext, useEffect } from "react";
import axios from "axios";
import { UserContext } from "../../components/UserContext";
import { useNavigate } from 'react-router-dom';
import Card from '../../components/components/Card';
import Button from '../../components/components/Button';

const RegisterAdmin = ({ onRegister }) => {

    const [email, setEmail] = useState("");
    const [adminId, setAdminId] = useState("");
    const [message, setMessage] = useState("");
    const { login } = useContext(UserContext);
    const navigate = useNavigate();

    // useEffect(() => {
    //     window.location.href = "/admin/dashboard";
    //   }, []);

    const handleSendLink = async () => {
      try {
        onRegister?.(email); // si quieres avanzar al siguiente paso visual
        login(email);
        setAdminId(email); // Guardar el ID del admin

        // CREAR LA COOKIE EN EL FORMATO QUE EL BACKEND ENTIENDE
        const sessionData = JSON.stringify({
            role: 'admin',
            email: email
        });
        
        // La guardamos como 'session' para que auth.js la encuentre
        document.cookie = `session=${encodeURIComponent(sessionData)}; path=/;`;
        // Opcionalmente guardamos el username para compatibilidad
        document.cookie = `username=${email}; path=/;`;


        navigate("/admin/dashboard"); // ✅ sin recargar la página
        
      } catch (error) {
        console.error(error);
        setMessage("Hubo un error al enviar el enlace.");
      }
    };

    return (
        <>
            {/* <div className="input-group">
                <label htmlFor="username">Escribe tu correo electrónico</label>
                <input  id="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
            </div>
            <div className="button-container">
                <button type="button" className="btn primary" id="login" onClick={handleSendLink}>
                    Entrar al chat
                </button>
            </div> */}

            <div className="flex justify-center items-center min-h-screen">
            {/* Usamos el componente maestro Card */}
                <Card className="text-center w-full max-w-sm">
                    <h1 className="text-lg font-semibold mb-4">Registro de Propietario</h1>
                    
                    {/* <form onSubmit={handleSendLink}> */}
                        <input type="email" id="username" value={email} onChange={(e) => setEmail(e.target.value)} />
                    
                        <Button type="Button" className="w-full mt-4" onClick={handleSendLink}>
                            Registrar Ahora
                        </Button>
                    {/* </form> */}
                </Card>
            </div>

        </>
    ); 
};

export default RegisterAdmin;



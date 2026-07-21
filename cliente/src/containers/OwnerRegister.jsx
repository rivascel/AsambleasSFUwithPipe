import React, { useState, useContext, useEffect } from "react";
import axios from "axios";
import { UserContext } from "../components/UserContext";
import AppContext from '../context/AppContext';
// import styles from '../styles/registro.module.css'
import Card from '../components/components/Card';
import Button from '../components/components/Button';

const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL_LOCAL; 

const RegisterOwner = ({ onRegister }) => {
    // const { API_URL } = useContext(AppContext);
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const { login, role } = useContext(UserContext);
    // const [warm, setWarm] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    // useEffect(()=>{

    // },[warm]);

    const handleSendLink = async () => {
      try {
        const response = await axios.post(`${API_URL}/api/request-magic-link`, 
            {   email,
                role: "owner"
            },
            { withCredentials: true }
        );
        console.log("Enlace mágico solicitado para:", email, role);

        setIsSuccess(true);
        setShowModal(true);

        setMessage("Enlace enviado. Revisa tu correo.");
        onRegister?.(email); // si quieres avanzar al siguiente paso visual
        login(email, "owner"); // Pasar el rol y datos adicionales
        // localStorage.setItem("userEmail", email); // Guardar el email en localStorage
        // login(email);

        // if (response) setWarm(true);


      } catch (error) {
        console.error(error);
        setMessage("Hubo un error al enviar el enlace, vuelva a escribir su correo, si el problema persiste comuniquese con el Administrador");
        setIsSuccess(false);
        setShowModal(true);
      }
    };

    const closeModal = () => {
        setShowModal(false);
        // Opcional: limpiar mensaje después de cerrar
        setMessage("");
    };
    
    return (
        <>
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



        {/* Modal flotante */}
        {showModal && (
            <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
                <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6 relative">
                    {/* Icono de éxito/error */}
                    <div className="flex justify-center mb-4">
                        {isSuccess ? (
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                        ) : (
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </div>
                        )}
                    </div>

                    {/* Mensaje */}
                    <p className={`text-center text-lg font-medium mb-4 ${isSuccess ? 'text-green-700' : 'text-red-700'}`}>
                        {message}
                    </p>

                    {/* Botón de cerrar */}
                    <button
                        onClick={closeModal}
                        className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded transition duration-200"
                    >
                        {isSuccess ? 'Entendido' : 'Reintentar'}
                    </button>
                </div>
            </div>
        )}

        </>






    );

//     return (
//         <>
//         <div className={styles.card}>
//             <h3 className={styles.titulo}>
//                 <label htmlFor="username">Escribe tu correo electrónico</label>
//             </h3>
//                 <input type="email" id="username"
//                     value={email}
//                     onChange={(e) => setEmail(e.target.value)}
//                 />
            
//         </div>
//         <div className={styles.card}>
//             <button className="btn-principal" type="button" className="btn primary" id="login" 
//              onClick={handleSendLink}>
//                 Solicitar enlace
//             </button>
//         </div>
//         </>
//     ); 
};

export default RegisterOwner;



import React, { useEffect, useState, useContext, useRef } from 'react';
import axios from 'axios';
import '../styles/Header.css';

import { UserContext } from "../components/UserContext";
import { getSocket  } from "../hooks/socket";

// import { UserContext } from "./UserContext";
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_URL_LOCAL; 
const apiUrl = API_URL;


const Header = () => {
    const { ownerData } = useContext(UserContext);
    const socketRef = useRef(null);
    const quorumRef = useRef(null); // Ref para mantener el valor actual del quorum
    const [quorum, setQuorum] = useState(0); // Estado para forzar re-renderizado cuando cambie el quorum

    useEffect(() => {
        const socket = getSocket(apiUrl);
        socketRef.current = socket;
        
        socketRef.current.on("quorumCalculated", (quorumPercentage) => {
            console.log("Quorum recibido en Header:", quorumPercentage);
            quorumRef.current = quorumPercentage;
            setQuorum(quorumRef.current);
        });

        return () => socketRef.current.off("quorumCalculated");
    }, []);

    return (
        <header  className="bg-blue-700 text-white p-4 text-center">
            <h1>Web Asambleas</h1>
            <h3>Dato Inmueble/Propietario</h3>
            <div className="flex
                            flex-col
                            md:flex-row
                            flex-wrap
                            justify-center
                            items-center
                            gap-4
                            p-2">
                
                    <div className="p-2 w-full md:w-auto">
                        <strong>Interior</strong>
                        <p id="interior">
                            {ownerData?.interior || ''}
                            </p>
                    </div>
                
                    <div className="p-2 w-full md:w-auto">
                        <strong>Apartamento</strong>
                        <p id="apartamento">
                            {ownerData?.apartamento || ''}
                            </p>
                    </div>
                
                    <div className="p-2 w-full md:w-auto">
                        <strong>Correo Electrónico</strong>
                        <p id="correo">
                            {ownerData?.email || ''}
                            </p>
                    </div>
                
                    <div className="p-1">
                        <strong>Inmuebles que representa</strong>
                        <p id="participacion">
                            {ownerData?.participacion || ''}
                            </p>
                    </div>
                
                    <div className="p-1">
                        <strong>Porcentaje de representación en el quorum</strong>
                        <div id="quorum">
                            {typeof quorum === "number" ? `${quorum.toFixed(2)}%` : "No disponible"}
                        </div>
                    </div>

                    <div className="p-1">
                        <strong>Quorum Registrado</strong>
                        <div id="quorum">
                            {/* {quorumRef.current} */}
                            {quorum !== null ? `${quorum.toFixed(2)}%` : "No disponible"}
                        </div>
                    </div>  

                    <p id="mensajeError"></p>
                    <p id="resultado">  </p>
            </div>
            
        </header>
        );
};

export default Header;
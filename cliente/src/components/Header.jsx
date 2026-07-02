import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import '../styles/Header.css';

import { UserContext } from "../components/UserContext";

// import { UserContext } from "./UserContext";


const Header = () => {
    const { ownerData, quorum } = useContext(UserContext);

    // useEffect(() => {
    //     console.log("Datos del propietario recibidos en Header:", ownerData);
    // }, [ownerData]);

    return (
        <header style={{
            backgroundColor: '#275dca',
            padding: '1rem',
            color: 'white',
            textAlign: 'center',
          }}>
            <h1>Web Asambleas</h1>
            <h3>Dato Inmueble/Propietario</h3>
            <div className="flex flex-row p-2 m-2 bg-blue gap-6 place-content-center">
                
                    <div className="p-1">
                        <strong>Interior</strong>
                        <p id="interior">
                            {ownerData?.interior || ''}
                            </p>
                    </div>
                
                    <div className="p-1">
                        <strong>Apartamento</strong>
                        <p id="apartamento">
                            {ownerData?.apartamento || ''}
                            </p>
                    </div>
                
                    <div className="p-1">
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

                    <p id="mensajeError"></p>
                    <p id="resultado">  </p>
            </div>
            
        </header>
        );
};

export default Header;
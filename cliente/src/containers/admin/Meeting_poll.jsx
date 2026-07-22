import React, { useState, useEffect, useContext, useRef } from "react";
import { io } from "socket.io-client";
import { UserContext } from "../../components/UserContext";
import axios from 'axios';
import AppContext from '../../context/AppContext';
import { getSocket  } from "../../hooks/socket";


const PollingManage = () => {
    const { apiUrl } = useContext(AppContext);
    const socketRef = useRef(null);

    
    const intervalo = useRef(null);

    const [finalMinute, setFinalMinute] = useState(0);
    const [displayTime, setDisplayTime] = useState("00:00");
    const { decisionText, setApprovalVotes, setRejectVotes, setBlankVotes, setVotingEnabled } = useContext(UserContext);


    useEffect(() => {
        const socket = getSocket(apiUrl);
        socketRef.current = socket;
        
    //   socketRef.current.on("connect", () => {
    //     console.log("🟢 Conectado:", socketRef.current.id);
    //   });
    },[]);

    const initCronometer = () => {
        let minute = 0;
        let second = 0;
        setDisplayTime("00:00");
        setVotingEnabled(true);

        socketRef.current.emit('start-cronometer', { 
            time: `${minute}:00` 
            
        });

        socketRef.current.emit("inicioVotacion", true);

        intervalo.current = setInterval(()=>{
            second++;
            if (second === 60) {
                minute++;
                second = 0;
            }

            if (minute >= finalMinute) {
                parar();
                alert("El tiempo terminó");

                socketRef.current.emit('end-cronometer');
            }

            const sAux = second < 10 ? "0" + second : second;
            const mAux = minute < 10 ? "0" + minute : minute;

            // Actualizar el cronómetro
            const time = mAux + ":" + sAux;
            setDisplayTime(time);


            // Enviar el cronómetro actualizado a los clientes
            socketRef.current.emit('update-cronometer', { time });

            function parar() {
                if (intervalo.current) {
                    clearInterval(intervalo.current);
                    intervalo.current= null;
                }
            }
        }, 100);
    };

    async function countVotes() {
            try { 
            //trae las votaciones
            const response = await axios.get(`${apiUrl}/api/file`)
            //trae los propietarios y su participacion
            const res = await axios.get(`${apiUrl}/api/emailFile`)

            const votesData = response.data;
            const ownerData = res.data;
    
            if (!Array.isArray(votesData) && !Array.isArray(ownerData)) {
                throw new Error("La respuesta del servidor no es un arreglo.");
            }
    
            for (let i = 0; i < votesData.length; i++) {
                let vote = votesData[i];
                if (typeof vote.correo !== 'string') {
                    console.warn(`Correo inválido en votesData[${i}]:`, vote);
                    continue;
                }
                let found = false; // Bandera para verificar si encontramos el correo en ownerData
                
                for (let j = 0; j < ownerData.length; j++) { 
                    if ( typeof votesData[i].correo === 'string' &&
                        typeof ownerData[j].correo === 'string' &&
                        votesData[i].correo.trim() === ownerData[j].correo.trim()) {
                        // console.log(`Voto ${i}: ${votesData[i].correo}, Data ${j}: ${ownerData[j].correo}`);
                        found = true; // Se encontró una coincidencia
    
                        votesData[i].participacion = ownerData[j].participacion;
                        
                        // console.log("Consolidado Votacion",votesData);
                        break; // Salir del bucle interno si ya encontramos el correo
                    }
                }
            
                if (!found) {
                    console.log(`No se encontró el correo: ${votesData[i].correo}`);
                }
            }
    
            const filteredVotes = votesData.filter(vote => decisionText === vote.proposicion.trim());
    
            const contarVotosApprobal = (votos) => {
                return votos.reduce((total, voto) => {
                    if (parseInt(voto.valor) === 1 && voto.participacion === 0) {
                        return total + 1;  // Cuenta el voto
                    } else if (parseInt(voto.valor) === 1 && voto.participacion !== 0) {
                        return total + (1 * voto.participacion);  // Multiplica por participación
                    } else {
                        return total;
                    }
                }, 0);
            };
                    
            const contarVotosReject = (votos) => {
                return votos.reduce((total, voto) => {
                    if (voto.valor === 2 && voto.participacion === 0) {
                        return total + 1;
                    } else if (voto.valor === 2 && voto.participacion !== 0) {
                        return total + (1 * voto.participacion);
                    } else {
                        return total;
                    }
                }, 0);
            };
                    
            const contarVotosBlank = (votos) => {
                return votos.reduce((total, voto) => {
                    if (voto.valor === 0 && voto.participacion === 0) {
                        return total + 1;
                    } else if (voto.valor === 0 && voto.participacion !== 0) {
                        return total + (1 * voto.participacion);
                    } else {
                        return total;
                    }
                }, 0);
            };
    
            setApprovalVotes(contarVotosApprobal(filteredVotes));
            setRejectVotes(contarVotosReject(filteredVotes));
            setBlankVotes(contarVotosBlank(filteredVotes));
    
          socketRef.current.emit('send-votes',{
            approval: contarVotosApprobal(filteredVotes),
            reject: contarVotosReject(filteredVotes),
            blank: contarVotosBlank(filteredVotes),

          });
    
            } catch (error) {
            console.error("Error al contar los votos:", error);
            return null;
            };
        };

    return (
        <div className="bg-white p-4 rounded shadow-md space-y-4">
            <div className="meeting__polling--cronometer">
                <h3>Ingreso los minutos para votar:</h3>
                <input 
                   type="number" 
                   name="minuto" 
                   value={finalMinute}
                   onChange={(e) => setFinalMinute(parseInt(e.target.value))}
                />

                <h3>Cronómetro actual: {displayTime}</h3>
                <button 
                    onClick={initCronometer}
                    className="bg-blue-600 text-black px-6 py-2 rounded hover:bg-blue-700">
                        Inicie cronometro
                </button>
            </div>
            <div className="meeting__polling--summary">
                <button type="button" 
                id="calculo"
                onClick={countVotes}
                >Conteo</button>

            </div>
        </div>
    );
};
export default PollingManage;
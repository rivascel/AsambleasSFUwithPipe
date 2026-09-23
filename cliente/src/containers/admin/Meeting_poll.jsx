import React, { useState, useEffect, useContext, useRef } from "react";
import { io } from "socket.io-client";
import { UserContext } from "../../components/UserContext";
import axios from 'axios';
import AppContext from '../../context/AppContext';
import { getSocket  } from "../../hooks/socket";
// import { Button } from "../../components/components/Button";
import  Button  from "../../components/components/Button";



const PollingManage = () => {
    const { apiUrl } = useContext(AppContext);
    const socketRef = useRef(null);
    const intervalo = useRef(null);
    const inputRefApp = useRef(null);
    const inputRefRej = useRef(null);
    const inputRefBlan= useRef(null);

    const [finalMinute, setFinalMinute] = useState(0);
    const [displayTime, setDisplayTime] = useState("00:00");
    const { decisionText, setApprovalVotes, setRejectVotes, setBlankVotes, setVotingEnabled, ownerData, email } = useContext(UserContext);
    // const [decisionText, setDecisionText] = useState("");

    useEffect(() => {
        const socket = getSocket(apiUrl);
        socketRef.current = socket;
        
    //   socketRef.current.on("connect", () => {
    //     console.log("🟢 Conectado:", socketRef.current.id);
    //   });
    },[]);

    // useEffect(() => {
    //   socketRef.current.on('receive-decision', text => {
       
    //     setDecisionText(text);
    //   });

      
    //   // Limpieza para evitar múltiples listeners
    //   return () => {
    //     socketRef.current.off('receive-decision');
    //   };
    // }, []);

    const initCronometer = () => {
        let minute = 0;
        let second = 0;
        setDisplayTime("00:00");
        // setVotingEnabled(true);

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
                socketRef.current.emit("inicioVotacion", false);
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


    const manualRegister = async (q, decision, value) => {
    // if (!votingEnabled) return;
        // const qty = e.target.value;
        // const qty = q;

        //solo pueden votar los que tienen participacion, es decir, son propietarios
        // if (ownerData.participacion !== 0) {
        const nuevoVotoManual = {
            interior: "XXX",
            apartamento: "XXX",
            correo: email,
            proposicion: decision, 
            qty: parseInt(q),
            valor: parseInt(value) //tipo de voto: aprueba-1, rechaza-2, blanco-0
        };
        // }
        // setSelected(null); //despues de registrar el voto, select pasa a null

        await axios.post(`${apiUrl}/api/votacion`, nuevoVotoManual, { withCredentials: true })
        .then(response => {
        })
        .catch(error => {
        console.error('Error al enviar votos:', error);
        }); 
    };


    const handleCountVotes =  () => {
        const valor1 = inputRefApp.current.value;
        const valor2 = inputRefRej.current.value;
        const valor3= inputRefBlan.current.value;

        manualRegister(valor1, decisionText, 1);
        manualRegister(valor2, decisionText, 2);
        manualRegister(valor3, decisionText, 0);
    }


    async function countVotes() {

        try { 
                //trae las votaciones
                const response = await axios.get(`${apiUrl}/api/file`)
                //trae los propietarios y su participacion
                const res = await axios.get(`${apiUrl}/api/emailFile`)

                const votesData = response.data;
                const ownerData = res.data;
        
                if (!Array.isArray(votesData) || !Array.isArray(ownerData)) {
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
                        // else {
                        //     votesData[i].qty = ownerData[j].qty;
                        // }
                    }
                
                    if (!found) {
                        console.log(`No se encontró el correo: ${votesData[i].correo}`);
                    }
                }
        
                const filteredVotes = votesData.filter(vote => decisionText === vote.proposicion.trim());
                console.log("filteredVotes:", filteredVotes);
        
                const contarVotosApprobal = (votos) => {

                    return votos.reduce((total, voto) => {
                        const valor = parseInt(voto.valor);
                        const quant = parseInt(voto.qty);


                        if (valor === 1) {
                            // if (!isNaN(quant)){
                                if (voto.participacion === null || voto.participacion === undefined ){
                                    return total + (isNaN(quant) ? 0 : quant )
                                // }    
                            } else if ( voto.participacion === 0) {
                                return total + 1;  // Cuenta el voto
                            } else  {
                                return total + (1 * voto.participacion);  // Multiplica por participación
                            } 
                        } 
                        return total 
                    }, 0);
                };
                        
                const contarVotosReject = (votos) => {
                    return votos.reduce((total, voto) => {
                        const valor = parseInt(voto.valor);
                        const quant = parseInt(voto.qty);

                        if (valor === 2) {
                            // if (!isNaN(quant)){
                                if (voto.participacion === null || voto.participacion === undefined ){
                                    return total + (isNaN(quant) ? 0 : quant )
                                // }    
                            } else if (voto.participacion === 0) {
                            return total + 1;
                            } else  {
                            return total + (1 * voto.participacion);
                            } 
                        }
                        return total;
                        
                    }, 0);
                };
                        
                const contarVotosBlank = (votos) => {
                    return votos.reduce((total, voto) => {
                        const valor = parseInt(voto.valor);
                        const quant = parseInt(voto.qty);

                        if (valor === 0) {
                            // if (!isNaN(quant)){
                                if (voto.participacion === null || voto.participacion === undefined ){
                                    return total + (isNaN(quant) ? 0 : quant )
                                // }    
                            } else if (voto.participacion === 0) {
                                return total + 1;
                            } else {
                                return total + (1 * voto.participacion);
                            } 
                        }
                        return total;
                        
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
                <input type="number" name="approval" placeholder="Votos aprueba"
                ref={inputRefApp}
                   />
                <input type="number" name="reject" placeholder=" Votos en contra" 
                ref={inputRefRej}
                 />
                <input type="number" name="blank" placeholder="Votos en blanco" 
                ref={inputRefBlan}
                 />
            </div>
            <Button onClick={handleCountVotes}>Registro manual de votos</Button>


            <div className="meeting__polling--count">
                <Button type="Button" id="calculo" onClick={countVotes}>
                Conteo
                </Button>

            </div>
        </div>
    );
};
export default PollingManage;
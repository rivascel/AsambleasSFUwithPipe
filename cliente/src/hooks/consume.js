

export const remoteProducerRef = useRef(new Map()); // Para almacenar el producerId global
export const consumersRef = useRef([]); // los consumidores global


export function consume(socket, recivTransport, remote) {
    //se busca si existen productores que este transmitiendo
    const producers = await new Promise((resolve) => {
      socket.current.emit("getProducers", { roomId }, resolve);
      console.log("📡 Solicitando productores existentes para la sala", roomId);
    });

     console.log("📡 respuesta getProducers", producers);

    if (producers === null || producers.length === 0) {
      console.log("📡 No hay productores disponibles");
      return;
    }

    console.log("producers:", producers);

    for (const { producerId, kind, role } of producers) {
        console.log("producer:", producers);

      if (remoteProducerRef.current.has(producerId) && role === "owner") continue; 

      remoteProducerRef.current.set(producerId, { kind, role: role });

      console.log(`📡 Consumiendo ${kind}:`, producerId);
      await consume({ producerId, kind, role: role, socket, recivTransport }); 
      
    }
}

// consumir existentes
// const consumeExisting = async () => {
// const producers = await new Promise((resolve) => {
//     socketRef.current.emit("getProducers", { roomId }, resolve);
//     console.log("📡 Solicitando productores existentes para la sala", roomId);
// });

//     console.log("📡 respuesta getProducers", producers);

// if (producers === null || producers.length === 0) {
//     console.log("📡 No hay productores disponibles");
//     return;
// }

// console.log("producers:", producers);

// for (const { producerId, kind, role } of producers) {
//     console.log("producer:", producers);

//     if (remoteProducerRef.current.has(producerId) && role === "owner") continue; 

//     remoteProducerRef.current.set(producerId, { kind, role: role });

//     console.log(`📡 Consumiendo ${kind}:`, producerId);
//     await consume({ producerId, kind, role: role }); 
    
// }
// // setState("CONSUMING_EXISTING");
// };
const consume = async ({producerId, kind, role, socket, recivTransport, remote}) => {

try {
    const data = await new Promise((resolve, reject) => {

    socket.current.emit("consume", {
        producerId,
        rtpCapabilities: deviceRef.current.rtpCapabilities,
        roomId,
        role
        },
        (response) => {
        if (response?.error) {
            reject(new Error(response.error));
        } else {
            resolve(response);
        }
        }
    );
    });

    await createAndSetupConsumer(data, socket, recivTransport, remote);

} catch (error) {

    console.error(
    "Error consumiendo:",
    error
    );
  }
};

// Función auxiliar para crear y configurar el consumer
const createAndSetupConsumer = async (consumerData, socket, recivTransport, remote) => {
    // Limpiar consumer existente del mismo tipo
    const existingConsumer = consumersRef.current.find(
      c => c.kind === consumerData.kind && c.producerRole === consumerData.role
    );

    if (existingConsumer) {
      existingConsumer.close();
      consumersRef.current = consumersRef.current.filter(
        c => c.id !== existingConsumer.id
      );
    }
    
    // Crear consumer con el transport (puede ser el mismo recvTransport)
    const consumer = await recivTransport.current.consume({ 
      id: consumerData.id,
      producerId: consumerData.producerId,
      kind: consumerData.kind,
      rtpParameters: consumerData.rtpParameters,
      role: consumerData.role,
    });

    console.log(`🎥 Consumer creado (${consumerData.isPipe ? 'vía pipe' : 'directo'})`);
    console.log("🎥 kind:", consumerData.kind);
    console.log("🎥 track:", consumer.track.kind);
    console.log("🎥 role:", consumerData.role);

    // Resumir el consumer
    await new Promise((resolve) => {
      socket.current.emit("resume-consumer", { consumerId: consumer.id }, resolve ); });

    consumer.producerRole = consumerData.role;
    consumersRef.current.push(consumer);

    const targetVideo = remote;

    return targetVideo;
  
    

    // return consumer;
};





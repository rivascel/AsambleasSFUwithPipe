import { config } from  "../config/config.js";

import os from "os";

// Función para obtener la IP privada real de la máquina servidor
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

console.log(`📡 Mediasoup en: ${config.ip || "0.0.0.0"} | Anunciando IP a los clientes: ${config.announcedIp}`);


export const configuration = {

  mediasoup: {
    worker: {
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
      logLevel: "warn",
    },
    router: {
      mediaCodecs: [
        {
          kind: "audio",
          mimeType: "audio/opus",
          clockRate: 48000,
          channels: 2,
          parameters: {
            "x-google-start-bitrate": 1000,
          },
        },
        {
          kind: "video",
          mimeType: "video/H264",
          clockRate: 90000,
          parameters: {
            "packetization-mode": 1,
            "profile-level-id": "42e01f",
            "level-asymmetry-allowed": 1,
          },
        },
      ],
    },
    
    webRtcTransport: {

      listenInfos: [
        {
          protocol: "udp",
          ip: config.ip, // Escucha en todas las interfaces de red
          announcedAddress: config.announcedIp /*|| getLocalIp()*/

        },
        {
          protocol: "tcp",
          ip: config.ip, // Escucha en todas las interfaces de red
          announcedAddress: config.announcedIp /*|| getLocalIp()*/

        },
        {
        protocol: "udp",
        ip: config.ip, // Escucha en todas las interfaces de red
        // announcedAddress: config.announcedIpLocal /*|| getLocalIp()*/
        announcedAddress: '127.0.0.1'

      },
      {
        protocol: "tcp",
        ip: config.ip, // Escucha en todas las interfaces de red
        announcedAddress: '127.0.0.1'

      }
        
      ],

      enableTcp: true,
      enableUdp: true, 
      preferUdp: true, 
      iceTransportPolicy: 'all', // O 'relay' si quieres forzar TURN
      
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144,
      maxIncomingBitrate: 1500000,
      
      
    },

    pipeTransport: {
      listenIp: "127.0.0.1",
      enableRtx: true,
      enableSrtp: false,
      numWorkers: 4 // Número de workers para balanceo
    }
    
  },
  
};

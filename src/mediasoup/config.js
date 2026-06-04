import { config } from  "../config/config.js";

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
          mimeType: "video/VP8",
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
          announcedIp: config.announcedIp, // luego pones tu IP pública

        },
                {
          protocol: "tcp",
          ip: config.ip, // Escucha en todas las interfaces de red
          announcedIp: config.announcedIp, // luego pones tu IP pública

        }
        
      ],
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

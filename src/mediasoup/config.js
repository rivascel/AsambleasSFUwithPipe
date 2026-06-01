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
      listenIps: [
        {
          // ip: "127.0.0.1",
          // ip: "0.0.0.0",
          ip: config.listenIp, // Escucha en todas las interfaces de red
          // announcedIp: '192.168.211.47', // luego pones tu IP pública
          // announcedIp: process.env.ANNOUNCED_IP, // luego pones tu IP pública
          announcedIp: config.announcedIp, // luego pones tu IP pública
          // announcedIp: '127.0.0.1',
          // announcedIp: undefined, // Si no tienes IP pública o estás detrás de NAT, deja esto como undefined
        },
        
      ],
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144,
      maxIncomingBitrate: 1500000,
      
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    },
    pipeTransport: {
      listenIp: "127.0.0.1",
      enableRtx: true,
      enableSrtp: false,
      numWorkers: 4 // Número de workers para balanceo
    }
  },
};
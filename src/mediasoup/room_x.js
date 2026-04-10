// Crear sala con router
const createRoom = async (roomId, worker) => {
    const router = await worker.createRouter({
        mediaCodecs: [
            {
                kind: "audio",
                mimeType: "audio/opus",
                clockRate: 48000,
                channels: 2
            },
            {
                kind: "video",
                mimeType: "video/VP8",
                clockRate: 90000
            }
        ]
    });
    
    const room = { router, producers: [] };
    rooms.set(roomId, room);
    return room;
};
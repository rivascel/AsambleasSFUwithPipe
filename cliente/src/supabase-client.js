import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hhmqduncjwddwptghsaj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhobXFkdW5jandkZHdwdGdoc2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE4ODQ0NTIsImV4cCI6MjA1NzQ2MDQ1Mn0.0IC33LEBv1O4QO9ctymNJu7nMjzXqk1P3Un9gf8WYds';
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
    // Desactiva el uso de navigator.locks
    lock: async (_name, _acquireTimeout, fn) => {
      return await fn();
    }
    }
});

const channels = {};

export function getOrCreateChannel(userId) {
  if (!userId) throw new Error("userId requerido para crear canal");
  if (!channels[userId]) {
  const channel = supabase.channel(`Signals-${userId}`);
  channel.subscribe();
  channels[userId] = channel;
  }
  return channels[userId];
}

// callback recibirá el objeto que enviaste en payload (ver sendSignal)
export function subscribeToSignals(userId, callback) {
  const channel = getOrCreateChannel(userId);
  channel.on("broadcast", { event: "signal" }, (msg) => {
  // msg.payload es lo que enviamos en sendSignal
    try {
      callback(msg.payload);
    } catch (err) {
      console.error("Error en callback subscribeToSignals:", err);
    }
  });
  return channel;
}

// Simulación para detectar viewers (desde tabla active_users)

export const getAllViewersAndListen = async (roomId, onNewViewer) => {
  const viewers = new Set(); // Usamos Set para evitar duplicados

  const { data: currentViewers, error} = await supabase
    .from("active_users")
    .select("*")
    .eq("room_id",roomId)
    .eq("is_admin",false)
    // .maybeSingle();

     if (error) {
      console.error("Error obteniendo viewers:", error);
      throw error;
    }

    const viewersArray = currentViewers ?? [];

      //   const viewersArray = currentViewers
      // ? (Array.isArray(currentViewers) ? currentViewers : [currentViewers])
      // : [];
    
    // console.log("Viewers procesados:", viewersArray);
    
    viewersArray?.forEach((viewer)=>{
      viewers.add(viewer.user_id)
      // onNewViewer?.(viewer.user_id);
    });

    const channel = supabase
    .channel(`active_users_${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "active_users",
        filter: `room_id=eq.${roomId}`
      },
      (payload) => {
        if (!payload.new.is_admin) {
          viewers.add(payload.new.user_id);
          onNewViewer?.(payload.new.user_id);
        }
        
      }
    )
    .subscribe((status)=>{
      // console.log("Estado de suscripción:", status);
    });

  return {
    viewers,
    unsubscribe: () => {
      supabase.removeChannel(channel);
    }
  };
}
//=========================== send signal
export async function sendSignal({ room_id, from_user, to_user, type, payload }) {
  try {

    if (!from_user || !room_id) {
      throw new Error("from_user o roomId es requerido");
    }

    // Aseguramos que payload sea un objeto JSON válido
    const jsonPayload = typeof payload === "string" ? JSON.parse(payload) : payload;

    const { error } = await supabase.from("webrtc_signaling").insert([
      {
        room_id,
        from_user,
        to_user,
        type  ,
        // payload: {
        //   ...jsonPayload,
        //   sdpMLineIndex: Number(jsonPayload.sdpMLineIndex) || 0
        // }
        payload: jsonPayload,
      },
    ]);

    if (error) { 
      console.error("❌ Error al insertar señal:", error);
    } else {
      // console.log(`✅ Señal (${type}) enviada de ${from_user} → ${to_user}`);
    }
  } catch (e){
    console.error("🧨 Excepción:", e);
  }
}

export const listenToSignals = (userId, callback) => {
  if (!userId) return;

  const channel = supabase
    .channel(`Signals-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'webrtc_signaling',
        filter: `to_user=eq.${userId}`,
      },
      (payload) => {
        console.log("🔔 Señal detectada en tabla:", payload.new);
        callback(payload.new);
      }
    )
    .subscribe((status) => {
      // console.log(`Estado de suscripción Signals-${userId}:`, status);
    });
  return {
    channel,
    removeChannel: () => supabase.removeChannel(channel)
  }
};

// 


// Esta es la versión que deben usar los USUARIOS (no el admin)
export const listenToUserRequests = (room, userId, onChange, options = {}) => {
  const { componentId = 'default' } = options;
  
  const channelName = `user-${userId}-${componentId}-${Date.now()}`;
  
  // console.log(`🔔 Creando listener para ${userId} en ${room}`);

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'requests',
        filter: `room_id=eq.${room}`
      },
      async (payload) => {

        // console.log("📦 Payload crudo:", payload);

        const eventUser = 
                payload.eventType === 'DELETE'
                ? payload.old?.user_id
                : payload.new?.user_id
        
        // Solo procesar si es para este usuario
        if (eventUser !== userId) return;
        
        // console.log(`🎯 Evento ${payload.eventType} para ${userId}`, payload);
        
        // Preparar datos según el tipo de evento
        let eventData;
        
        if (payload.eventType === 'INSERT') {
          eventData = {
            ...payload.new,
            _event: 'created'
          };
        } else if (payload.eventType === 'UPDATE') {
          eventData = {
            ...payload.new,
            _oldStatus: payload.old?.status,
            _event: 
              payload.new.status === 'approved' && 
              payload.old?.status !== 'approved' 
              ? 'approved' 
              : 'updated'
          };
        } else if (payload.eventType === 'DELETE') {
          eventData = {
            ...payload.old,
            _deleted: true,
            _event: 'deleted'
          };
        }
        
        if (eventData) {
          // console.log(`🚀 Enviando evento ${eventData._event}`, eventData);
          // Usar requestAnimationFrame para asegurar que React esté listo
          onChange(eventData);
        }
      }
    )
    .subscribe((status) => {
      // console.log(`📡 Canal ${channelName}: ${status}`);
    });

  return channel;
};

// Esta función es SOLO para el ADMIN (mantiene compatibilidad)
export const listenToRequests = (room, options={}, onChange) => {
  const { componentId = 'default'} = options;
  // console.warn("⚠️ listenToRequests está deprecado para usuarios. Usa listenToUserRequests para usuarios individuales.");
  
  // Para el admin, crear canal único
  const channelName = `admin-${room}-${componentId} -${Date.now()}`;
  
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'requests',
        filter: `room_id=eq.${room}`
      },
      (payload) => {
        
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          onChange({
            eventType: payload.eventType,
            ...payload.new,
          });
        } else if (payload.eventType === 'DELETE') {
          onChange({
            eventType: 'DELETE',
            user_id: payload.old.user_id,
            status: null
          });
        }
      }
    )
    .subscribe();
    
  return {
    channel,
    removeChannel: () => supabase.removeChannel(channel)
  } 
};


export const sendJoinRequest = async (roomId, viewerId, adminId) => {
  const { error } = await supabase.from('webrtc_signaling').upsert([
    {
      room_id: roomId,
      from_user: viewerId, // The viewer's ID
      to_user: adminId,     // The admin's ID
      type: 'join',
      payload: { message: 'Requesting to join stream' }, // Payload can be simple
      created_at: new Date().toISOString()
    }
  ]);

  if (error) throw new Error('Error sending join request: ', error.message);
};

export async function registerAdminIsActive(roomId, adminId) {
  try {
    const { error } = await supabase.from('active_users').upsert([
      {
        user_id: adminId,
        room_id: roomId,
        is_admin: true,
        created_at: new Date().toISOString(),
      }
    ]);
    if (error) {console.error("Error registering admin as active:", error)}
    else {console.log("✅ Admin registrado como activo");};
  } catch (error) {
    console.error("❌ Excepción en registerAdminIsActive:", error);
  }  
}

//Los vieweres escuchan las señales del admin y envian la respuesta (answers)
// export const listenToSignalsFromAdmin = async (userId, callback) => {

//     if (!userId) {
//       console.error("Usuario no definido aun"); 
//       return;
//     }
//     const channel = supabase
//     .channel(`Signals from Admin-${userId}`)
//     .on(
//       'postgres_changes',
//       {
//         event: 'INSERT',
//         schema: 'public',
//         table: 'webrtc_signaling',
//         filter: `to_user=eq.${userId}`
//       },
//       (payload) => {
//         callback(payload.new)
//       }
//     )
//     .subscribe((status) => {
//     console.log("Estado de suscripción:", status);

//     return {
//       removeChannel: () => supabase.removeChannel(channel)
//     }
//   });

// };
// export const listenToSignalsFromViewer = async (userId, callback) => {

//   if (!userId) {
//     console.error("Usuario no definido aun"); 
//     return;
//   }
  
//   const channelName = `userId-${userId} -${Date.now()}`;
//   console.log(`🔔 [ADMIN] Usando listenToSignalsFromViewer: ${channelName}`);

//   const channel = supabase
//   .channel(`Signals from Viewer-${userId}`)
//   .on(
//     'postgres_changes',
//     {
//       event: 'INSERT',
//       schema: 'public',
//       table: 'webrtc_signaling',
//       filter: `to_user=eq.${userId}`

//     },
//     (payload) => {
//       const signal = payload.new;
//       if (!signal) return;
//       // callback(payload.new)

//        // Solo procesar señales que vayan al admin
//         if (signal.to_user === userId && (signal.type === "offer" || signal.type === "ice-candidate")) {
//           console.log("📩 Señal de viewer -> admin:", signal.type, "de", signal.from_user);
//           callback(signal);
//         }

//     }
//   )
//   .subscribe((status) => {
//   console.log("Estado de suscripción:", status);

//   return {
//     removeChannel: () => supabase.removeChannel(channel)
//   }
//   });
// };

// export async function setAdminIsStreaming(roomId, adminId) {
//   try {
//     const { error } = await supabase.from('active_users').upsert([
//       {
//         user_id: adminId,
//         room_id: roomId,
//         is_admin: true,
//         is_streaming: true,
//         created_at: new Date().toISOString(),
//       }
//     ]);
//     if (error) {console.error("Error registering streaming as active:", error)}
//     else {console.log("✅ Streaming");};
//   } catch (error) {
//     console.error("❌ Excepción en register streaming is Active:", error);
//   }  
// }

// export async function setViewerIsStreaming(userId) {
//   try {
//     const { error } = await supabase.from('active_users').upsert([
//       {
//         user_id: userId,
//         is_streaming: true,
//         created_at: new Date().toISOString(),
//       }
//     ]);
//     if (error) {console.error("Error registering streaming to user:", error)}
//     else {console.log("✅ Streaming user");};
//   } catch (error) {
//     console.error("❌ Excepción en register streaming is Active:", error);
//   }  
// }

export async function setUserIsStreaming(userId) {
  try {
    const { error } = await supabase.from('active_users').upsert([
      {
        user_id: userId,
        is_streaming: true,
        created_at: new Date().toISOString(),
      }
    ]);
    if (error) {console.error("Error registering streaming to user:", error)}
    else {console.log("✅ Streaming user");};
  } catch (error) {
    console.error("❌ Excepción en register streaming is Active:", error);
  }  
}

export async function offStreaming(userId) {
  try {
    const { error } = await supabase.from('active_users').upsert([
      {
        user_id: userId,
        is_streaming: false,
        created_at: new Date().toISOString(),
      }
    ]);
    if (error) {console.error("Error registering streaming to user:", error)}
    else {console.log("✅ Streaming user");};
  } catch (error) {
    console.error("❌ Excepción en register streaming is Active:", error);
  }  
}

export async function getAdminStreaming() {
  try{
    const { data, error} = await supabase
      .from("active_users")
      .select("is_streaming")
      .eq("is_streaming",true)
      .eq("is_admin",true)
      .single();

      if (error) {
        console.error("Error obteniendo datos:", error);
        return false;
      }
      return data?.is_streaming === true;
      } catch (error){
        console.error("❌ Excepción en adminIsStreaming:", err);
    return false;
    }
};

export async function getViewerStreaming() {
  try{
    const { data, error} = await supabase
      .from("active_users")
      .select("is_streaming")
      .eq("is_streaming",true)
      .eq("is_admin",false)
      .single();

      if (error) {
        console.error("Error obteniendo datos:", error);
        return false;
      }
      console.log("data viewer streaming", data);

      return data?.is_streaming == true;
      } catch (error){
        console.error("❌ Excepción en adminIsStreaming:", err);
    return false;
    }
};

export async function deleteUser(userId) {
  const { error } = await supabase
    .from('active_users')
    .delete()
    .eq('user_id', userId);
  if (error) {console.error("Error deleting admin:", error)}
  else {console.log("✅ eliminado a", userId);};
}

export async function getActiveAdmin(roomId){
  const { data, error } = await supabase
    .from('active_users')
    .select('user_id')
    .eq('room_id', roomId)
    .eq('is_admin', true)
    .single();

    // console.log("data", data);

    if (error) {
    console.error("❌ Error consultando admin activo:", error);
    return null;
    }
  return data?.user_id ?? null;
}

export async function registerViewer(roomId, viewerId ) {

  if (!viewerId) {
    console.error("viewerId es null, no se puede registrar");
    return;
  }
  const { error } = await supabase.from("active_users").upsert([
    {
      user_id: viewerId,
      room_id: roomId,
      is_admin:false,
      created_at: new Date().toISOString(),
    },
  ]);
  if (error) console.error("Error registrando viewer:", error);
}

//El usuario se une a la sala
export async function requestToJoinRoom(roomId, userId) {
    const { data, error1 } = await supabase
        .from('requests')
        .select('user_id')
        .eq('room_id', roomId)
        .eq('status', 'pending')
        // .single();
        // .maybeSingle();
    if (data && data.some(request => request.user_id === userId)) {
        // Ya existe una solicitud pendiente para este usuario en esta sala
        console.log(`El usuario ${userId} ya tiene una solicitud pendiente en la sala ${roomId}.`);
        return;
    }
    if (error1) {
        throw error1;
    }

    const { error } = await supabase
      .from('requests')
      .insert([{ user_id: userId, status: 'pending', room_id: roomId }]);
  
    if (error) {
      console.error("Error sending request:", error);
      return;
    }
  
    // console.log(`Request sent for room: ${roomId}. Waiting for admin approval.`);
}
  
export async function getPendingRequest(roomId) {
    const { data, error } = await supabase
        .from('requests')
        .select('user_id')
        .eq('room_id', roomId)
        .eq('status', 'pending')
        // .single();
        // .maybeSingle();
    if (error) {
        throw error;
    }
    // console.log('Supabase data:', data);
    return data;
}

export async function getPendingRequestById(roomId, userId) {
    const { data: request, error } = await supabase
        .from('requests')
        .select('user_id')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .eq('status', 'pending')
    if (error) {
        throw error;
    }

    const currentViewers= Array.isArray(request) 
        ? request.map(request => request.user_id)
        : [];
    return currentViewers;
    }

export async function getApprovedUserById(roomId, userId) {

    // obtener lista actual de candidatos en sala
    const { data: requestsData, error: roomError } = await supabase
        .from('requests')
        .select('user_id')
        .eq('room_id', roomId)
        .eq('status', 'approved')
        .eq('user_id', userId)
        // .single();

    if (roomError) throw roomError;

    const currentIds = Array.isArray(requestsData)
        ? requestsData.map(request => request.user_id)
        : [];
    return currentIds;
}

//consulta de usuarios aprobados
export async function ApprovedUserQuery(roomId) {
    try {
        const { data, error } = await supabase
        .from('requests')
        .select('user_id')
        .eq('room_id', roomId)
        .eq('status', 'approved')
        // .single();
        // .maybeSingle();

        // console.log('Respuesta cruda de Supabase:', { data, error });   

        if (error) throw error;

        if (!data || data.length === 0) {
            return [];
        };

        return data.map(row => row.user_id).filter(Boolean) 
    } catch (error) {
        console.error('Error en ApprovedUserQuery:', error);
        // throw error; // Propaga el error para manejarlo en el endpoint
        return [];
    }
}

export async function approveUser(roomId, userId, approved='approved') {

   //aprobar el usuario
    const { error } = await supabase
        .from('requests')
        .update({ status: 'approved' })
        .eq('user_id', userId)
        .eq('room_id', roomId)

    if (error) throw error;

    // obtener lista actual de candidatos en sala
    const { data: requestsData, error: roomError } = await supabase
      .from('requests')
      .select('user_id')
      .eq('room_id', roomId)
      .eq('status', 'pending')

    if (roomError) throw roomError;

    const currentCandidates = requestsData?.user_id || [];

    //agregar el nuevo candidato si no esta ya incluido
    const newCandidates = [...new Set([...currentCandidates, userId])];

    // 4. Actualizar la sala con los nuevos candidatos
    const { error: updateRoomError } = await supabase
        .from('requests')
        .update({ candidate: newCandidates })
        .eq('room_id', roomId);

    if (updateRoomError) throw updateRoomError;
}

export async function deleteCandidate(userId, roomId = 'main-room') {
    try{
        // Primero, obtén los datos actuales
        const { data: dataUser, error: fetchError } = await supabase
        .from('requests')
        .select('user_id')
        .eq('user_id', userId)
        .eq('room_id', roomId)
        .maybeSingle()
        // .single()

        if (fetchError) throw fetchError;

        if (!dataUser) {
        console.warn(`No se encontró un request del usuario ${userId} en la sala ${roomId}.`);
        return;
        }

  // 2️⃣ Eliminar el request
    const { error: deleteError } = await supabase
      .from('requests')
      .delete()
      .eq('user_id', userId)
      .eq('room_id', roomId);

    if (deleteError) throw deleteError;

    // console.log(`Request del usuario ${userId} eliminado correctamente de la sala ${roomId}.`);
  } catch (err) {
    console.error('Error al eliminar candidato:', err);
  }
}
// supabase.js
// import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// const { createClient } = require('@supabase/supabase-js');
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = 'https://hhmqduncjwddwptghsaj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhobXFkdW5jandkZHdwdGdoc2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE4ODQ0NTIsImV4cCI6MjA1NzQ2MDQ1Mn0.0IC33LEBv1O4QO9ctymNJu7nMjzXqk1P3Un9gf8WYds';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let approved='approved';

export async function createRoom(roomId) {
    const { error } = await supabase
        .from('rooms')
        .insert([{ room_id: roomId }]);
    if (error) throw error;
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
//consulta de usuarios aprobados
export default async function ApprovedUserQuery(roomId) {
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


//Actualizar las ofertas sdp
export async function offers(offer) {

   //aprobar el usuario
    const { error } = await supabase
        .from('requests')
        .update({ 'sdp_offer': offer.sdp })
        .eq('user_id', userId)

    if (error) throw error;
}

//Actualizar las ofertas sdp
export async function offersAnswer(answer) {

   //aprobar el usuario
    const { error } = await supabase
        .from('requests')
        .update({ 'sdp_offer': answer.sdp })
        .eq('user_id', userId)

    if (error) throw error;
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

// module.exports = {
//     createRoom,
//     requestToJoinRoom,
//     getPendingRequest,
//     approveUser,
//     deleteCandidate,
//     ApprovedUserQuery,
//     getPendingRequestById,
//     offers,
//     offersAnswer,
//     getApprovedUserById
// };
  


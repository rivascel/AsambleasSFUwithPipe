import express from "express";
// const router = express.Router();
const router = express.Router();
export default router;

// const path = require("path");
import path from "path";
// const fs = require("fs");
import fs from "fs";
// const jwt = require('jsonwebtoken');
import jwt from "jsonwebtoken";
// const { addViewerToBroadcast }= require("../utils/js/webrtc/supabase");

import sendMagicLink  from "../utils/sendMagicLink.js";
import createRoom from "../utils/js/webrtc/supabase.js";
// import requestToJoinRoom from "../utils/js/webrtc/supabase.js";
// import getPendingRequest from "../utils/js/webrtc/supabase.js";
// import approveUser from "../utils/js/webrtc/supabase.js";
// import ApprovedUserQuery from "../utils/js/webrtc/supabase.js";
// import deleteCandidate from "../utils/js/webrtc/supabase.js";
// import getPendingRequestById from "../utils/js/webrtc/supabase.js";
// import getApprovedUserById from "../utils/js/webrtc/supabase.js";
import offers from "../utils/js/webrtc/supabase.js";

// const { getPeerConnection, getRemoteStream, closeConnection }= require("../utils/js/webrtc/webrtc-no");


//Traemos el config para el jwtSecret
// const { config } = require('../config/config');
import { config } from "../config/config.js";

// const isLoggedIn = require("../middlewares/IsLoggedIn");

// const { requireAuth } = require('../middlewares/auth');
import requireAuth from "../middlewares/auth.js";

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

router.post("/logout", (req, res) => {
  res.clearCookie("username");
  res.json({ message: "Sesión cerrada" });
});


router.get("/file", (req, res)=>{
    const filePath = path.join(__dirname,'data','votacion.txt'); // Ruta segura al archivo
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error al leer en el archivo:', err);
            return res.status(500).send('Error al leer en el archivo.');
        }

        try {
            // Dividir las líneas y parsearlas a objetos JSON
            const votes = data.split('\n') // Dividir por líneas
                .filter(line => line.trim() !== '') // Eliminar líneas vacías
                .map(line => JSON.parse(line)); // Parsear cada línea como JSON
            res.json(votes);
        } catch (parseError) {
            console.error('Error al parsear los datos:', parseError);
            res.status(500).send('Error al procesar los datos');
        }
    }); 
});

// ================= Archivos de correo validar Quorum ==================
router.get("/emailFile", (req, res)=>{
    const filePath = path.join(__dirname,'data','registro.txt'); // Ruta segura al archivo
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error al leer en el archivo:', err);
            return res.status(500).send('Error al leer en el archivo.');
        }

        // res.send('Archivo escrito exitosamente.');
        try {
            // Dividir las líneas y parsearlas a objetos JSON
            const lines = data.split('\n') // Dividir por líneas
                .filter(line => line.trim() !== '') // Eliminar líneas vacías
                .map(line => JSON.parse(line)); // Parsear cada línea como JSON

            const filteredLines = lines.filter(item => item.participacion !== 0);

            res.json(filteredLines);
            // console.log("Archivo de correos leído y parseado correctamente.", lines);
        } catch (parseError) {
            console.error('Error al parsear los datos:', parseError);
            res.status(500).send('Error al procesar los datos');
        }
    }); 
});

router.post("/fileOwnerByEmail", (req, res)=>{
    const  { email }  = req.body;

    if (!email || typeof email !== 'string') {
        return res.status(400).send('Email es requerido y debe ser un string.');
    }

    const filePath = path.join(__dirname,'data','correos.txt'); // Ruta segura al archivo

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error al leer en el archivo:', err);
            return res.status(500).send('Error al leer en el archivo.');
        }

        try {
            // const owners = JSON.parse(data);
            const lines = data.split('\n') // Dividir por líneas
                .filter(line => line.trim() !== '') // Eliminar líneas vacías

            // Intentar parsear cada línea y manejar errores individualmente
            const owners = lines.map((line, index) => {
                try {
                    return JSON.parse(line);
                } catch (error) {
                    console.error(`Error al parsear la línea ${index + 1}:`, error);
                    throw new Error('Archivo contiene líneas inválidas.');
                }
            });

            const owner = owners.find(o => o.correo.trim().toLowerCase() === correo.trim().toLowerCase());

            if (owner) {
                const participacion = owner['participacion'];

                return res.json({message:"contenido del archivo parseado y participacion", owner, participacion});
            } else {
                
                return res.status(404).send('Correo no encontrado.');
            }
        } catch (parseError) {
            console.error('Error al parsear los datos:', parseError);
            res.status(500).send('Error al procesar los datos');
        }
    }); 
});

router.post("/votacion", (req, res)=>{
    const   globalNewDict   = req.body;
    
    const filePath=path.join(__dirname,'data','votacion.txt'); // Ruta segura al archivo

    // Validar la entrada
    if (!filePath || !globalNewDict) {
        return res.status(400).send('Falta filePath o data en el cuerpo de la solicitud.');
    }

    // Escribir en el archivo
    fs.appendFile(filePath, JSON.stringify(globalNewDict) + '\n', (err) => {
        if (err) {
            console.error('Error al escribir en el archivo:', err);
            return res.status(500).send('Error al escribir en el archivo.');
        }

        res.send('Archivo escrito exitosamente.');
    });
});

router.post("/registro", (req, res)=>{
    const   register   = req.body;

    const filePath=path.join(__dirname,'data','registro.txt'); // Ruta segura al archivo

    // Validar la entrada
    // if (!filePath ) {
    //     return res.status(400).send('Falta filePath o data en el cuerpo de la solicitud.');
    // }

    // Validar la entrada
    if (!register || !register.correo) {
        return res.status(400).send('Faltan datos en el cuerpo de la solicitud.');
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err && err.code !== 'ENOENT') { // Ignorar error si el archivo no existe
            console.error('Error al leer en el archivo:', err);
            return res.status(500).send('Error al leer en el archivo.');
        }

        // Si el archivo existe, verificar si el correo ya está registrado
        if (data) {
            const lines = data.split('\n').filter(line => line.trim() !== '');
            const emailExists = lines.some(line => {
                try {
                    const record = JSON.parse(line);
                    return record.correo === register.correo;
                } catch (e) {
                    return false;
                }
            });

            if (emailExists) {
                // return res.status(400).send('El correo ya está registrado.');
                return res.json({
                    registered: true,
                    message: "El correo ya estaba registrado."
                });


            }
        }

        // Escribir en el archivo
        fs.appendFile(filePath, JSON.stringify(register) + '\n', (err) => {
            if (err) {
                console.error('Error al escribir en el archivo:', err);
                return res.status(500).send('Error al escribir en el archivo.');
            }

            // res.send('Archivo escrito exitosamente.');
            return res.json({
                registered: false,
                message: "Archivo escrito exitosamente."
            });
        });
       
    });
    
});


// ============================= envio del enlace ======================

// Endpoint para solicitar un enlace mágico

router.post('/request-magic-link', async (req, res) => {
    const { email, role } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Email es requerido' });
    }

    // Generar un token JWT con un tiempo de expiración (15 minutos)
    const token = jwt.sign({ email, role }, config.jwtSecret, { expiresIn: '24h' });

    const result = await sendMagicLink(email, role, token);

    if (result.success) {
      res.json({ message: 'Correo enviado' });
    } else {
      res.status(500).json({ error: 'No se pudo enviar el correo' });
    }
});

router.get('/owner-data', requireAuth, (req, res) => {
    // Este endpoint solo devuelve datos si la cookie está presente
    // const session = JSON.parse(req.cookies.session);
    const email = req.user ? req.user.email : "Email no encontrado";
    // const email = req.user.email;
    res.json({
        user: "owner",
        email: email
    });
});

router.get('/admin-data', requireAuth, (req, res) => {
    // Este endpoint solo devuelve datos si la cookie está presente
    const email = req.user ? req.user.email : "administrador no encontrado";
   res.json({ 
        user: "administrador", 
        email: email,
        dashboardData: "Datos privados" 
    });
});

// Endpoint para manejar el enlace mágico
router.get('/magic-link', (req, res) => {
  // 1. Limpiar cookies viejas para evitar conflictos de roles
  res.clearCookie('session');
  res.clearCookie('token');
  res.clearCookie('username');

  const { email, role, token } = req.query;

  console.log("🔗 Magic Link accessed with token:", token, email, role);
  if (!token ) {
    return res.status(400).json({ message: 'Token es requerido' });
  }

  try {
    // 2. Verificar el token y obtener los datos del usuario
    // Usamos el secret directamente para evitar fallos de referencia circular
    const userData = jwt.verify(token, process.env.JWT_SECRET_KEY);

    const cookieOptions = {
      httpOnly: true, // Cambiamos a true por seguridad, el middleware las leerá igual
      secure: true,
      sameSite: 'None',
      maxAge: 1000 * 60 * 60 * 24, // 24 horas
      path: '/',
    };

    // 3. Determinar el rol (puedes basarte en una propiedad del token)
    // Supongamos que tu token tiene { email, role }
    const role = userData.role || 'owner'; // por defecto owner si no viene en el token
    

    // 4. Establecer cookies unificadas
    res.cookie('session', JSON.stringify({ 
        role: userData.role, 
        email: userData.email 
    }), { ...cookieOptions, httpOnly: false }); // httpOnly false para que el front vea el rol si lo necesita

    if (role === 'owner') {
        res.cookie('token', token, cookieOptions);
        console.log(`✅ Cookies de Owner para: ${userData.email}`);
        return res.redirect(`${process.env.FRONTEND_URL}/owner`);
    } else if (role === 'administrador') {
        console.log(`✅ Cookies de Administrador para: ${userData.email}`);
        return res.redirect(`${process.env.FRONTEND_URL}/admin/dashboard`);
    } else {
        console.warn('❌ Rol desconocido en el token');
        return res.status(400).json({ message: 'Rol desconocido' });
    }

  } catch (error) {
    console.error("❌ Error en Magic Link:", error.message);
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
});

router.post('/cancel-users', async (req, res) => {
    
  try {
    const { userId } = req.body;

    await deleteCandidate(userId);

    res.status(200).json({ message: 'Solicitante cancelado' });
  } catch (err) {
    console.error("Error al procesar solicitud:", err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});


// router.post('/request-participation', async (req, res) => {
//   try {

//     const token = req.cookies?.token;
//     //  const io = req.io; // Usa la instancia compartida
    
//     if (!token) {
//         console.log('Token no encontrado en cookies');
//         return res.status(401).json({ error: 'Token no proporcionado' });
//     }

//     const decoded = jwt.verify(token, config.jwtSecret);
//     const email = decoded.email;
//     const { roomId } = req.body;

//     if (!roomId) return res.status(400).json({ error: 'roomId requerido' });

//     await requestToJoinRoom(roomId, email);

//     res.status(200).json({ message: 'Solicitud enviada' });
//   } catch (err) {
//     console.error("Error al procesar solicitud:", err);
//     res.status(500).json({ error: 'Error del servidor' });
//   }
// });

//recupera solicitudes por id

// router.post('/recover-users-id', async (req, res) => {
//   try {
//     const { roomId, userId } = req.body;

//     if (!roomId || !userId) return res.status(400).json({ error: 'roomId/userId y userId son requeridos' });

//     const pendingUsersById = await getPendingRequestById(roomId, userId);
//     const approvedUsersById = await getApprovedUserById(roomId, userId);

//     // console.log("usuarios pendientes",pendingUsers);
//     res.status(200).json({ 
//       pendingUsersById, 
//       approvedUsersById
//     });

//     // const approvedUsersById = await approveUser(roomId, userId);
//     // console.log("usuarios pendientes",pendingUsers);
//     // res.status(200).json({ approvedUsersById});

//     // res.status(200).json({ message: 'Solicitantes enviados' });
//   } catch (err) {
//     console.error("Error al procesar solicitud:", err);
//     res.status(500).json({ error: 'Error del servidor' });
//   }
// });

// router.post('/searched-users-approved', async (req, res) => {
    
//   try {
//     const { roomId } = req.body;
//     // console.log('Request recibido con roomId:', roomId); // Debug 1

//     if (!roomId) return res.status(400).json({ error: 'roomId requerido' });
//     const data = await ApprovedUserQuery(roomId);
//     // console.log('Datos obtenidos de Supabase:', data); // Debug 2

//     res.status(200).json({ 
//         success: true,
//         approvedUsers: data });
//   } catch (err) {
//     console.error("Error al procesar solicitud:", err);
//     res.status(500).json({ error: 'Error del servidor' });
//   }
// });


//recupera los que piden la palabra de supabase
// router.post('/recover-users', async (req, res) => {
//   try {
//     const { roomId } = req.body;

//     if (!roomId) return res.status(400).json({ error: 'roomId requerido' });

//     const pendingUsers = await getPendingRequest(roomId);
//     // console.log("usuarios pendientes",pendingUsers);
//     res.status(200).json({ pendingUsers});


//     // res.status(200).json({ message: 'Solicitantes enviados' });
//   } catch (err) {
//     console.error("Error al procesar solicitud:", err);
//     res.status(500).json({ error: 'Error del servidor' });
//   }
// });


// router.post('/approved-users', async (req, res) => {
    
//   try {
//     const { roomId, userId } = req.body;

//     if (!roomId) return res.status(400).json({ error: 'roomId requerido' });
//     await approveUser(roomId, userId);

//     res.status(200).json({ message: 'Solicitante aprobado' });
//   } catch (err) {
//     console.error("Error al procesar solicitud:", err);
//     res.status(500).json({ error: 'Error del servidor' });
//   }
// });

router.post('/offer', async (req, res) => {
    
  try {
    const { offer } = req.body;

    if (!offer) return res.status(400).json({ error: 'userId requerido' });
    await offers(offer);

    res.status(200).json({ message: 'Solicitante aprobado' });
  } catch (err) {
    console.error("Error al procesar solicitud:", err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/answer', async (req, res) => {
    
  try {
    const { answer } = req.body;

    if (!answer) return res.status(400).json({ error: 'userId requerido' });
    await offersAnswer(answer);

    res.status(200).json({ message: 'Solicitante aprobado' });
  } catch (err) {
    console.error("Error al procesar solicitud:", err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});





//================== ENDPOINTS WEBRTC-CLIENT - SUPABASE============================
router.post('/activate-call', async (req, res)=> {
    try {
        const { roomId, userId, offerId } = req.body;
        
        requestToJoinRoom(roomId, userId, offerId)

        res.status(200).json({ message: 'LLamada activada' });

        }catch(err){
            console.error("Error al procesar solicitud:", err);
            res.status(500).json({ error: 'Error del servidor' });
        }
    });


router.post('/create-room', (req, res) => {

    try{
        createRoom(roomId);
    }catch(err){
        console.error("Error al procesar solicitud:", err);
        res.status(500).json({ error: 'Error del servidor' });
    }
    
});

// Exponer configuración WebRTC
router.get('/webrtc-config', (req, res) => {
  res.json({
    iceServers: [
      { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
     
      {
        urls: "turns:standard.relay.metered.ca:443?transport=tcp",
        username: "6e91ed4ca990de235a21a66f",
        credential: "mqzh0ARtqA3rjU6e",
      },

    ],
    iceCandidatePoolSize: 10
  });
});

// module.exports = router;
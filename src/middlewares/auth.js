// middlewares/auth.js
// const jwt = require('jsonwebtoken');
import jwt from "jsonwebtoken";
// const config = require('../config/config'); // Ajusta la ruta a tu config
import { config } from "../config/config.js"; // Ajusta la ruta a tu config

export default function requireAuth(req, res, next) {
    // 1. Extraer el token de las cookies
    // LOGS DE EMERGENCIA (Aparecerán antes de cualquier lógica)
    // console.log("---------------- AUTH CHECK ----------------");
    // console.log("🕒 Hora:", new Date().toISOString());
    // console.log("🔗 Path:", req.path);
    // console.log("🍪 Cookies crudas (Header):", req.headers.cookie || "SIN COOKIES EN HEADER");
    // console.log("📦 req.cookies (Parser):", req.cookies ? JSON.stringify(req.cookies) : "COOKIE-PARSER NO FUNCIONA");
    // console.log("--------------------------------------------");

    // Permite scripts de dominios externos necesarios para Excalidraw
    res.setHeader(
        "Content-Security-Policy",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://asambleasreact.onrender.com;"
    );

    // const sessionData = req.cookies.session ? JSON.parse(req.cookies.session) : null;
    // const userRole = sessionData ? sessionData.role : null;

    try {
            if (!req.cookies) {
                return res.status(500).json({ message: "Error de servidor (cookies)" });
            }

            // 1. Intentar obtener el rol desde la cookie 'session' o 'username'
            let userRole = null;
            let userEmail = null;


            // 1. Intentar obtener datos de la cookie 'session' (JSON)
            if (req.cookies.session) {
                try {
                    // Si la cookie viene del front, a veces necesita decodeURIComponent
                    const rawSession = req.cookies.session;
                    const sessionData = JSON.parse(rawSession);
                    userRole = sessionData.role;
                    userEmail = sessionData.email;
                } catch (e) {
                    console.error("Error parseando cookie de sesión JSON");
                }
            }

            // 2. FALLBACK: Si no hay session, mirar si existe la cookie 'username' (Caso Admin local)
            if (!userRole && req.cookies.username) {
                userRole = req.cookies.username; // Si la cookie es username=administrador
                userEmail = "admin@local.com";   // Email genérico para admin local
            }

            const token = req.cookies.token;

            // CASO ADMINISTRADOR
            if (userRole === 'administrador' || req.cookies.username === 'administrador') {
                req.user = { 
                    email: userEmail || req.cookies.username || "admin@sistema.com", 
                    role: 'administrador' 
                };
                return next(); // <--- Termina aquí y va al endpoint
            }

            // CASO 2: Owner
            if (userRole === 'owner') {
                const token = req.cookies.token;
                if (!token) {
                    return res.status(401).json({ message: "No hay token de owner" });
                }

                const secret = process.env.JWT_SECRET_KEY;
                const payload = jwt.verify(token, secret);
                // console.log("👤 Payload JWT:", payload);
                req.user = payload;
                return next();
            }

            // // CASO 3: Fallo
            // console.warn("🚫 Rol no reconocido:", userRole);
            // return res.status(403).json({ message: "Acceso denegado: Rol inválido" });
            return res.status(403).json({ message: "No autorizado" });

        } catch (err) {
            console.error("❌ Error en Auth:", err.message);
            if (!res.headersSent) {
                return res.status(401).json({ message: "Sesión expirada" });
            }
        }
}

// module.exports = { requireAuth };
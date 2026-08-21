// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// require('dotenv').config(); // ruta relativa al root del proyecto
// import dotenv from 'dotenv';
// dotenv.config();

import 'dotenv/config';


// const express = require("express");
import express from "express";
import realTimeServer from "./realTimeServer.js";
import cookieParser from "cookie-parser";
import http from "http";
import https from "https";
import fs from "fs";
const app = express();
import cors from "cors";
import path from "path";
import authRoutes from './routes/index.js'; // o './routes/auth'

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);  


// app.use(cors({
//   origin: ['https://localhost:5173','https://localhost:3000'],
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
//   credentials: true,
//   optionsSuccessStatus: 200 // Para navegadores antiguos
// }));

app.set('trust proxy', 1);

// 2. Configura CORS de forma explícita (evita el origin: true si es posible)
const allowedOrigins = [
  'https://asambleasdeployed.onrender.com', 
  'https://asambleasreact.onrender.com', // Agrega todas las variantes que veas en tus logs
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'https://asambleasgeneral.onrender.com',
  'https://192.168.1.3:5173',
  'https://192.168.1.3:3000',
];

const originConfig = process.env.NODE_ENV === 'development' 
  ? true // Permite todo en desarrollo
  : function (origin, callback) {  // Permitir peticiones sin origin (como Postman o health checks)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.error("❌ Bloqueado por CORS:", origin);
      callback(new Error('Not allowed by CORS'));
    } 
};

app.use(cors({
  origin: originConfig,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [    
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'],
    exposedHeaders: ['Set-Cookie']
}));


app.use(cookieParser()); // << esto debe ir ANTES de cualquier `app.use(router)`

// Middleware para parsear el cuerpo de las solicitudes como JSON
app.use(express.json());


app.get('/health', (req, res) => {
  res.send('OK');
});


app.use('/api', authRoutes);

if (process.env.NODE_ENV === 'production') {
    // Esta es la forma más segura de apuntar a la raíz del proyecto en Render
  // 
  const publicPath = path.resolve(__dirname, '..', 'cliente', 'dist');
  
  // Servir archivos estáticos
  app.use(express.static(publicPath));

  // Ruta comodín para React
  app.get('*', (req, res) => {
      res.sendFile(path.join(publicPath, 'index.html'));
  });

};

let server;
if (process.env.NODE_ENV === 'development') {
  // Único caso donde Node mismo necesita hablar HTTPS directamente,
  // porque no hay Nginx/Caddy/Render delante hacienda de proxy TLS
  const options = {
    key: fs.readFileSync(path.resolve(__dirname, 'ssl/192.168.1.3+2-key.pem')),
    cert: fs.readFileSync(path.resolve(__dirname, 'ssl/192.168.1.3+2.pem')),
  };
  server = https.createServer(options, app);
} else {
  // Producción (VPS con Nginx/Caddy delante) → HTTP puro, como ya tenías
  server = http.createServer(app);
}


//settings
app.set("port", process.env.PORT || 3000);
app.set("host", "0.0.0.0");

// Obtén los valores
const PORT = app.get("port");
const HOST = "0.0.0.0";

// console.log("NODE_ENV:", process.env.NODE_ENV);
// console.log("PORT:", process.env.PORT);
// console.log("HOST:", HOST);
// console.log("HTTPS:", process.env.NODE_ENV === 'development');



// server = http.createServer(app);
realTimeServer(server);


server.listen(PORT, HOST, () => {
  console.log(`🚀 Servidor escuchando en ${HOST}:${PORT}`);
});
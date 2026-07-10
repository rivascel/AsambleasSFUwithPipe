// const { Resend } = require('resend');
// const { config } = require('../config/config');

import { Resend } from "resend";
import  { config }  from "../config/config.js";

if (!config.api_key) {
  console.error('❌ RESEND_API_KEY no está definida');
  throw new Error('Missing RESEND_API_KEY');
}

const resend = new Resend(config.api_key); // Guárdala en .env

export default async function sendMagicLink(to, role, token) {
  const magicLink = `${config.BackEndBaseUrl}/api/magic-link?token=${token}`;

  try {
    const data = await resend.emails.send({
      
      from: 'onboarding@resend.dev', // O tu correo verificado
      to,
      subject: 'Tu enlace mágico de acceso de ' + role,
      html: `
        <p>Hola 👋</p>
        <p>Haz clic en el siguiente enlace para iniciar sesión:</p>
        <a href="${magicLink}" style="
          display: inline-block;
          background-color: #007bff;
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 5px;
          font-weight: bold;
        
          
        ">Acceso a la asamblea</a>
        <a>${magicLink}</a>
   
        <p>Este enlace expira en 15 minutos.</p>
      `,
    }
  );
    console.log('Correo enviado:', data);
    
    return { success: true };
  } catch (error) {
    console.error('Error al enviar el correo:', error);
    return { success: false };
  }
}

// module.exports = sendMagicLink;
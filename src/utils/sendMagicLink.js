// const { Resend } = require('resend');
// const { config } = require('../config/config');

// import { Resend } from "resend";
import  { config }  from "../config/config.js";
import  nodemailer  from "nodemailer";

if (!config.api_key) {
  console.error('❌ RESEND_API_KEY no está definida');
  throw new Error('Missing RESEND_API_KEY');
}

// const resend = new Resend(config.api_key); // Guárdala en .env

// Create a transporter using SMTP
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // use STARTTLS (upgrade connection to TLS after connecting)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export default async function sendMagicLink(to, role, token) {
  const magicLink = `${config.BackEndBaseUrl}/api/magic-link?token=${token}`;

  // try {
  //   const data = await resend.emails.send({
      
  //     from: 'onboarding@resend.dev', // O tu correo verificado
  //     to,
  //     subject: 'Tu enlace mágico de acceso de ' + role,
  //     html: `
  //       <p>Hola 👋</p>
  //       <p>Haz clic en el siguiente enlace para iniciar sesión:</p>
  //       <a href="${magicLink}" style="
  //         display: inline-block;
  //         background-color: #007bff;
  //         color: white;
  //         padding: 12px 24px;
  //         text-decoration: none;
  //         border-radius: 5px;
  //         font-weight: bold;
        
          
  //       ">Acceso a la asamblea</a>
  //       <a>${magicLink}</a>
   
  //       <p>Este enlace expira en 15 minutos.</p>
  //     `,
  //   }
  // );
  //   console.log('Correo enviado:', data);
    
  //   return { success: true };
  // } catch (error) {
  //   console.error('Error al enviar el correo:', error);
  //   return { success: false };
  // }

  // if (magicLink) {
    try {
      const data = await transporter.sendMail({
        
        from: '"Asamblea General" <${process.env.SMTP_USER}>', // O tu correo verificado
        to: to,
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
      });
      console.log('Correo enviado:', data);
      
      return { success: true };
    } catch (error) {
      console.error('Error al enviar el correo:', error);
      return { success: false };
    }
  // } else {
  //   console.error("no se envio enlace")
  // }




  //====================
//   try {
//   const info = await transporter.sendMail({
//     from: '"Example Team" <rivascel@gmail.com>', // sender address
//     to: "techprocess.sas@gmail.com", // list of recipients
//     subject: "Hello", // subject line
//     text: "Hello world?", // plain text body
//     html: "<b>Hello world?</b>", // HTML body
//   });

//   console.log("Message sent: %s", info.messageId);
//   // Preview URL is only available when using an Ethereal test account
//   console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
// } catch (err) {
//   console.error("Error while sending mail:", err);
// }
}

// module.exports = sendMagicLink;
// console.log("✅ MagicLinkVerification.jsx actualizado");
import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from "react-router-dom";
import { UserContext } from "../components/UserContext";
import AppContext from '../context/AppContext';


const MagicLinkVerification = () => {
  
  const { apiUrl } = useContext(AppContext);  
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const { login, setIsAuthenticated } = useContext(UserContext);
  const navigate = useNavigate();

  useEffect(() => {
    const verifyMagicLink = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      const role = params.get("role");
      const email = params.get("email");

      console.log("🔗 Verificando enlace mágico con role:", token, role, email);

      if (!token) {
        setErrorMsg("Token no proporcionado en el enlace.");
        setLoading(false);
        return;
      };

      try {
        const res = await fetch(`${apiUrl}/api/magic-link?token=${token}`, {
          credentials: "include",
        });

        const data = await res.json();

        if (res.ok && data.redirectTo) {
          setIsAuthenticated(true);
          login(data.email);

          // Si redirectTo es una URL absoluta, extraemos solo la ruta
          const path = data.redirectTo.startsWith('http')
            ? new URL(data.redirectTo).pathname
            : data.redirectTo;
          navigate(path);

          // window.location.href = data.redirectTo;
        } else {
          
          setErrorMsg(data.message || "Error al verificar el enlace.");
          navigate("/");
          // setLoading(false);
        }
      } catch (err) {
        console.error("Error en la verificación:", err);
        setErrorMsg("Hubo un problema al conectar con el servidor.");
        // setLoading(false);
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    verifyMagicLink();
  }, []);

  if (loading) return <p>Verificando enlace mágico...</p>;
  if (errorMsg) return <p style={{ color: 'red' }}>{errorMsg}</p>;


  return null;
};
export default MagicLinkVerification;
// hooks/useRoomState.js o similar
import { useEffect, useRef } from "react";

export const useRoomState = (socketRef, roomId) => {
  const userRoutersMap = useRef(new Map()); // userId -> routerId
  const myRouterId = useRef(null);
  const producerRouterId = useRef(null);
  const consumerRouterIds = useRef([]);

  // Escuchar asignaciones de routers de otros usuarios
  useEffect(() => {
    if (!socketRef.current) return;

    // Cuando un usuario se une y se le asigna un router
    socketRef.current.on("user-router-assigned", ({ userId, routerId }) => {
      userRoutersMap.current.set(userId, routerId);
      console.log(`📌 Usuario ${userId} está en router ${routerId}`);
    });

    // Cuando un usuario se desconecta, limpiar su router
    socketRef.current.on("user-left", ({ userId }) => {
      userRoutersMap.current.delete(userId);
      console.log(`🗑️ Usuario ${userId} eliminado del mapa de routers`);
    });

    return () => {
      socketRef.current.off("user-router-assigned");
      socketRef.current.off("user-left");
    };
  }, [socketRef.current]);

  // Función para obtener el router de un usuario
  const getUserRouter = async (userId) => 
    {
        // Primero verificar en el mapa local
        if (userRoutersMap.current.has(userId)) {
        return userRoutersMap.current.get(userId);
        }

        // Si no está en el mapa, consultar al servidor
        return new Promise((resolve, reject) => {
            if (!socketRef.current) {
                reject(new Error("Socket no conectado"));
                return;
            }

            socketRef.current.emit("get-user-router", { userId }, (response) => {
                if (response.error) {
                reject(new Error(response.error));
                } else {
                // Guardar en cache local
                userRoutersMap.current.set(userId, response.routerId);
                resolve(response.routerId);
                }
            });
        });
    };

  // Función para obtener mi router
  const getMyRouter = () => myRouterId.current;

  // Función para verificar si dos usuarios están en el mismo router
  const areInSameRouter = async (userId1, userId2) => {
    const router1 = await getUserRouter(userId1);
    const router2 = await getUserRouter(userId2);
    return router1 === router2;
  };

  return {
    getUserRouter,
    getMyRouter,
    areInSameRouter,
    myRouterId,
    producerRouterId,
    consumerRouterIds,
    userRoutersMap: userRoutersMap.current
  };
};
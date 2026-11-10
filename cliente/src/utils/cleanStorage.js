// utils/cleanStorage.js
import { PERSISTENT_KEYS, TEMPORARY_KEYS, TEMPORARY_PREFIXES } from './storageConfig';

export const cleanStaleStorage = () => {
  console.log('🧹 Limpiando storage obsoleto...');
  
  // 1. Eliminar claves temporales conocidas
  TEMPORARY_KEYS.forEach(key => {
    if (localStorage.getItem(key) !== null) {
      console.log(`  ❌ Eliminando: ${key}`);
      localStorage.removeItem(key);
    }
  });

  // 2. Eliminar claves por prefijo
  const allKeys = Object.keys(localStorage);
  allKeys.forEach(key => {
    const matchesPrefix = TEMPORARY_PREFIXES.some(prefix => key.startsWith(prefix));
    if (matchesPrefix) {
      console.log(`  ❌ Eliminando por prefijo: ${key}`);
      localStorage.removeItem(key);
    }
  });

  // 3. (Opcional) Eliminar CUALQUIER clave que NO esté en la whitelist
  // ⚠️ Esto es agresivo pero muy efectivo
  allKeys.forEach(key => {
    if (!PERSISTENT_KEYS.includes(key) && !TEMPORARY_KEYS.includes(key)) {
      console.log(`  ⚠️ Clave desconocida, eliminando: ${key}`);
      localStorage.removeItem(key);
    }
  });

  console.log('✅ Storage limpio');
};
// utils/storageConfig.js

// Variables que SÍ deben persistir entre sesiones
export const PERSISTENT_KEYS = [
  'isAuthenticatedOwner',
  'isAuthenticatedAdmin',
  'ownerInfo',
  'theme',           // preferencias del usuario
  'language',        // idioma
];

// Variables que son TEMPORALES y deben limpiarse siempre al iniciar
export const TEMPORARY_KEYS = [
  'requestStatus',
  'currentVote',
  'pendingRequest',
  'socketId',
  'sessionTemp',
  'loadingState',
  'formDraft',
  'lastAction',
  'tempData',
  // agrega aquí todas las que uses temporalmente
];

// Prefijos de variables temporales (útil si usas nombres dinámicos)
export const TEMPORARY_PREFIXES = [
  'temp_',
  'tmp_',
  'draft_',
  'cache_',
];
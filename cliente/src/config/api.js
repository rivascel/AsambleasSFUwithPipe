// export const API_URL = import.meta.env.VITE_API_URL;


const API_URL =`${window.location.protocol}//${window.location.hostname}:${import.meta.env.VITE_API_PORT}`;


export default API_URL;

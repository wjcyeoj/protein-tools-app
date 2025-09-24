// Default to '/api' so nginx proxies to the backend.
// If you prefer calling the API directly, set VITE_API_BASE in env.
const API_BASE = (import.meta?.env?.VITE_API_BASE ?? '').trim() || '/api';
export default API_BASE;

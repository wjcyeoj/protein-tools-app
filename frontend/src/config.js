// Default to nginx proxy (/api). For local direct dev, set REACT_APP_API_BASE=http://localhost:8000
export const API_BASE = process.env.REACT_APP_API_BASE || '/api';

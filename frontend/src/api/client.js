import axios from 'axios';
import { API_BASE } from '../config';

const client = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg = err?.response?.data?.detail || err.message || 'Request failed';
    return Promise.reject(new Error(msg));
  }
);

export default client;

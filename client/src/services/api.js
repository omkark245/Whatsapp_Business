import axios from 'axios';
import { getApiErrorCode, getApiErrorMessage, getApiRequestId } from '../utils/apiError';

function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;

  if (import.meta.env.PROD && window.location.hostname === 'whatsapp.finlectechnologies.com') {
    return 'https://api.whatsapp.finlectechnologies.com/api';
  }

  return '/api';
}

const apiBaseUrl = getApiBaseUrl();

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true, // send httpOnly cookies automatically on every request
});

// No Authorization header injection needed — JWT is in the httpOnly cookie

api.interceptors.response.use(
  (res) => res,
  (error) => {
    error.errorCode = getApiErrorCode(error);
    error.normalizedMessage = getApiErrorMessage(error);
    error.requestId = getApiRequestId(error);

    if (error.response?.status === 401) {
      const message = String(error.response?.data?.error || '').toLowerCase();
      const isAuthFailure =
        message.includes('authentication required') ||
        message.includes('invalid or expired token') ||
        message.includes('user not found');

      if (isAuthFailure) {
        localStorage.removeItem('user');
        localStorage.removeItem('activeAccount');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

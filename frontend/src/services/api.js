import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const API = axios.create({
  baseURL: API_BASE_URL
});

// Agregar token automáticamente a cada request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Si el token expira redirigir al login
API.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('agent');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export const login = (username, password) =>
  API.post('/auth/login', { username, password });

export const getMe = () =>
  API.get('/auth/me');

export const changePassword = (username, currentPassword, newPassword) =>
  API.put('/auth/change-password', { username, currentPassword, newPassword });

export const getChats = () => API.get('/chats');
export const getMessages = (chatId) => API.get(`/chats/${chatId}/messages`);
export const archiveChat = (chatId) => API.patch(`/chats/${chatId}/archive`);
export const restoreChat = (chatId) => API.patch(`/chats/${chatId}/restore`);
export const deleteChat = (chatId) => API.delete(`/chats/${chatId}`);
export const sendMessage = (to, text, chatId) =>
  API.post('/chats/send', { to, text, chatId });
export const dispatchDriver = (chatId, payload) =>
  API.post(`/chats/${chatId}/dispatch-driver`, payload);
export const getDrivers = () => API.get('/drivers');
export const createDriver = (data) => API.post('/drivers', data);
export const getQuickReplies = () => API.get('/quick-replies');
export const toggleBot = (chatId, active) =>
  API.post(`/chats/${chatId}/bot`, { active });

export const getBotMenu = () => API.get('/bot/menu');
export const updateBotMenuItem = (id, data) => API.put('/bot/menu/' + id, data);
export const addBotMenuItem = (data) => API.post('/bot/menu', data);
export const deleteBotMenuItem = (id) => API.delete('/bot/menu/' + id);
export const getBotMessages = () => API.get('/bot/messages');
export const updateBotMessage = (key, value) => API.put('/bot/messages/' + key, { value });
export const simulateMessage = (data) => API.post('/simulate', data);

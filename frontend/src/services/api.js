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

export const getChats = (params = {}) => API.get('/chats', { params });
export const createCustomerContacts = (data) => API.post('/chats/customers', data);
export const getMessages = (chatId, params = {}) => API.get(`/chats/${chatId}/messages`, { params });
export const getChatHistory = (chatId) => API.get(`/chats/${chatId}/history`);
export const updateRideStatus = (chatId, status) =>
  API.patch(`/chats/${chatId}/ride-status`, { status });
export const archiveChat = (chatId) => API.patch(`/chats/${chatId}/archive`);
export const restoreChat = (chatId) => API.patch(`/chats/${chatId}/restore`);
export const deleteChat = (chatId) => API.delete(`/chats/${chatId}`);
export const bulkDeleteCustomerChats = (period, includeOpenRides = false) =>
  API.delete('/chats/bulk/customers', { data: { period, includeOpenRides } });
export const sendMessage = (to, text, chatId) =>
  API.post('/chats/send', { to, text, chatId });
export const dispatchDriver = (chatId, payload) =>
  API.post(`/chats/${chatId}/dispatch-driver`, payload);
export const getDrivers = () => API.get('/drivers');
export const createDriver = (data) => API.post('/drivers', data);
export const updateDriver = (id, data) => API.patch(`/drivers/${id}`, data);
export const deleteDriver = (id) => API.delete(`/drivers/${id}`);
export const getReportSummary = () => API.get('/reports/summary');
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

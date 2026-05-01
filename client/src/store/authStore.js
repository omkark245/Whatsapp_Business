import { create } from 'zustand';
import api from '../services/api';
import useAccountStore from './accountStore';
import useChatStore from './chatStore';

const useAuthStore = create((set) => ({
  // User metadata (name, email, id) stored for display — NOT the token
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  // Auth state is determined by user presence; confirmed by /auth/me on load
  isAuthenticated: !!localStorage.getItem('user'),
  loading: false,

  login: async (email, password) => {
    set({ loading: true });
    try {
      // Server sets httpOnly cookie — we only receive user metadata in body
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('user', JSON.stringify(data.user));
      await useAccountStore.getState().fetchAccounts();
      set({ user: data.user, isAuthenticated: true, loading: false });
      return data.user;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  register: async (name, email, password) => {
    set({ loading: true });
    try {
      const { data } = await api.post('/auth/register', { name, email, password });
      localStorage.setItem('user', JSON.stringify(data.user));
      await useAccountStore.getState().fetchAccounts();
      set({ user: data.user, isAuthenticated: true, loading: false });
      return data.user;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      // Tell server to clear the httpOnly cookie
      await api.post('/auth/logout');
    } catch {
      // Proceed with local cleanup even if server call fails
    }
    localStorage.removeItem('user');
    localStorage.removeItem('activeAccount');
    useAccountStore.getState().clearAccounts();
    useChatStore.getState().clearChat();
    set({ user: null, isAuthenticated: false });
  },

  // Verify session is still valid on app reload
  checkAuth: async () => {
    try {
      const { data } = await api.get('/auth/me');
      localStorage.setItem('user', JSON.stringify(data.user));
      await useAccountStore.getState().fetchAccounts();
      set({ user: data.user, isAuthenticated: true });
      return data.user;
    } catch {
      localStorage.removeItem('user');
      localStorage.removeItem('activeAccount');
      useAccountStore.getState().clearAccounts();
      useChatStore.getState().clearChat();
      set({ user: null, isAuthenticated: false });
      return null;
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    set({ loading: true });
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      const { data } = await api.get('/auth/me');
      localStorage.setItem('user', JSON.stringify(data.user));
      set({ user: data.user, isAuthenticated: true, loading: false });
      return data.user;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
}));

export default useAuthStore;

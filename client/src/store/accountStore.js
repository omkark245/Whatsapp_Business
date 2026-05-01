import { create } from 'zustand';
import api from '../services/api';

const useAccountStore = create((set, get) => ({
  accounts: [],
  activeAccount: JSON.parse(localStorage.getItem('activeAccount') || 'null'),
  loading: false,

  fetchAccounts: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get('/wa-accounts');
      const accounts = data.accounts || [];
      const activeAccountId = get().activeAccount?.id;
      const nextActiveAccount =
        accounts.find((account) => account.id === activeAccountId) ||
        accounts[0] ||
        null;

      if (nextActiveAccount) {
        localStorage.setItem('activeAccount', JSON.stringify(nextActiveAccount));
      } else {
        localStorage.removeItem('activeAccount');
      }

      set({
        accounts,
        activeAccount: nextActiveAccount,
        loading: false,
      });
    } catch {
      set({ accounts: [], activeAccount: null, loading: false });
    }
  },

  setActiveAccount: (account) => {
    localStorage.setItem('activeAccount', JSON.stringify(account));
    set({ activeAccount: account });
  },

  clearAccounts: () => {
    localStorage.removeItem('activeAccount');
    set({ accounts: [], activeAccount: null, loading: false });
  },

  connectManual: async (accessToken, phoneNumberId, wabaId) => {
    const { data } = await api.post('/wa-accounts/connect-manual', { accessToken, phoneNumberId, wabaId });
    await get().fetchAccounts();
    return data;
  },

  deleteAccount: async (id) => {
    await api.delete(`/wa-accounts/${id}`);
    await get().fetchAccounts();
  },

  updateAccount: async (id, accessToken, phoneNumberId, wabaId) => {
    const payload = {
      ...(String(accessToken || '').trim() ? { accessToken: String(accessToken).trim() } : {}),
      ...(String(phoneNumberId || '').trim() ? { phoneNumberId: String(phoneNumberId).trim() } : {}),
      ...(String(wabaId || '').trim() ? { wabaId: String(wabaId).trim() } : {}),
    };
    const { data } = await api.patch(`/wa-accounts/${id}`, payload);
    await get().fetchAccounts();
    return data;
  },
}));

export default useAccountStore;

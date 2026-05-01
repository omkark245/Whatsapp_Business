import { create } from 'zustand';
import api from '../services/api';

const useChatStore = create((set) => ({
  contacts: [],
  activeContact: null,
  messages: [],
  loading: false,
  messagesLoading: false,
  contactsPagination: { total: 0, page: 1, limit: 50, pages: 1 },

  fetchContacts: async (waAccountId, search = '', page = 1, limit = 50) => {
    set({ loading: true });
    try {
      const { data } = await api.get(`/chat/${waAccountId}/contacts`, {
        params: { search, page, limit },
      });
      set({
        contacts: data.contacts,
        contactsPagination: data.pagination || { total: data.contacts.length, page, limit, pages: 1 },
        loading: false,
      });
    } catch {
      set({
        contacts: [],
        activeContact: null,
        messages: [],
        contactsPagination: { total: 0, page, limit, pages: 1 },
        loading: false,
      });
    }
  },

  setActiveContact: (contact) => set({ activeContact: contact, messages: [] }),

  fetchMessages: async (contactId) => {
    set({ messagesLoading: true });
    try {
      const { data } = await api.get(`/chat/messages/${contactId}`);
      set({ messages: data.messages, messagesLoading: false });
    } catch {
      set({ messagesLoading: false });
    }
  },

  sendMessage: async (contactId, messageData) => {
    const { data } = await api.post(`/chat/send/${contactId}`, messageData);
    set((state) => {
      const exists = state.messages.some((message) => (
        message.id === data.message.id ||
        (data.message.waMessageId && message.waMessageId === data.message.waMessageId)
      ));

      if (exists) return state;
      return { messages: [...state.messages, data.message] };
    });
    return data;
  },

  addMessage: (message) => {
    set((state) => {
      if (state.messages.find(m => (
        m.id === message.id ||
        (message.waMessageId && m.waMessageId === message.waMessageId)
      ))) return state;
      return { messages: [...state.messages, message] };
    });
  },

  updateMessageStatus: (waMessageId, status, failure = null) => {
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.waMessageId !== waMessageId) return m;
        return {
          ...m,
          status,
          ...(failure
            ? { metadata: { ...(m.metadata || {}), failure } }
            : {}),
        };
      }),
    }));
  },

  updateContactInList: (contact, message = null) => {
    set((state) => {
      const existing = state.contacts.find((c) => c.id === contact.id);
      const mergedContact = {
        ...(existing || {}),
        ...contact,
        messages: message ? [message] : (contact.messages || existing?.messages || []),
        lastMessageAt: contact.lastMessageAt || message?.createdAt || existing?.lastMessageAt,
      };

      return {
        contacts: [
          mergedContact,
          ...state.contacts.filter((c) => c.id !== contact.id),
        ].sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)),
        activeContact: state.activeContact?.id === contact.id
          ? {
              ...state.activeContact,
              ...contact,
              lastMessageAt: mergedContact.lastMessageAt,
            }
          : state.activeContact,
      };
    });
  },

  clearChat: () => set({
    contacts: [],
    activeContact: null,
    messages: [],
    loading: false,
    messagesLoading: false,
    contactsPagination: { total: 0, page: 1, limit: 50, pages: 1 },
  }),
}));

export default useChatStore;

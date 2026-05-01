import { useEffect, useEffectEvent, useRef } from 'react';
import { io } from 'socket.io-client';
import { showApiError } from '../utils/apiError';
import useChatStore from '../store/chatStore';

function deriveSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;

  if (import.meta.env.PROD && window.location.hostname === 'whatsapp.finlectechnologies.com') {
    return 'https://api.whatsapp.finlectechnologies.com';
  }

  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) return undefined;

  try {
    const parsed = new URL(apiUrl);
    parsed.pathname = parsed.pathname.replace(/\/api\/?$/, '') || '/';
    return parsed.origin;
  } catch {
    return undefined;
  }
}

const socketUrl = deriveSocketUrl();
const socketPath = import.meta.env.VITE_SOCKET_PATH || '/socket.io';

const useSocket = () => {
  const socketRef = useRef(null);
  const handleNewMessage = useEffectEvent(({ message, contact }) => {
    const { activeContact, addMessage, updateContactInList } = useChatStore.getState();
    if (contact) updateContactInList(contact, message);
    if (message.contactId === activeContact?.id) addMessage(message);
  });

  const handleMessageStatus = useEffectEvent(({ waMessageId, status, failure }) => {
    useChatStore.getState().updateMessageStatus(waMessageId, status, failure);
  });

  useEffect(() => {
    const socket = io(socketUrl, {
      path: socketPath,
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('new_message', handleNewMessage);
    socket.on('message_status', handleMessageStatus);
    socket.on('connect_error', (error) => {
      showApiError(error, 'Realtime connection failed');
    });

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message_status', handleMessageStatus);
      socket.off('connect_error');
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);
};

export default useSocket;

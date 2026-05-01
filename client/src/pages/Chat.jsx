import { useEffect, useEffectEvent, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IoSend, IoSearch, IoCheckmarkDone, IoCheckmark, IoCloseCircle, IoImage,
  IoDocument, IoVideocam, IoHappy, IoChatbubbles, IoFlash, IoCopy,
  IoArrowUndo, IoClose, IoArrowBack, IoWarning, IoChevronForward,
  IoLink, IoNotificationsOffOutline, IoTimerOutline, IoShieldCheckmarkOutline,
} from 'react-icons/io5';
import toast from 'react-hot-toast';
import useChatStore from '../store/chatStore';
import useAccountStore from '../store/accountStore';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import AppSelect from '../components/ui/AppSelect';
import { getApiErrorMessage, showApiError } from '../utils/apiError';
import { getMessageMediaSpec } from '../utils/messageMedia';
import { getMessageSenderDetails, getMessageSenderSummary } from '../utils/messageSender';

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date) {
  const d = new Date(date);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const y = new Date(today); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString();
}

function sanitizeContactText(value = '') {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .trim();
}

function getContactDisplayName(contact) {
  const cleanName = sanitizeContactText(contact?.name || '');
  const cleanPhone = sanitizeContactText(contact?.phone || '');
  return cleanName || cleanPhone || 'Unknown';
}

function getContactInitial(contact) {
  const label = getContactDisplayName(contact);
  const firstLetter = [...label].find((char) => /[\p{L}\p{N}]/u.test(char));
  return (firstLetter || label[0] || '?').toUpperCase();
}

function splitReplyContent(content = '') {
  const text = String(content || '');
  const markerIndex = text.toLowerCase().indexOf('reply with:');
  if (markerIndex === -1) return { text, buttons: [] };

  const messageText = text.slice(0, markerIndex).trim();
  const lines = text.slice(markerIndex).split('\n').map((line) => line.trim());
  const buttons = lines
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^- /, '').trim())
    .filter(Boolean);

  return { text: messageText || text, buttons };
}

function formatMessageLines(text = '') {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd());
}

function renderFormattedInline(text, keyPrefix) {
  const tokens = String(text || '').split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g);

  return tokens.map((token, index) => {
    if (!token) return null;

    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return <strong key={`${keyPrefix}-bold-${index}`} className="font-semibold text-slate-900">{token.slice(1, -1)}</strong>;
    }

    if (token.startsWith('_') && token.endsWith('_') && token.length > 2) {
      return <em key={`${keyPrefix}-italic-${index}`} className="italic">{token.slice(1, -1)}</em>;
    }

    if (token.startsWith('~') && token.endsWith('~') && token.length > 2) {
      return <span key={`${keyPrefix}-strike-${index}`} className="line-through opacity-80">{token.slice(1, -1)}</span>;
    }

    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return <code key={`${keyPrefix}-code-${index}`} className="rounded bg-slate-900/8 px-1 py-0.5 font-mono text-[0.92em]">{token.slice(1, -1)}</code>;
    }

    return <span key={`${keyPrefix}-text-${index}`}>{token}</span>;
  });
}

function MessageText({ text }) {
  const lines = formatMessageLines(text);

  return (
    <div className="space-y-1.5 leading-6 text-slate-800">
      {lines.map((line, index) => {
        if (!line.trim()) {
          return <div key={`line-gap-${index}`} className="h-2" />;
        }

        const isBullet = /^[-•]\s+/u.test(line.trim());
        const cleanLine = isBullet ? line.trim().replace(/^[-•]\s+/u, '') : line;

        return (
          <div key={`line-${index}`} className={isBullet ? 'flex items-start gap-2' : ''}>
            {isBullet && <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />}
            <p className="whitespace-pre-wrap break-words">
              {renderFormattedInline(cleanLine, `line-${index}`)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function MessageMedia({ message }) {
  const [failedUrls, setFailedUrls] = useState([]);
  const media = getMessageMediaSpec(message, {
    apiBaseUrl: api.defaults.baseURL || '/api',
    origin: window.location.origin,
  });
  const candidateUrls = Array.isArray(media?.candidateUrls) && media.candidateUrls.length > 0
    ? media.candidateUrls
    : (media?.mediaUrl ? [media.mediaUrl] : []);
  const activeMediaUrl = candidateUrls.find((url) => !failedUrls.includes(url)) || candidateUrls[0] || '';
  const fallbackMediaUrl = candidateUrls[0] || media?.mediaUrl || '';
  const alternateDocumentUrls = candidateUrls.slice(1);

  useEffect(() => {
    setFailedUrls([]);
  }, [media?.mediaUrl, message?.id]);

  if (!activeMediaUrl) return null;
  const hasFailed = failedUrls.length >= candidateUrls.length;

  if (media.kind === 'image') {
    if (hasFailed) {
      return (
        <a
          href={fallbackMediaUrl}
          target="_blank"
          rel="noreferrer"
          className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700"
        >
          <IoImage className="shrink-0 text-amber-500" />
          <span className="truncate">Image preview unavailable. Open image</span>
        </a>
      );
    }

    return (
      <a href={activeMediaUrl} target="_blank" rel="noreferrer" className="mb-3 block">
        <div className="overflow-hidden rounded-xl border border-black/5 bg-white shadow-sm">
          <img
            src={activeMediaUrl}
            alt={media.label || 'Shared image'}
            className="min-h-[16rem] max-h-[26rem] w-full bg-white object-contain"
            loading="lazy"
            onError={() => setFailedUrls((current) => (
              current.includes(activeMediaUrl) ? current : [...current, activeMediaUrl]
            ))}
          />
        </div>
      </a>
    );
  }

  if (media.kind === 'video') {
    if (hasFailed) {
      return (
        <a
          href={fallbackMediaUrl}
          target="_blank"
          rel="noreferrer"
          className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700"
        >
          <IoVideocam className="shrink-0 text-amber-500" />
          <span className="truncate">Video preview unavailable. Open video</span>
        </a>
      );
    }

    return (
      <div className="mb-3">
        <div className="overflow-hidden rounded-xl border border-black/5 bg-black shadow-sm">
          <video
            key={activeMediaUrl}
            controls
            className="min-h-[16rem] max-h-[26rem] w-full bg-black object-contain"
            onError={() => setFailedUrls((current) => (
              current.includes(activeMediaUrl) ? current : [...current, activeMediaUrl]
            ))}
          >
            <source src={activeMediaUrl} />
          </video>
        </div>
      </div>
    );
  }

  if (media.kind === 'document') {
    return (
      <div className="mb-3 space-y-1.5">
        <a
          href={activeMediaUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
        >
          <IoDocument className="text-slate-400" />
          <span className="truncate">{media.label}</span>
        </a>
        {alternateDocumentUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {alternateDocumentUrls.map((url, index) => (
              <a
                key={`${message?.id || media.label || 'document'}-alt-${index}`}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
              >
                Open alternate file {index + 1}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function StatusIcon({ status }) {
  if (status === 'failed') return <IoCloseCircle className="text-red-500 text-sm" />;
  if (status === 'read') return <IoCheckmarkDone className="text-blue-500 text-sm" />;
  if (status === 'delivered') return <IoCheckmarkDone className="text-gray-400 text-sm" />;
  if (status === 'sent') return <IoCheckmark className="text-gray-400 text-sm" />;
  return null;
}

function getMessageFailureText(message) {
  if (message?.status !== 'failed') return '';
  const failure = message?.metadata?.failure;
  return failure?.errorMessage || failure?.message || '';
}

function getMessageBubbleClass(message) {
  const media = getMessageMediaSpec(message, {
    apiBaseUrl: api.defaults.baseURL || '/api',
    origin: window.location.origin,
  });
  const widthClass = 'w-full max-w-[19rem] sm:max-w-[22rem] xl:max-w-[24rem]';

  if (media || message?.type === 'template') {
    return widthClass;
  }

  return widthClass;
}

function isHttpUrl(value = '') {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getSharedContent(messages = []) {
  const mediaItems = [];
  const linkItems = [];
  const docItems = [];
  const seenMedia = new Set();
  const seenLinks = new Set();
  const seenDocs = new Set();

  messages.forEach((message) => {
    const media = getMessageMediaSpec(message, {
      apiBaseUrl: api.defaults.baseURL || '/api',
      origin: window.location.origin,
    });

    if (media?.mediaUrl) {
      const key = `${media.kind}:${media.mediaUrl}`;
      if (!seenMedia.has(key)) {
        seenMedia.add(key);
        mediaItems.push({
          id: `${message.id}-media`,
          kind: media.kind,
          url: media.mediaUrl,
          label: media.label || 'Media',
        });
      }

      if (media.kind === 'document' && !seenDocs.has(media.mediaUrl)) {
        seenDocs.add(media.mediaUrl);
        docItems.push({
          id: `${message.id}-doc`,
          url: media.mediaUrl,
          label: media.label || 'Document',
        });
      }
    }

    const text = String(message?.metadata?.templateDisplay || message?.content || '');
    const urlMatches = text.match(/https?:\/\/[^\s)]+/gi) || [];
    urlMatches.forEach((url) => {
      const cleanUrl = url.replace(/[.,!?]+$/g, '');
      if (!isHttpUrl(cleanUrl) || seenLinks.has(cleanUrl)) return;
      seenLinks.add(cleanUrl);
      linkItems.push({
        id: `${message.id}-link-${cleanUrl}`,
        url: cleanUrl,
      });
    });
  });

  return { mediaItems, linkItems, docItems };
}

function getMessageDisplayContent(message) {
  if (!message) return '';
  return message.type === 'template'
    ? (message.metadata?.templateDisplay || message.content || '')
    : (message.content || '');
}

function getContactPreviewText(contact) {
  const lastMessage = contact?.messages?.[0];
  const preview = getMessageDisplayContent(lastMessage).trim();
  return preview || contact?.phone || '';
}

export default function Chat() {
  const navigate = useNavigate();
  const {
    contacts,
    activeContact,
    messages,
    loading,
    messagesLoading,
    fetchContacts,
    setActiveContact,
    fetchMessages,
    sendMessage,
    updateContactInList,
  } = useChatStore();
  const { activeAccount, fetchAccounts } = useAccountStore();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [quickRepliesPinned, setQuickRepliesPinned] = useState(false);
  const [quickReplies, setQuickReplies] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [showAssignmentPanel, setShowAssignmentPanel] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [assignmentTeamId, setAssignmentTeamId] = useState('');
  const [assignmentUserId, setAssignmentUserId] = useState('');
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const loadContacts = useEffectEvent(async () => {
    if (activeAccount?.id) {
      await fetchContacts(activeAccount.id, search);
    }
  });

  const loadMessages = useEffectEvent(async () => {
    if (activeContact?.id) {
      await fetchMessages(activeContact.id);
    }
  });

  const syncChatFromServer = useEffectEvent(async () => {
    if (!activeAccount?.id) return;

    await fetchContacts(activeAccount.id, search);

    if (activeContact?.id) {
      await fetchMessages(activeContact.id);
    }
  });

  const loadQuickReplies = useEffectEvent(async () => {
    if (!activeAccount?.id) {
      setQuickReplies([]);
      return;
    }

    try {
      const { data } = await api.get(`/quick-replies/${activeAccount.id}`);
      setQuickReplies(data.quickReplies || []);
    } catch {
      setQuickReplies([]);
    }
  });

  const loadAssignmentOptions = useEffectEvent(async () => {
    if (user?.role !== 'admin') {
      setTeams([]);
      setMembers([]);
      return;
    }

    try {
      const [teamsResponse, membersResponse] = await Promise.all([
        api.get('/teams'),
        api.get('/team-members'),
      ]);
      setTeams(teamsResponse.data.teams || []);
      setMembers(membersResponse.data.members || []);
    } catch (error) {
      showApiError(error, 'Failed to load team assignments');
    }
  });

  useEffect(() => { void loadContacts(); }, [activeAccount?.id, search]);

  useEffect(() => { void loadMessages(); }, [activeContact?.id]);

  useEffect(() => {
    if (!activeAccount?.id) return undefined;

    const refreshIfVisible = () => {
      if (document.visibilityState === 'hidden') return;
      void syncChatFromServer();
    };

    const intervalId = window.setInterval(refreshIfVisible, 10000);

    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [activeAccount?.id, activeContact?.id, search]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => { void loadQuickReplies(); }, [activeAccount?.id]);
  useEffect(() => { void loadAssignmentOptions(); }, [user?.role]);

  useEffect(() => {
    setAssignmentTeamId(activeContact?.teamId ? String(activeContact.teamId) : '');
    setAssignmentUserId(activeContact?.assignedUserId ? String(activeContact.assignedUserId) : '');
    setShowAssignmentPanel(false);
    setShowContactInfo(false);
  }, [activeContact?.id, activeContact?.teamId, activeContact?.assignedUserId]);

  const showQuickReplies = quickReplies.length > 0 && (quickRepliesPinned || text.startsWith('/'));
  const accountNeedsReconnect = activeAccount?.status && activeAccount.status !== 'active';
  const canManageAssignments = user?.role === 'admin';
  const teamOptions = [
    { value: '', label: 'Unassigned' },
    ...teams
      .filter((team) => team.status !== 'archived')
      .map((team) => ({ value: String(team.id), label: team.name })),
  ];
  const memberOptions = [
    { value: '', label: 'No primary member' },
    ...members
      .filter((member) => (
        member.status === 'active'
        && String(member.teamId || '') === String(assignmentTeamId || '')
      ))
      .map((member) => ({ value: String(member.id), label: member.name })),
  ];

  const handleSend = async () => {
    if (!text.trim() || !activeContact || isSending) return;
    if (accountNeedsReconnect) {
      toast.error('Reconnect this WhatsApp account in Settings before sending messages.');
      return;
    }

    const messageText = text.trim();
    setIsSending(true);
    try {
      await sendMessage(activeContact.id, { type: 'text', content: messageText });
      setText('');
      setReplyTo(null);
      setQuickRepliesPinned(false);
    } catch (error) {
      const message = getApiErrorMessage(error, 'Failed to send message');
      if (/access token expired|reconnect this account/i.test(message)) {
        await fetchAccounts();
      }
      showApiError(error, 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickSend = async (value) => {
    if (!value || !activeContact || isSending) return;
    if (accountNeedsReconnect) {
      toast.error('Reconnect this WhatsApp account in Settings before sending messages.');
      return;
    }

    setIsSending(true);
    try {
      await sendMessage(activeContact.id, { type: 'text', content: value.trim() });
      setText('');
      setReplyTo(null);
    } catch (error) {
      const message = getApiErrorMessage(error, 'Failed to send message');
      if (/access token expired|reconnect this account/i.test(message)) {
        await fetchAccounts();
      }
      showApiError(error, 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const selectQuickReply = (reply) => {
    // Replace variables
    let content = reply.content
      .replace(/\{\{name\}\}/g, activeContact?.name || 'there')
      .replace(/\{\{phone\}\}/g, activeContact?.phone || '');
    setText(content);
    setQuickRepliesPinned(false);
    inputRef.current?.focus();
  };

  const handleCopy = (content) => {
    navigator.clipboard.writeText(content);
    toast.success('Copied');
    setContextMenu(null);
  };

  const handleReply = (msg) => {
    setReplyTo(msg);
    setContextMenu(null);
    inputRef.current?.focus();
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message: msg });
  };

  const saveAssignment = async () => {
    if (!activeAccount?.id || !activeContact?.id || !canManageAssignments) return;

    setAssignmentSaving(true);
    try {
      const { data } = await api.patch(`/contacts/${activeAccount.id}/${activeContact.id}/assignment`, {
        teamId: assignmentTeamId ? Number(assignmentTeamId) : null,
        assignedUserId: assignmentUserId ? Number(assignmentUserId) : null,
      });
      toast.success('Chat assignment updated');
      setActiveContact(data.contact);
      await fetchContacts(activeAccount.id, search);
      await fetchMessages(data.contact.id);
      setShowAssignmentPanel(false);
    } catch (error) {
      showApiError(error, 'Failed to update chat assignment');
    } finally {
      setAssignmentSaving(false);
    }
  };

  const showContactsPane = !activeContact;
  const { mediaItems, linkItems, docItems } = getSharedContent(messages);
  const sharedPreviewItems = [...mediaItems, ...docItems].slice(0, 4);
  const sharedTotalCount = mediaItems.length + linkItems.length + docItems.length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden xl:flex-row" onClick={() => setContextMenu(null)}>
      {/* Contacts Sidebar */}
      <div className={`${showContactsPane ? 'flex' : 'hidden'} min-h-0 w-full flex-col border-r border-gray-100 bg-white xl:flex xl:w-[320px] xl:flex-shrink-0 2xl:w-[340px]`}>
        {/* Search */}
        <div className="shrink-0 border-b border-gray-100 p-3">
          <div className="relative">
            <IoSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
            <input
              type="text" placeholder="Search contacts..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 rounded-xl text-sm outline-none focus:bg-gray-100 transition-colors"
            />
          </div>
        </div>

        {/* Contact List */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <IoChatbubbles className="text-2xl text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 font-medium">No chats yet</p>
              <p className="text-xs text-gray-400 mt-1">Chats appear after a message is sent or received</p>
            </div>
          ) : (
            contacts.map(c => {
              const isActive = activeContact?.id === c.id;

              return (
                <div
                  key={c.id} onClick={() => setActiveContact(c)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 transition-colors ${
                    isActive ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                    {getContactInitial(c)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <h3 className="font-medium text-gray-800 truncate text-sm">{getContactDisplayName(c)}</h3>
                      <span className="text-[11px] text-gray-400 flex-shrink-0 ml-2">
                        {c.lastMessageAt && formatDate(c.lastMessageAt)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{getContactPreviewText(c)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`${activeContact ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 overflow-hidden xl:flex`}>
        {activeContact ? (
          <>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {/* Chat Header */}
              <div className="shrink-0 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-5">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveContact(null)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 xl:hidden"
                    aria-label="Back to chats"
                  >
                    <IoArrowBack className="text-lg" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowContactInfo(true)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left transition-colors hover:bg-gray-50/80 sm:flex-initial sm:pr-3"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-sm font-semibold text-white">
                      {getContactInitial(activeContact)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-semibold text-gray-800">{getContactDisplayName(activeContact)}</h2>
                      <p className="truncate text-xs text-gray-500">{activeContact.phone}</p>
                    </div>
                    <IoChevronForward className="hidden text-base text-gray-300 sm:block" />
                  </button>
                  {canManageAssignments && (
                    <div className="w-full sm:ml-auto sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setShowAssignmentPanel((current) => !current)}
                        className="w-full rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 sm:w-auto"
                      >
                        {showAssignmentPanel ? 'Hide Assignment' : 'Assign Chat'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-2 pl-0 sm:pl-[3.25rem]">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    Team: {activeContact.team?.name || 'Unassigned'}
                  </span>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                    Owner: {activeContact.assignedUser?.name || 'None'}
                  </span>
                </div>

                {canManageAssignments && showAssignmentPanel && (
                  <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50/80 p-3 sm:p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Team</label>
                        <AppSelect
                          value={assignmentTeamId}
                          onChange={(value) => {
                            setAssignmentTeamId(value);
                            setAssignmentUserId('');
                          }}
                          options={teamOptions}
                          placeholder="Select team"
                          disabled={assignmentSaving}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Primary Member</label>
                        <AppSelect
                          value={assignmentUserId}
                          onChange={setAssignmentUserId}
                          options={memberOptions}
                          placeholder={assignmentTeamId ? 'Select member' : 'Choose team first'}
                          disabled={assignmentSaving || !assignmentTeamId}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={saveAssignment}
                        disabled={assignmentSaving}
                        className="w-full rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover disabled:opacity-60 sm:w-auto"
                      >
                        {assignmentSaving ? 'Saving...' : 'Save Assignment'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-chat-bg p-3 sm:p-4">
                {accountNeedsReconnect && (
                  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <IoWarning className="mt-0.5 flex-shrink-0 text-lg text-amber-500" />
                        <div>
                          <p className="font-semibold">WhatsApp account needs reconnect</p>
                          <p className="mt-1 text-xs text-amber-700">The access token expired, so sending is disabled until you reconnect with a fresh permanent token.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate('/settings')}
                        className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
                      >
                        Open Settings
                      </button>
                    </div>
                  </div>
                )}
                {messagesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="max-w-sm text-center px-6">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/80 shadow-sm flex items-center justify-center">
                        <IoChatbubbles className="text-2xl text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-700">No messages yet</h3>
                      <p className="text-sm text-gray-500 mt-2">
                        This contact does not have a conversation history yet. Send the first message to start the chat.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {messages.map(m => (
                      <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`${getMessageBubbleClass(m)} group relative cursor-pointer rounded-xl px-3 py-2 text-sm shadow-sm ${
                            m.direction === 'outbound' ? 'rounded-tr-sm bg-chat-outbound' : 'rounded-tl-sm bg-chat-inbound'
                          }`}
                          onContextMenu={(e) => handleContextMenu(e, m)}
                        >
                          {m.metadata?.autoReply && (
                            <span className="mb-1 inline-block rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">Auto Reply</span>
                          )}
                          {m.direction === 'outbound' && getMessageSenderSummary(m) && (
                            <p className="mb-1 text-[11px] font-medium text-slate-500">{getMessageSenderSummary(m)}</p>
                          )}
                          <MessageMedia message={m} />
                          {(() => {
                            const displayContent = getMessageDisplayContent(m);
                            const { text: messageText, buttons } = splitReplyContent(displayContent);
                            return (
                              <>
                                <MessageText text={messageText} />
                                {m.direction === 'outbound' && buttons.length > 0 && (
                                  <div className="mt-3 flex flex-col gap-2">
                                    {buttons.map((option) => (
                                      <button
                                        key={option}
                                        type="button"
                                        onClick={() => handleQuickSend(option)}
                                        className="w-full rounded-xl border border-emerald-200 bg-white/90 px-3 py-2 text-left text-sm font-semibold text-emerald-700 shadow-sm transition-all hover:border-emerald-300 hover:bg-white"
                                      >
                                        {option}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          <div className="mt-1 flex items-center justify-end gap-1">
                            <span className="text-[10px] text-gray-500">{formatTime(m.createdAt)}</span>
                            {m.direction === 'outbound' && <StatusIcon status={m.status} />}
                          </div>
                          {getMessageFailureText(m) && (
                            <p className="mt-2 max-w-sm border-t border-red-200/70 pt-2 text-xs leading-5 text-red-600">
                              {getMessageFailureText(m)}
                            </p>
                          )}
                          <div className="absolute right-1 top-1 flex gap-0.5 opacity-100 transition-opacity xl:opacity-0 xl:group-hover:opacity-100">
                            <button onClick={() => handleCopy(m.content)} className="flex h-6 w-6 items-center justify-center rounded bg-white/90 shadow-sm hover:bg-gray-100" title="Copy">
                              <IoCopy className="text-xs text-gray-500" />
                            </button>
                            <button onClick={() => handleReply(m)} className="flex h-6 w-6 items-center justify-center rounded bg-white/90 shadow-sm hover:bg-gray-100" title="Reply">
                              <IoArrowUndo className="text-xs text-gray-500" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {replyTo && (
                <div className="shrink-0 flex items-center gap-3 border-t border-gray-200 bg-gray-50 px-4 py-2">
                  <div className="flex-1 rounded-lg border-l-4 border-primary bg-white px-3 py-2">
                    <p className="text-xs text-gray-500 font-medium">{replyTo.direction === 'outbound' ? getMessageSenderDetails(replyTo) : getContactDisplayName(activeContact)}</p>
                    <p className="text-sm text-gray-700 truncate">{replyTo.content}</p>
                  </div>
                  <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600">
                    <IoClose />
                  </button>
                </div>
              )}

              {showQuickReplies && quickReplies.length > 0 && (
                <div className="shrink-0 max-h-48 overflow-y-auto border-t border-gray-100 bg-white shadow-lg">
                  {quickReplies.map(qr => (
                    <button key={qr.id} onClick={() => selectQuickReply(qr)}
                      className="w-full border-b border-gray-50 px-4 py-2.5 text-left transition-colors hover:bg-gray-50">
                      <div className="flex items-center gap-2">
                        <IoFlash className="text-amber-500 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">{qr.title} {qr.shortcut && <span className="text-xs text-gray-400">/{qr.shortcut}</span>}</p>
                          <p className="text-xs text-gray-500 truncate">{qr.content}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="shrink-0 flex items-center gap-2 border-t border-gray-100 bg-white px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:gap-3 sm:px-4">
                <button onClick={() => setQuickRepliesPinned((isPinned) => !isPinned)}
                  disabled={accountNeedsReconnect}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-amber-50 hover:text-amber-500 disabled:cursor-not-allowed disabled:opacity-40" title="Quick Replies">
                  <IoFlash className="text-lg" />
                </button>
                <input
                  ref={inputRef}
                  type="text" value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                  disabled={accountNeedsReconnect || isSending}
                  placeholder={accountNeedsReconnect ? 'Reconnect account in Settings to send messages' : isSending ? 'Sending...' : 'Type a message... (/ for quick replies)'}
                  className="min-w-0 flex-1 rounded-xl bg-gray-50 px-4 py-2.5 text-sm outline-none transition-colors focus:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
                />
                <button
                  onClick={handleSend} disabled={!text.trim() || accountNeedsReconnect || isSending}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm transition-all hover:bg-primary-hover disabled:opacity-40"
                >
                  <IoSend className="text-sm" />
                </button>
              </div>
            </div>

            {showContactInfo && (
              <>
                <button
                  type="button"
                  aria-label="Close contact info"
                  onClick={() => setShowContactInfo(false)}
                  className="fixed inset-0 z-30 bg-slate-900/20 xl:hidden"
                />
                <aside className="absolute inset-y-0 right-0 z-40 w-full max-w-[420px] border-l border-gray-100 bg-white shadow-2xl xl:static xl:z-0 xl:shadow-none">
                  <div className="flex h-full flex-col overflow-hidden">
                    <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-4">
                      <button
                        type="button"
                        onClick={() => setShowContactInfo(false)}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100"
                      >
                        <IoClose className="text-lg" />
                      </button>
                      <h3 className="text-base font-semibold text-gray-800">Contact info</h3>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f8fa]">
                      <div className="border-b border-gray-100 bg-white px-6 py-8 text-center">
                        <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-4xl font-semibold text-white shadow-sm">
                          {getContactInitial(activeContact)}
                        </div>
                        <h2 className="mt-5 text-[28px] font-semibold tracking-tight text-gray-900">{getContactDisplayName(activeContact)}</h2>
                        <p className="mt-1 text-base text-gray-500">{activeContact.phone}</p>
                      </div>

                      <div className="mt-3 bg-white px-5 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">About</p>
                        <p className="mt-3 text-sm leading-6 text-gray-700">
                          WhatsApp user About is not available from the current API integration.
                        </p>
                      </div>

                      <div className="mt-3 bg-white px-5 py-4">
                        <div className="mb-4 flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900">Media, links and docs</h4>
                            <p className="mt-1 text-xs text-gray-400">{sharedTotalCount} shared items</p>
                          </div>
                          <span className="text-sm font-semibold text-gray-400">{sharedTotalCount}</span>
                        </div>
                        {sharedPreviewItems.length > 0 ? (
                          <div className="grid grid-cols-4 gap-2">
                            {sharedPreviewItems.map((item) => (
                              <a
                                key={item.id}
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="group flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-gray-100"
                              >
                                {item.kind === 'image' ? (
                                  <img src={item.url} alt={item.label} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                                ) : (
                                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gray-50 p-2 text-center">
                                    {item.kind === 'video' ? (
                                      <IoVideocam className="text-2xl text-gray-400" />
                                    ) : (
                                      <IoDocument className="text-2xl text-gray-400" />
                                    )}
                                    <span className="line-clamp-2 text-[10px] font-medium text-gray-500">{item.label}</span>
                                  </div>
                                )}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400">No shared media or files yet.</p>
                        )}
                      </div>

                      <div className="mt-3 bg-white py-1">
                        <div className="flex items-center gap-3 px-5 py-4">
                          <IoNotificationsOffOutline className="text-xl text-gray-400" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900">Notification settings</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 px-5 py-4">
                          <IoTimerOutline className="text-xl text-gray-400" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900">Disappearing messages</p>
                            <p className="mt-1 text-sm text-gray-400">Off</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 px-5 py-4">
                          <IoShieldCheckmarkOutline className="text-xl text-gray-400" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900">Advanced chat privacy</p>
                            <p className="mt-1 text-sm text-gray-400">Off</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 px-5 py-4">
                          <IoLink className="mt-0.5 text-xl text-gray-400" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900">Links</p>
                            {linkItems.length > 0 ? (
                              <div className="mt-2 space-y-2">
                                {linkItems.slice(0, 3).map((item) => (
                                  <a
                                    key={item.id}
                                    href={item.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block truncate text-sm text-primary underline-offset-2 hover:underline"
                                  >
                                    {item.url}
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-1 text-sm text-gray-400">No shared links yet.</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 bg-white px-5 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Chat routing</p>
                        <div className="mt-4 space-y-3">
                          <div className="rounded-2xl bg-gray-50 px-4 py-3">
                            <p className="text-xs font-medium text-gray-400">Team</p>
                            <p className="mt-1 text-sm font-semibold text-gray-800">{activeContact.team?.name || 'Unassigned'}</p>
                          </div>
                          <div className="rounded-2xl bg-gray-50 px-4 py-3">
                            <p className="text-xs font-medium text-gray-400">Owner</p>
                            <p className="mt-1 text-sm font-semibold text-gray-800">{activeContact.assignedUser?.name || 'None'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </aside>
              </>
            )}
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-gray-50/50 text-gray-400">
            <div className="w-24 h-24 bg-gray-100 rounded-3xl flex items-center justify-center mb-6">
              <IoHappy className="text-4xl text-gray-300" />
            </div>
            <h2 className="text-xl font-semibold text-gray-600 mb-1">WhatsApp Business</h2>
            <p className="text-sm text-gray-400">Select a chat to start messaging</p>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div className="fixed bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 min-w-[160px]"
          style={{
            left: typeof window === 'undefined' ? contextMenu.x : Math.min(contextMenu.x, window.innerWidth - 176),
            top: typeof window === 'undefined' ? contextMenu.y : Math.min(contextMenu.y, window.innerHeight - 120),
          }}
          onClick={(e) => e.stopPropagation()}>
          <div className="border-b border-gray-100 px-4 py-2">
            <p className="text-[11px] font-medium text-gray-500">
              {contextMenu.message.direction === 'outbound'
                ? getMessageSenderDetails(contextMenu.message)
                : getContactDisplayName(activeContact)}
            </p>
            <p className="mt-0.5 text-[10px] text-gray-400">{formatTime(contextMenu.message.createdAt)}</p>
          </div>
          <button onClick={() => handleReply(contextMenu.message)}
            className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2.5">
            <IoArrowUndo className="text-gray-400" /> Reply
          </button>
          <button onClick={() => handleCopy(contextMenu.message.content)}
            className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2.5">
            <IoCopy className="text-gray-400" /> Copy
          </button>
        </div>
      )}
    </div>
  );
}

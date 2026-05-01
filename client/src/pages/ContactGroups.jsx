import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { IoAdd, IoTrash, IoPeople, IoCloudUpload, IoCloudDownload, IoSearch, IoPricetag, IoClose, IoCreate, IoSend, IoImage, IoVideocam, IoDocument, IoAttach, IoWarning } from 'react-icons/io5';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAccountStore from '../store/accountStore';
import useAuthStore from '../store/authStore';
import AppSelect from '../components/ui/AppSelect';
import PaginationBar from '../components/ui/PaginationBar';
import useConfirmDialog from '../hooks/useConfirmDialog';
import { showApiError } from '../utils/apiError';

/**
 * Client-side Indian mobile number validation.
 * Mirrors the server-side isValidIndianPhone logic.
 */
function isValidIndianPhone(digits) {
  if (!digits) return { valid: false, reason: 'Phone number is empty' };

  let n = digits;
  if (n.length === 13 && n.startsWith('091')) n = n.slice(1);
  if (n.length === 11 && n.startsWith('0')) n = n.slice(1);

  if (n.length === 10) {
    return /^[6-9]/.test(n)
      ? { valid: true }
      : { valid: false, reason: 'Must start with 6, 7, 8, or 9' };
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return /^[6-9]/.test(digits.slice(1))
      ? { valid: true }
      : { valid: false, reason: 'Must start with 6-9 after leading 0' };
  }
  if (n.length === 12 && n.startsWith('91')) {
    return /^[6-9]/.test(n.slice(2))
      ? { valid: true }
      : { valid: false, reason: 'Must start with 6-9 after 91' };
  }
  if (n.length < 10) return { valid: false, reason: 'Too short (need 10 digits)' };
  if (n.length === 11) return { valid: false, reason: '11 digits is invalid - use 0+10 or 91+10' };
  if (n.length > 12) return { valid: false, reason: 'Too long (max 12 digits with 91)' };
  return { valid: false, reason: 'Invalid Indian phone number' };
}

const LABEL_COLORS = ['#25D366', '#3B82F6', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const GROUP_PAGE_SIZE = 9;
const DEFAULT_CONTACT_PAGE_SIZE = 20;
const CONTACT_PAGE_SIZE_OPTIONS = [20, 40, 80, 100];

function sanitizeCsvCell(value = '') {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .trim();
}

function parseCsvLine(line = '') {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(sanitizeCsvCell(current));
      current = '';
      continue;
    }

    current += char;
  }

  values.push(sanitizeCsvCell(current));
  return values;
}

function resolveImportedPhone(row = {}) {
  return row.phone || row.contact || row.mobile || row.number || '';
}

function normalizeImportedRow(row = {}) {
  return {
    ...row,
    name: sanitizeCsvCell(row.name || ''),
    labels: sanitizeCsvCell(row.labels || ''),
    phone: sanitizeCsvCell(resolveImportedPhone(row)),
  };
}

export default function ContactGroups() {
  const { activeAccount } = useAccountStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const { confirm, confirmDialog } = useConfirmDialog();
  const [tab, setTab] = useState('contacts'); // contacts, groups, labels
  const [groups, setGroups] = useState([]);
  const [labels, setLabels] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showLabelForm, setShowLabelForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [labelForm, setLabelForm] = useState({ name: '', color: '#25D366' });
  const [importData, setImportData] = useState([]);
  const [importUpdateExisting, setImportUpdateExisting] = useState(true);
  const [importFileDuplicates, setImportFileDuplicates] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [deletingContacts, setDeletingContacts] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [editContactForm, setEditContactForm] = useState({ name: '', phone: '' });
  const [editContactPhoneError, setEditContactPhoneError] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactForm, setNewContactForm] = useState({ name: '', phone: '', labels: '' });
  const [newContactPhoneError, setNewContactPhoneError] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [showBulkMessage, setShowBulkMessage] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkCaption, setBulkCaption] = useState('');
  const [bulkMedia, setBulkMedia] = useState(null); // { file, previewUrl, type: 'image'|'video'|'document' }
  const [sendingBulkMessage, setSendingBulkMessage] = useState(false);
  const bulkMediaRef = useRef(null);
  const bulkAcceptMap = { image: '.jpg,.jpeg,.png,.gif,.webp,.bmp', video: '.mp4,.mov,.avi,.mkv,.webm', document: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv' };
  const [groupModal, setGroupModal] = useState({ open: false, group: null, contacts: [], selectedIds: [], loading: false, saving: false });
  const [groupModalTab, setGroupModalTab] = useState('select'); // 'select' | 'import'
  const [groupImportData, setGroupImportData] = useState([]);
  const [groupImportFileDups, setGroupImportFileDups] = useState(0);
  const [groupImporting, setGroupImporting] = useState(false);
  const [groupMessageModal, setGroupMessageModal] = useState({ open: false, group: null, contacts: [], loading: false, sending: false, content: '' });
  const [groupDeleteModal, setGroupDeleteModal] = useState({ open: false, group: null, moveContacts: true, deleting: false });
  const [showDeleteImpactDetails, setShowDeleteImpactDetails] = useState(false);
  const [labelModal, setLabelModal] = useState({ open: false, label: null, contacts: [], selectedIds: [], loading: false, saving: false });
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [groupPage, setGroupPage] = useState(1);
  const [contactPage, setContactPage] = useState(1);
  const [contactPageSize, setContactPageSize] = useState(DEFAULT_CONTACT_PAGE_SIZE);
  const [groupAssignmentModal, setGroupAssignmentModal] = useState({
    open: false,
    group: null,
    teamId: '',
    assignedUserId: '',
    saving: false,
  });
  const fileRef = useRef(null);
  const groupFileRef = useRef(null);
  const loadGroups = useCallback(async () => {
    if (!activeAccount?.id) {
      setGroups([]);
      return;
    }

    try { const { data } = await api.get(`/contact-groups/${activeAccount.id}`); setGroups(data.groups); } catch (error) { showApiError(error, 'Failed to load groups'); }
  }, [activeAccount]);

  const loadLabels = useCallback(async () => {
    if (!activeAccount?.id) {
      setLabels([]);
      return;
    }

    try { const { data } = await api.get(`/labels/${activeAccount.id}`); setLabels(data.labels); } catch (error) { showApiError(error, 'Failed to load labels'); }
  }, [activeAccount]);

  const loadTeamData = useCallback(async () => {
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
  }, [user?.role]);

  const loadContacts = useCallback(async () => {
    if (!activeAccount?.id) {
      setContacts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params = { search: searchQuery };
      const { data } = await api.get(`/contacts/${activeAccount.id}/search`, { params });
      const nextContacts = data.contacts || [];
      const visibleIds = new Set(nextContacts.map((contact) => contact.id));
      setContacts(nextContacts);
      setSelectedContactIds((ids) => ids.filter((id) => visibleIds.has(id)));
    } catch (error) { showApiError(error, 'Failed to load contacts'); }
    setLoading(false);
  }, [activeAccount, searchQuery]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadGroups();
      void loadLabels();
    });
  }, [loadGroups, loadLabels]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadTeamData();
    });
  }, [loadTeamData]);

  useEffect(() => {
    if (tab === 'contacts') {
      queueMicrotask(() => {
        void loadContacts();
      });
    } else {
      setSelectedContactIds([]);
    }
  }, [loadContacts, tab]);

  const createGroup = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    try { await api.post(`/contact-groups/${activeAccount.id}`, form); toast.success('Created'); setShowForm(false); setForm({ name: '', description: '' }); await loadGroups(); }
    catch (error) { showApiError(error, 'Failed to create group'); }
  };

  const removeGroup = (group) => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    setShowDeleteImpactDetails(false);
    setGroupDeleteModal({
      open: true,
      group,
      moveContacts: true,
      deleting: false,
    });
  };

  const closeGroupDeleteModal = () => {
    if (groupDeleteModal.deleting) return;
    setShowDeleteImpactDetails(false);
    setGroupDeleteModal({ open: false, group: null, moveContacts: true, deleting: false });
  };

  const confirmRemoveGroup = async () => {
    if (!groupDeleteModal.group) return;

    setGroupDeleteModal((current) => ({ ...current, deleting: true }));
    try {
      await api.delete(`/contact-groups/${groupDeleteModal.group.id}`, {
        params: { deleteContacts: !groupDeleteModal.moveContacts },
      });
      toast.success(
        groupDeleteModal.moveContacts
          ? 'Group deleted. Contacts are available in All Contacts.'
          : 'Group and contacts deleted.'
      );
      setShowDeleteImpactDetails(false);
      setGroupDeleteModal({ open: false, group: null, moveContacts: true, deleting: false });
      await loadGroups();
      if (tab === 'contacts') await loadContacts();
    } catch (error) {
      showApiError(error, 'Failed to delete group');
      setGroupDeleteModal((current) => ({ ...current, deleting: false }));
    }
  };

  const createLabel = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    try { await api.post(`/labels/${activeAccount.id}`, labelForm); toast.success('Created'); setShowLabelForm(false); setLabelForm({ name: '', color: '#25D366' }); await loadLabels(); }
    catch (error) { showApiError(error, 'Failed to create label'); }
  };

  const removeLabel = async (id) => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    const approved = await confirm({
      title: 'Delete Label',
      message: 'Delete this label permanently?',
      confirmLabel: 'Delete Label',
    });
    if (!approved) return;
    try { await api.delete(`/labels/${id}`); await loadLabels(); } catch (error) { showApiError(error, 'Failed to delete label'); }
  };

  // CSV Import
  const handleFileUpload = (e) => {
    if (!isAdmin) {
      toast.error('Admin access required to import contacts');
      e.target.value = '';
      return;
    }
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('Empty CSV'); return; }
      const headers = parseCsvLine(lines[0]).map((h) => sanitizeCsvCell(h).toLowerCase());

      // Build rows and flag within-file phone duplicates.
      const seenPhones = new Set();
      let fileDuplicateCount = 0;
      const rows = lines.slice(1).map(line => {
        const values = parseCsvLine(line);
        const row = {};
        headers.forEach((h, i) => { row[h] = sanitizeCsvCell(values[i] || ''); });
        const normalizedRow = normalizeImportedRow(row);

        // Normalise phone for dedup: strip non-digits, take last 10
        const digits = (normalizedRow.phone || '').replace(/\D/g, '');
        const canonical = digits.length > 10 ? digits.slice(-10) : digits;

        if (!digits) {
          normalizedRow._status = 'no_phone';
        } else {
          const phoneCheck = isValidIndianPhone(digits);
          if (!phoneCheck.valid) {
            normalizedRow._status = 'invalid_phone';
            normalizedRow._phoneError = phoneCheck.reason;
          } else if (seenPhones.has(canonical)) {
            normalizedRow._status = 'file_duplicate';
            fileDuplicateCount++;
          } else {
            seenPhones.add(canonical);
            normalizedRow._status = 'ok';
          }
        }
        return normalizedRow;
      });

      setImportData(rows);
      setImportFileDuplicates(fileDuplicateCount);
      setImportUpdateExisting(true);
      setShowImport(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const doImport = async () => {
    if (!isAdmin) {
      toast.error('Admin access required to import contacts');
      return;
    }
    try {
      const { data } = await api.post(`/contacts/${activeAccount.id}/import`, {
        contacts: importData,
        updateExisting: importUpdateExisting,
      });
      const parts = [`✅ ${data.imported} new`];
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      if (data.skipped > 0) parts.push(`${data.skipped} skipped`);
      if (data.invalidCount > 0) parts.push(`⚠️ ${data.invalidCount} invalid phone`);
      toast.success(parts.join(' · '));
      setShowImport(false);
      setImportData([]);
      setImportFileDuplicates(0);
      await loadContacts();
      await loadLabels();
    } catch (error) { showApiError(error, 'Import failed'); }
  };

  // CSV Export
  const doExport = async () => {
    try {
      const { data } = await api.get(`/contacts/${activeAccount.id}/export`);
      const headers = ['phone', 'name', 'waId', 'labels', 'lastMessageAt'];
      const csv = [headers.join(','), ...data.contacts.map(c => headers.map(h => `"${c[h] || ''}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `contacts_${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported');
    } catch (error) { showApiError(error, 'Export failed'); }
  };

  const downloadSampleCsv = () => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    const sampleRows = [
      ['name', 'contact'],
      ['Rahul Sharma', '9876543210'],
      ['Omkar', '9123456789'],
    ];
    const csv = sampleRows
      .map((row) => row.map((value) => `"${value}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'contacts_sample_format.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Sample CSV downloaded');
  };

  const openGroupAssignmentModal = (group) => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    setGroupAssignmentModal({
      open: true,
      group,
      teamId: group?.teamId ? String(group.teamId) : '',
      assignedUserId: group?.assignedUserId ? String(group.assignedUserId) : '',
      saving: false,
    });
  };

  const closeGroupAssignmentModal = () => {
    setGroupAssignmentModal({
      open: false,
      group: null,
      teamId: '',
      assignedUserId: '',
      saving: false,
    });
  };

  const saveGroupAssignment = async () => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    if (!groupAssignmentModal.group) return;

    setGroupAssignmentModal((current) => ({ ...current, saving: true }));
    try {
      await api.patch(`/contact-groups/${groupAssignmentModal.group.id}/assignment`, {
        teamId: groupAssignmentModal.teamId ? Number(groupAssignmentModal.teamId) : null,
        assignedUserId: groupAssignmentModal.assignedUserId ? Number(groupAssignmentModal.assignedUserId) : null,
      });
      toast.success('Group assignment updated');
      closeGroupAssignmentModal();
      await loadGroups();
    } catch (error) {
      showApiError(error, 'Failed to save group assignment');
      setGroupAssignmentModal((current) => ({ ...current, saving: false }));
    }
  };

  const memberTeamNames = useMemo(
    () => Object.fromEntries(teams.map((team) => [String(team.id), team.name])),
    [teams]
  );
  const memberAssignmentOptions = useMemo(() => [
    { value: '', label: 'No default member' },
    ...members
      .filter((member) => member.status === 'active' && member.teamId)
      .map((member) => ({
        value: String(member.id),
        label: memberTeamNames[String(member.teamId)]
          ? `${member.name} (${memberTeamNames[String(member.teamId)]})`
          : member.name,
      })),
  ], [memberTeamNames, members]);

  const totalGroupPages = Math.max(1, Math.ceil(groups.length / GROUP_PAGE_SIZE));
  const safeGroupPage = Math.min(groupPage, totalGroupPages);
  const visibleGroups = useMemo(() => {
    const startIndex = (safeGroupPage - 1) * GROUP_PAGE_SIZE;
    return groups.slice(startIndex, startIndex + GROUP_PAGE_SIZE);
  }, [groups, safeGroupPage]);

  const totalContactPages = Math.max(1, Math.ceil(contacts.length / contactPageSize));
  const safeContactPage = Math.min(contactPage, totalContactPages);
  const visibleContacts = useMemo(() => {
    const startIndex = (safeContactPage - 1) * contactPageSize;
    return contacts.slice(startIndex, startIndex + contactPageSize);
  }, [contactPageSize, contacts, safeContactPage]);
  const selectedContactCount = selectedContactIds.length;
  const allVisibleContactsSelected = visibleContacts.length > 0 && visibleContacts.every((contact) => selectedContactIds.includes(contact.id));

  const getAssignedMemberTeamId = (assignedUserId, currentTeamId = '') => {
    const selectedMember = members.find((member) => String(member.id) === String(assignedUserId));
    return selectedMember?.teamId ? String(selectedMember.teamId) : currentTeamId;
  };

  const toggleContactSelection = (contactId) => {
    setSelectedContactIds((ids) => (
      ids.includes(contactId)
        ? ids.filter((id) => id !== contactId)
        : [...ids, contactId]
    ));
  };

  const toggleAllVisibleContacts = () => {
    const visibleContactIds = visibleContacts.map((contact) => contact.id);
    if (allVisibleContactsSelected) {
      setSelectedContactIds((ids) => ids.filter((id) => !visibleContactIds.includes(id)));
      return;
    }

    setSelectedContactIds((ids) => [...new Set([...ids, ...visibleContactIds])]);
  };

  const deleteSelectedContacts = async () => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    if (selectedContactCount === 0) return;
    const label = selectedContactCount === 1 ? 'this contact' : `${selectedContactCount} contacts`;
    const approved = await confirm({
      title: 'Delete Contacts',
      message: `Delete ${label}? This will also remove the chat history.`,
      confirmLabel: 'Delete Contacts',
    });
    if (!approved) return;

    setDeletingContacts(true);
    try {
      const { data } = await api.delete(`/contacts/${activeAccount.id}`, {
        data: { contactIds: selectedContactIds },
      });
      toast.success(`Deleted ${data.deleted || selectedContactCount} contact${(data.deleted || selectedContactCount) === 1 ? '' : 's'}`);
      setSelectedContactIds([]);
      await loadContacts();
    } catch (error) {
      showApiError(error, 'Delete failed');
    }
    setDeletingContacts(false);
  };

  const deleteSingleContact = async (contact) => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    const label = contact.name || contact.phone || 'this contact';
    const approved = await confirm({
      title: 'Delete Contact',
      message: `Delete ${label}? This will also remove the chat history.`,
      confirmLabel: 'Delete Contact',
    });
    if (!approved) return;

    try {
      const { data } = await api.delete(`/contacts/${activeAccount.id}`, {
        data: { contactIds: [contact.id] },
      });
      toast.success(`Deleted ${data.deleted || 1} contact`);
      setSelectedContactIds((ids) => ids.filter((id) => id !== contact.id));
      await loadContacts();
    } catch (error) {
      showApiError(error, 'Delete failed');
    }
  };

  const openEditContact = (contact) => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    setEditingContact(contact);
    setEditContactForm({ name: contact.name || '', phone: contact.phone || '' });
    setEditContactPhoneError('');
  };

  const openAddContact = () => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    setShowAddContact(true);
    setNewContactForm({ name: '', phone: '', labels: '' });
    setNewContactPhoneError('');
  };

  const closeAddContact = () => {
    setShowAddContact(false);
    setNewContactForm({ name: '', phone: '', labels: '' });
    setNewContactPhoneError('');
  };

  const closeEditContact = () => {
    setEditingContact(null);
    setEditContactForm({ name: '', phone: '' });
    setEditContactPhoneError('');
  };

  const saveEditedContact = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    if (!editingContact) return;

    // Validate phone before submitting
    const digits = editContactForm.phone.replace(/\D/g, '');
    const phoneCheck = isValidIndianPhone(digits);
    if (!phoneCheck.valid) {
      setEditContactPhoneError(phoneCheck.reason);
      return;
    }
    setEditContactPhoneError('');

    setSavingContact(true);
    try {
      await api.put(`/contacts/${activeAccount.id}/${editingContact.id}`, editContactForm);
      toast.success('Contact updated');
      closeEditContact();
      await loadContacts();
    } catch (error) {
      showApiError(error, 'Update failed');
    }
    setSavingContact(false);
  };

  const createSingleContact = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }

    const digits = newContactForm.phone.replace(/\D/g, '');
    const phoneCheck = isValidIndianPhone(digits);
    if (!phoneCheck.valid) {
      setNewContactPhoneError(phoneCheck.reason);
      return;
    }

    setNewContactPhoneError('');
    setSavingContact(true);
    try {
      await api.post(`/contacts/${activeAccount.id}`, newContactForm);
      toast.success('Contact added');
      closeAddContact();
      await loadContacts();
      await loadLabels();
    } catch (error) {
      showApiError(error, 'Failed to add contact');
    }
    setSavingContact(false);
  };

  const handleBulkMediaSelect = (type) => {
    setBulkMedia(null);
    // update accept attribute then click
    if (bulkMediaRef.current) {
      bulkMediaRef.current.accept = bulkAcceptMap[type];
      bulkMediaRef.current.dataset.mediatype = type;
      bulkMediaRef.current.value = '';
      bulkMediaRef.current.click();
    }
  };

  const onBulkFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const type = e.target.dataset.mediatype || 'document';
    const previewUrl = URL.createObjectURL(file);
    setBulkMedia({ file, previewUrl, type });
    // Reset caption when new file picked
    setBulkCaption('');
  };

  const clearBulkMedia = () => {
    if (bulkMedia?.previewUrl) URL.revokeObjectURL(bulkMedia.previewUrl);
    setBulkMedia(null);
    setBulkCaption('');
    if (bulkMediaRef.current) bulkMediaRef.current.value = '';
  };

  const sendBulkMessage = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    const hasText = bulkMessage.trim().length > 0;
    const hasMedia = !!bulkMedia;
    if (selectedContactCount === 0 || (!hasText && !hasMedia)) return;

    setSendingBulkMessage(true);
    try {
      let payload = { contactIds: selectedContactIds };

      if (hasMedia) {
        // Step 1 — upload file to server
        const reader = new FileReader();
        const base64 = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(bulkMedia.file);
        });
        const { data: uploadData } = await api.post('/uploads/media', {
          filename: bulkMedia.file.name,
          mimeType: bulkMedia.file.type,
          contentBase64: base64,
        });
        payload = {
          ...payload,
          mediaUrl: uploadData.url,
          mediaType: bulkMedia.type,
          mediaFilename: bulkMedia.file.name,
          caption: bulkCaption.trim() || undefined,
        };
      } else {
        payload.content = bulkMessage.trim();
      }

      const { data } = await api.post(`/contacts/${activeAccount.id}/bulk-message`, payload);
      toast.success(`Sent: ${data.sentCount}, Failed: ${data.failedCount}`);
      setShowBulkMessage(false);
      setBulkMessage('');
      setBulkCaption('');
      clearBulkMedia();
      setSelectedContactIds([]);
      await loadContacts();
    } catch (error) {
      showApiError(error, 'Failed to send message');
    }
    setSendingBulkMessage(false);
  };

  const openGroupContactsModal = async (group) => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    setGroupModalTab('select');
    setGroupImportData([]);
    setGroupImportFileDups(0);
    setGroupModal({ open: true, group, contacts: [], selectedIds: [], loading: true, saving: false });
    try {
      const { data } = await api.get(`/contacts/${activeAccount.id}/search`);
      const existing = await api.get(`/contacts/${activeAccount.id}/search`, { params: { groupId: group.id } });
      const existingIds = new Set((existing.data.contacts || []).map((contact) => contact.id));
      setGroupModal({
        open: true,
        group,
        contacts: data.contacts || [],
        selectedIds: [...existingIds],
        loading: false,
        saving: false,
      });
    } catch (error) {
      showApiError(error, 'Failed to load contacts');
      setGroupModal({ open: false, group: null, contacts: [], selectedIds: [], loading: false, saving: false });
    }
  };

  const toggleGroupContactSelection = (contactId) => {
    setGroupModal((current) => ({
      ...current,
      selectedIds: current.selectedIds.includes(contactId)
        ? current.selectedIds.filter((id) => id !== contactId)
        : [...current.selectedIds, contactId],
    }));
  };

  const saveGroupContacts = async () => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    if (!groupModal.group) return;

    setGroupModal((current) => ({ ...current, saving: true }));
    try {
      await api.post(`/contact-groups/${groupModal.group.id}/contacts`, {
        contactIds: groupModal.selectedIds,
      });

      const currentGroupContacts = await api.get(`/contacts/${activeAccount.id}/search`, {
        params: { groupId: groupModal.group.id },
      });
      const currentIds = new Set((currentGroupContacts.data.contacts || []).map((contact) => contact.id));
      const removedIds = [...currentIds].filter((id) => !groupModal.selectedIds.includes(id));
      await Promise.all(
        removedIds.map((contactId) => api.delete(`/contact-groups/${groupModal.group.id}/contacts/${contactId}`))
      );

      toast.success('Group contacts updated');
      setGroupModal({ open: false, group: null, contacts: [], selectedIds: [], loading: false, saving: false });
      await loadGroups();
    } catch (error) {
      showApiError(error, 'Failed to update group contacts');
      setGroupModal((current) => ({ ...current, saving: false }));
    }
  };

  // ── Group Import CSV ──────────────────────────────────────────────────────
  const handleGroupFileUpload = (e) => {
    if (!isAdmin) {
      toast.error('Admin access required to import contacts');
      e.target.value = '';
      return;
    }
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('Empty CSV'); return; }
      const headers = parseCsvLine(lines[0]).map((h) => sanitizeCsvCell(h).toLowerCase());
      const seenPhones = new Set();
      let fileDuplicateCount = 0;
      const rows = lines.slice(1).map(line => {
        const values = parseCsvLine(line);
        const row = {};
        headers.forEach((h, i) => { row[h] = sanitizeCsvCell(values[i] || ''); });
        const normalizedRow = normalizeImportedRow(row);
        const digits = (normalizedRow.phone || '').replace(/\D/g, '');
        const canonical = digits.length > 10 ? digits.slice(-10) : digits;
        if (!digits) {
          normalizedRow._status = 'no_phone';
        } else {
          const phoneCheck = isValidIndianPhone(digits);
          if (!phoneCheck.valid) {
            normalizedRow._status = 'invalid_phone';
            normalizedRow._phoneError = phoneCheck.reason;
          } else if (seenPhones.has(canonical)) {
            normalizedRow._status = 'file_duplicate';
            fileDuplicateCount++;
          } else {
            seenPhones.add(canonical);
            normalizedRow._status = 'ok';
          }
        }
        return normalizedRow;
      });
      setGroupImportData(rows);
      setGroupImportFileDups(fileDuplicateCount);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const doGroupImport = async () => {
    if (!isAdmin) {
      toast.error('Admin access required to import contacts');
      return;
    }
    if (!groupModal.group || groupImportData.length === 0) return;
    setGroupImporting(true);
    try {
      const { data } = await api.post(`/contacts/${activeAccount.id}/import`, {
        contacts: groupImportData,
        updateExisting: true,
        groupId: groupModal.group.id,
      });
      const parts = [`✅ ${data.imported} new`];
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      if (data.skipped > 0) parts.push(`${data.skipped} skipped`);
      if (data.addedToGroup > 0) parts.push(`${data.addedToGroup} added to group`);
      toast.success(parts.join(' · '));
      setGroupImportData([]);
      setGroupImportFileDups(0);
      setGroupModal({ open: false, group: null, contacts: [], selectedIds: [], loading: false, saving: false });
      await loadGroups();
    } catch (error) {
      showApiError(error, 'Import failed');
    }
    setGroupImporting(false);
  };

  const sendGroupMessage = async (e) => {
    e.preventDefault();
    if (!groupMessageModal.group || !groupMessageModal.content.trim()) return;

    const contactIds = groupMessageModal.contacts.map((contact) => contact.id);
    if (contactIds.length === 0) {
      toast.error('Add contacts to this group first');
      return;
    }

    setGroupMessageModal((current) => ({ ...current, sending: true }));
    try {
      const { data } = await api.post(`/contacts/${activeAccount.id}/bulk-message`, {
        contactIds,
        content: groupMessageModal.content.trim(),
      });
      toast.success(`Sent: ${data.sentCount}, Failed: ${data.failedCount}`);
      setGroupMessageModal({ open: false, group: null, contacts: [], loading: false, sending: false, content: '' });
      await loadGroups();
    } catch (error) {
      showApiError(error, 'Failed to send group message');
      setGroupMessageModal((current) => ({ ...current, sending: false }));
    }
  };

  const openLabelContactsModal = async (label) => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    setLabelModal({ open: true, label, contacts: [], selectedIds: [], loading: true, saving: false });
    try {
      const { data } = await api.get(`/contacts/${activeAccount.id}/search`);
      const labeled = data.contacts || [];
      const selectedIds = labeled
        .filter((contact) => (contact.labels || []).some((item) => item.id === label.id))
        .map((contact) => contact.id);

      setLabelModal({
        open: true,
        label,
        contacts: data.contacts || [],
        selectedIds,
        loading: false,
        saving: false,
      });
    } catch (error) {
      showApiError(error, 'Failed to load contacts');
      setLabelModal({ open: false, label: null, contacts: [], selectedIds: [], loading: false, saving: false });
    }
  };

  const toggleLabelContactSelection = (contactId) => {
    setLabelModal((current) => ({
      ...current,
      selectedIds: current.selectedIds.includes(contactId)
        ? current.selectedIds.filter((id) => id !== contactId)
        : [...current.selectedIds, contactId],
    }));
  };

  const saveLabelContacts = async () => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    if (!labelModal.label) return;

    setLabelModal((current) => ({ ...current, saving: true }));
    try {
      await api.post(`/labels/${labelModal.label.id}/assign`, { contactIds: labelModal.selectedIds });

      const removedIds = labelModal.contacts
        .filter((contact) => (contact.labels || []).some((item) => item.id === labelModal.label.id))
        .map((contact) => contact.id)
        .filter((contactId) => !labelModal.selectedIds.includes(contactId));

      await Promise.all(
        removedIds.map((contactId) => api.delete(`/labels/${labelModal.label.id}/contacts/${contactId}`))
      );

      toast.success('Label contacts updated');
      setLabelModal({ open: false, label: null, contacts: [], selectedIds: [], loading: false, saving: false });
      await loadLabels();
      if (tab === 'contacts') await loadContacts();
    } catch (error) {
      showApiError(error, 'Failed to update label contacts');
      setLabelModal((current) => ({ ...current, saving: false }));
    }
  };

  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Contacts</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage contacts, groups, and labels</p>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
            {isAdmin && (
              <>
                <button onClick={downloadSampleCsv}
                  className="flex min-w-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-2 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto sm:px-3">
                  <IoCloudDownload /> Download Sample CSV
                </button>
                <input type="file" ref={fileRef} accept=".csv" onChange={handleFileUpload} className="hidden" />
                <button onClick={() => fileRef.current?.click()}
                  className="flex min-w-0 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-2 py-2.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 sm:w-auto sm:px-3">
                  <IoCloudUpload /> Import CSV
                </button>
              </>
            )}
            <button onClick={doExport}
              className="flex min-w-0 items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-2 py-2.5 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-100 sm:w-auto sm:px-3">
              <IoCloudDownload /> Export
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 overflow-x-auto">
          <div className="flex w-max gap-1 rounded-xl bg-gray-100 p-1">
          {[{ id: 'contacts', label: 'All Contacts', icon: IoSearch }, { id: 'groups', label: 'Groups', icon: IoPeople }, { id: 'labels', label: 'Labels', icon: IoPricetag }].map((tabItem) => {
            const TabIcon = tabItem.icon;

            return (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
              className={`flex items-center gap-2 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === tabItem.id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <TabIcon className="text-base" /> {tabItem.label}
            </button>
          )})}
          </div>
        </div>

        {/* Groups Tab */}
        {tab === 'groups' && (
          <>
            {isAdmin && (
              <div className="mb-4 flex justify-end">
                <button onClick={() => setShowForm(!showForm)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors shadow-sm shadow-primary/25 hover:bg-primary-hover sm:w-auto">
                  <IoAdd /> New Group
                </button>
              </div>
            )}

            {showForm && isAdmin && (
              <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border border-gray-100">
                <h2 className="text-lg font-semibold mb-4">New Group</h2>
                <form onSubmit={createGroup} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Group Name</label>
                    <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                    <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" placeholder="Enter group description" />
                  </div>
                  <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
                    <button type="submit" className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover shadow-sm shadow-primary/25">Create</button>
                  </div>
                </form>
              </div>
            )}

            {groups.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-20">
                <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mb-4"><IoPeople className="text-3xl text-gray-300" /></div>
                <p className="text-gray-500 font-medium">No groups yet</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {visibleGroups.map(g => (
                    <div key={g.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all group">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-emerald-100"><IoPeople className="text-lg text-primary" /></div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-gray-800">{g.name}</h3>
                            {g.description && <p className="mt-2 text-xs text-gray-500 truncate">{g.description}</p>}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                            Team: {g.team?.name || 'None'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold text-gray-800">{g.contactCount || 0}</span>
                          <span className="text-xs text-gray-400">contacts</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => openGroupContactsModal(g)}
                                className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100"
                              >
                                Add Contacts
                              </button>
                              <button
                                onClick={() => openGroupAssignmentModal(g)}
                                className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                              >
                                Assign
                              </button>
                              <button onClick={() => removeGroup(g)} className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-500">
                                <IoTrash />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <PaginationBar
                  className="mt-5"
                  page={safeGroupPage}
                  totalPages={totalGroupPages}
                  pageSize={GROUP_PAGE_SIZE}
                  totalItems={groups.length}
                  onPageChange={setGroupPage}
                />
              </>
            )}
          </>
        )}

        {/* Labels Tab */}
        {tab === 'labels' && (
          <>
            {isAdmin && (
              <div className="mb-4 flex justify-end">
                <button onClick={() => setShowLabelForm(!showLabelForm)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors shadow-sm shadow-primary/25 hover:bg-primary-hover sm:w-auto">
                  <IoAdd /> New Label
                </button>
              </div>
            )}

            {showLabelForm && isAdmin && (
              <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border border-gray-100">
                <h2 className="text-lg font-semibold mb-4">New Label</h2>
                <form onSubmit={createLabel} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Label Name</label>
                    <input type="text" value={labelForm.name} onChange={(e) => setLabelForm({ ...labelForm, name: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Color</label>
                    <div className="flex flex-wrap gap-2">
                      {LABEL_COLORS.map(c => (
                        <button key={c} type="button" onClick={() => setLabelForm({ ...labelForm, color: c })}
                          className={`w-8 h-8 rounded-lg transition-all ${labelForm.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={() => setShowLabelForm(false)} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
                    <button type="submit" className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover shadow-sm shadow-primary/25">Create</button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {labels.map(l => (
                <div key={l.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all group">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: l.color + '20' }}>
                      <IoPricetag style={{ color: l.color }} className="text-lg" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800">{l.name}</h3>
                    </div>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-gray-800">{l.contactCount || 0}</span>
                      <span className="text-xs text-gray-400">contacts</span>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openLabelContactsModal(l)}
                          className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100"
                        >
                          Add Contacts
                        </button>
                        <button onClick={() => removeLabel(l.id)} className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-500">
                          <IoTrash />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {labels.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-20">
                  <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mb-4"><IoPricetag className="text-3xl text-gray-300" /></div>
                  <p className="text-gray-500 font-medium">No labels yet</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Contacts Tab */}
        {tab === 'contacts' && (
          <>
            {/* Search */}
            <div className="mb-4">
              <div className="relative flex-1">
                <IoSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Search by name or phone..." value={searchQuery} onChange={(e) => {
                  setContactPage(1);
                  setSearchQuery(e.target.value);
                }}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
            </div>

            {/* Contact List */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="flex items-center justify-between gap-3">
                    {isAdmin && (
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={allVisibleContactsSelected}
                          disabled={visibleContacts.length === 0}
                          onChange={toggleAllVisibleContacts}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          aria-label="Select all visible contacts"
                        />
                        <span className="text-sm text-gray-500">
                          {selectedContactCount > 0 ? `${selectedContactCount} selected` : `${contacts.length} contacts`}
                        </span>
                      </div>
                    )}
                    {!isAdmin && (
                      <span className="text-sm text-gray-500">
                        {selectedContactCount > 0 ? `${selectedContactCount} selected` : `${contacts.length} contacts`}
                      </span>
                    )}
                    {isAdmin && (
                      <button
                        onClick={openAddContact}
                        className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 sm:hidden"
                      >
                        <IoAdd /> Add
                      </button>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        onClick={openAddContact}
                        className="hidden items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 sm:flex sm:w-auto"
                      >
                        <IoAdd /> Add Contact
                      </button>
                      {selectedContactCount > 0 && (
                        <button
                          onClick={deleteSelectedContacts}
                          disabled={deletingContacts}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 sm:w-auto"
                        >
                          <IoTrash /> {deletingContacts ? 'Deleting...' : 'Delete Selected'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {contacts.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 text-sm">No contacts found</div>
                ) : (
                  <>
                    <div className="space-y-3 p-3 sm:space-y-0 sm:p-0 sm:divide-y sm:divide-gray-50">
                    {visibleContacts.map((c) => {
                      const contactLabel = c.name || c.phone;
                      const selected = selectedContactIds.includes(c.id);
                      const showPhoneMeta = Boolean(c.phone && c.name && c.name !== c.phone);

                      return (
                        <div key={c.id} className="transition-all">
                          <div
                            className={`rounded-[26px] border px-4 py-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.45)] sm:hidden ${
                              selected
                                ? 'border-primary/25 bg-primary/[0.07]'
                                : 'border-gray-100 bg-gradient-to-br from-white via-white to-slate-50'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex min-w-0 flex-1 items-start gap-3">
                                {isAdmin && (
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => toggleContactSelection(c.id)}
                                    className="mt-2 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                    aria-label={`Select ${contactLabel}`}
                                  />
                                )}
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-emerald-600 text-sm font-semibold text-white shadow-sm">
                                  {contactLabel?.[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1 pt-0.5">
                                  <p className="truncate text-sm font-semibold text-slate-800">{contactLabel}</p>
                                  {showPhoneMeta && (
                                    <p className="mt-1 truncate text-xs font-medium text-slate-500">{c.phone}</p>
                                  )}
                                </div>
                              </div>
                              {isAdmin && (
                                <div className="ml-2 flex shrink-0 items-center gap-2 rounded-2xl bg-white/90 p-1.5 shadow-sm ring-1 ring-slate-100">
                                  <button
                                    type="button"
                                    onClick={() => openEditContact(c)}
                                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100"
                                    title="Edit contact"
                                    aria-label={`Edit ${contactLabel}`}
                                  >
                                    <IoCreate />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteSingleContact(c)}
                                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-500 transition-colors hover:bg-red-100"
                                    title="Delete contact"
                                    aria-label={`Delete ${contactLabel}`}
                                  >
                                    <IoTrash />
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {!showPhoneMeta && c.phone && (
                                <span className="inline-flex rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary">
                                  {c.phone}
                                </span>
                              )}
                            </div>

                            {c.labels?.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {c.labels.map((l) => (
                                  <span
                                    key={l.id}
                                    className="rounded-full px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm"
                                    style={{ backgroundColor: l.color }}
                                  >
                                    {l.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className={`hidden flex-col gap-3 px-4 py-4 transition-colors sm:flex sm:flex-row sm:items-center sm:px-5 sm:py-3 ${selected ? 'bg-primary/5' : 'hover:bg-gray-50'}`}>
                            <div className="flex items-center gap-3">
                              {isAdmin && (
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleContactSelection(c.id)}
                                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                  aria-label={`Select ${contactLabel}`}
                                />
                              )}
                              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-sm font-semibold text-white">
                                {contactLabel?.[0]?.toUpperCase()}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-800">{contactLabel}</p>
                                  {showPhoneMeta && <p className="text-xs text-gray-500">{c.phone}</p>}
                                </div>
                                <div className="flex flex-wrap gap-1 sm:max-w-[40%] sm:justify-end">
                                  {c.labels?.map((l) => (
                                    <span key={l.id} className="rounded-md px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: l.color }}>
                                      {l.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                            {isAdmin && (
                              <div className="hidden items-center gap-2 sm:flex">
                                <button
                                  type="button"
                                  onClick={() => openEditContact(c)}
                                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 shadow-sm transition-colors hover:bg-blue-100"
                                  title="Edit contact"
                                  aria-label={`Edit ${contactLabel}`}
                                >
                                  <IoCreate />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteSingleContact(c)}
                                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500 shadow-sm transition-colors hover:bg-red-100"
                                  title="Delete contact"
                                  aria-label={`Delete ${contactLabel}`}
                                >
                                  <IoTrash />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    </div>
                    <PaginationBar
                      className="px-4 py-4 sm:px-5"
                      page={safeContactPage}
                      totalPages={totalContactPages}
                      pageSize={contactPageSize}
                      totalItems={contacts.length}
                      onPageChange={setContactPage}
                      pageSizeOptions={CONTACT_PAGE_SIZE_OPTIONS}
                      onPageSizeChange={(size) => {
                        setContactPageSize(size || DEFAULT_CONTACT_PAGE_SIZE);
                        setContactPage(1);
                      }}
                    />
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Import Modal */}
        {showImport && isAdmin && (() => {
          const validRows = importData.filter(r => r._status === 'ok');
          return (
          <div className="app-modal-overlay z-50 bg-black/50" onClick={() => setShowImport(false)}>
            <div className="app-modal-scroll-panel max-w-2xl" onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold">Import Preview</h2>
                <button onClick={() => setShowImport(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><IoClose /></button>
              </div>

              {/* Summary bar */}
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                  ✅ {validRows.length} will be imported
                </span>
                {importFileDuplicates > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                    ⚠️ {importFileDuplicates} duplicate{importFileDuplicates > 1 ? 's' : ''} in file — will be skipped
                  </span>
                )}
                {importData.filter(r => r._status === 'invalid_phone').length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-600">
                    <IoWarning /> {importData.filter(r => r._status === 'invalid_phone').length} invalid phone — will be skipped
                  </span>
                )}
                {importData.filter(r => r._status === 'no_phone').length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600">
                    🔴 {importData.filter(r => r._status === 'no_phone').length} missing phone — will be skipped
                  </span>
                )}
              </div>

              {/* Import Mode Toggle */}
              <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">When a contact already exists in the database</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className={`flex flex-1 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    importUpdateExisting ? 'border-primary/40 bg-white shadow-sm' : 'border-gray-200 bg-gray-50 hover:bg-white'
                  }`}>
                    <input type="radio" name="importMode" checked={importUpdateExisting} onChange={() => setImportUpdateExisting(true)} className="mt-0.5 accent-primary" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Update name if different</p>
                      <p className="text-xs text-gray-500">Labels from file will also be applied</p>
                    </div>
                  </label>
                  <label className={`flex flex-1 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    !importUpdateExisting ? 'border-primary/40 bg-white shadow-sm' : 'border-gray-200 bg-gray-50 hover:bg-white'
                  }`}>
                    <input type="radio" name="importMode" checked={!importUpdateExisting} onChange={() => setImportUpdateExisting(false)} className="mt-0.5 accent-primary" />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Skip — leave unchanged</p>
                      <p className="text-xs text-gray-500">Existing contacts will not be modified</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Preview Table */}
              <div className="mb-4 max-h-52 overflow-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Phone</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Name</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Labels</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {importData.slice(0, 50).map((r, i) => (
                      <tr key={i} className={r._status !== 'ok' ? 'opacity-50' : ''}>
                        <td className="px-4 py-2 text-gray-800">{r.phone || <span className="italic text-gray-400">—</span>}</td>
                        <td className="px-4 py-2 text-gray-600">{r.name}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{r.labels}</td>
                        <td className="px-4 py-2">
                          {r._status === 'ok' && <span className="text-xs text-emerald-600 font-medium">Ready</span>}
                          {r._status === 'file_duplicate' && <span className="text-xs text-amber-600 font-medium">⚠ Duplicate</span>}
                          {r._status === 'invalid_phone' && <span className="text-xs text-orange-500 font-medium" title={r._phoneError}>⚠ Invalid phone</span>}
                          {r._status === 'no_phone' && <span className="text-xs text-red-500 font-medium">🔴 No phone</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importData.length > 50 && (
                <p className="mb-3 text-center text-xs text-gray-400">Showing first 50 of {importData.length} rows</p>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button onClick={() => setShowImport(false)} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button
                  onClick={doImport}
                  disabled={validRows.length === 0}
                  className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover shadow-sm shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Import {validRows.length} Contact{validRows.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {groupAssignmentModal.open && isAdmin && (
          <div
            className="app-modal-overlay z-50 bg-black/50"
            onClick={() => !groupAssignmentModal.saving && closeGroupAssignmentModal()}
          >
            <div
              className="app-modal-panel max-w-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Default Assignment</h2>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {groupAssignmentModal.group?.name} chats will follow this default member assignment.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeGroupAssignmentModal}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                >
                  <IoClose />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Default Member</label>
                  <AppSelect
                    value={groupAssignmentModal.assignedUserId}
                    onChange={(value) => setGroupAssignmentModal((current) => ({
                      ...current,
                      teamId: getAssignedMemberTeamId(value, current.teamId),
                      assignedUserId: value,
                    }))}
                    options={memberAssignmentOptions}
                    placeholder="Select member"
                    disabled={groupAssignmentModal.saving}
                  />
                  <p className="mt-1.5 text-xs text-gray-400">
                    Choosing a default member also links the group to that member&apos;s team automatically.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeGroupAssignmentModal}
                  className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveGroupAssignment}
                  disabled={groupAssignmentModal.saving}
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 hover:bg-primary-hover disabled:opacity-60"
                >
                  {groupAssignmentModal.saving ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {groupModal.open && isAdmin && (() => {
          const closeGroupModal = () => !groupModal.saving && !groupImporting && setGroupModal({ open: false, group: null, contacts: [], selectedIds: [], loading: false, saving: false });
          const groupValidRows = groupImportData.filter(r => r._status === 'ok');
          return (
          <div className="app-modal-overlay z-50 bg-black/50" onClick={closeGroupModal}>
            <div className="app-modal-scroll-panel max-w-2xl" onClick={(e) => e.stopPropagation()}>

              {/* Header */}
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">{groupModal.group?.name}</h2>
                  <p className="mt-0.5 text-sm text-gray-500">Add contacts to this group</p>
                </div>
                <button onClick={closeGroupModal} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"><IoClose /></button>
              </div>

              {/* Tabs */}
              <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1">
                <button
                  onClick={() => setGroupModalTab('select')}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${groupModalTab === 'select' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Select Existing
                </button>
                <button
                  onClick={() => setGroupModalTab('import')}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${groupModalTab === 'import' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Import CSV
                </button>
              </div>

              {/* ── Tab: Select Existing ── */}
              {groupModalTab === 'select' && (
                <>
                  {groupModal.loading ? (
                    <div className="flex items-center justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
                  ) : (
                    <>
                      <div className="mb-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                        {groupModal.selectedIds.length} contact{groupModal.selectedIds.length === 1 ? '' : 's'} selected
                      </div>
                      <div className="max-h-80 space-y-2 overflow-y-auto">
                        {groupModal.contacts.map((contact) => (
                          <button
                            key={contact.id}
                            type="button"
                            onClick={() => toggleGroupContactSelection(contact.id)}
                            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                              groupModal.selectedIds.includes(contact.id)
                                ? 'border-primary/30 bg-primary/5'
                                : 'border-gray-200 bg-white hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              readOnly
                              checked={groupModal.selectedIds.includes(contact.id)}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-sm font-semibold text-white">
                              {(contact.name || contact.phone)?.[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-800">{contact.name || contact.phone}</p>
                              <p className="text-sm text-gray-500">{contact.phone}</p>
                            </div>
                          </button>
                        ))}
                        {groupModal.contacts.length === 0 && (
                          <div className="py-10 text-center text-sm text-gray-400">No contacts available</div>
                        )}
                      </div>
                      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button type="button" onClick={closeGroupModal} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
                        <button type="button" onClick={saveGroupContacts} disabled={groupModal.loading || groupModal.saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 hover:bg-primary-hover disabled:opacity-60">
                          {groupModal.saving ? 'Saving...' : 'Save Group Contacts'}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Tab: Import CSV ── */}
              {groupModalTab === 'import' && (
                <>
                  <input type="file" ref={groupFileRef} accept=".csv" onChange={handleGroupFileUpload} className="hidden" />

                  {groupImportData.length === 0 ? (
                    /* Drop zone / upload prompt */
                    <div
                      onClick={() => groupFileRef.current?.click()}
                      className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 py-14 transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                        <IoCloudUpload className="text-2xl text-primary" />
                      </div>
                      <div className="text-center">
                        <p className="font-medium text-gray-700">Click to select a CSV file</p>
                        <p className="mt-1 text-xs text-gray-400">Required column: <span className="font-mono">phone</span> · Optional: <span className="font-mono">name</span>, <span className="font-mono">labels</span></p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Summary badges */}
                      <div className="mb-3 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                          ✅ {groupValidRows.length} ready
                        </span>
                        {groupImportFileDups > 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                            ⚠️ {groupImportFileDups} duplicate{groupImportFileDups > 1 ? 's' : ''} in file
                          </span>
                        )}
                        {groupImportData.filter(r => r._status === 'invalid_phone').length > 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-600">
                            <IoWarning /> {groupImportData.filter(r => r._status === 'invalid_phone').length} invalid phone
                          </span>
                        )}
                        {groupImportData.filter(r => r._status === 'no_phone').length > 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600">
                            🔴 {groupImportData.filter(r => r._status === 'no_phone').length} missing phone
                          </span>
                        )}
                        <button
                          onClick={() => { setGroupImportData([]); setGroupImportFileDups(0); }}
                          className="ml-auto text-xs text-gray-400 underline hover:text-gray-600"
                        >
                          Clear
                        </button>
                      </div>

                      {/* Preview table */}
                      <div className="mb-4 max-h-52 overflow-auto rounded-xl border border-gray-200">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left font-medium text-gray-600">Phone</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-600">Name</th>
                              <th className="px-4 py-2 text-left font-medium text-gray-600">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {groupImportData.slice(0, 50).map((r, i) => (
                              <tr key={i} className={r._status !== 'ok' ? 'opacity-50' : ''}>
                                <td className="px-4 py-2 text-gray-800">{r.phone || <span className="italic text-gray-400">—</span>}</td>
                                <td className="px-4 py-2 text-gray-600">{r.name}</td>
                                <td className="px-4 py-2">
                                  {r._status === 'ok' && <span className="text-xs font-medium text-emerald-600">Ready</span>}
                                  {r._status === 'file_duplicate' && <span className="text-xs font-medium text-amber-600">⚠ Duplicate</span>}
                                  {r._status === 'invalid_phone' && <span className="text-xs font-medium text-orange-500" title={r._phoneError}>⚠ Invalid phone</span>}
                                  {r._status === 'no_phone' && <span className="text-xs font-medium text-red-500">🔴 No phone</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {groupImportData.length > 50 && (
                        <p className="mb-3 text-center text-xs text-gray-400">Showing first 50 of {groupImportData.length} rows</p>
                      )}

                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button onClick={() => groupFileRef.current?.click()} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium hover:bg-gray-50">
                          Choose Different File
                        </button>
                        <button
                          onClick={doGroupImport}
                          disabled={groupValidRows.length === 0 || groupImporting}
                          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {groupImporting ? 'Importing...' : `Import & Add ${groupValidRows.length} to Group`}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

            </div>
          </div>
          );
        })()}



        {groupMessageModal.open && (
          <div className="app-modal-overlay z-50 bg-black/50" onClick={() => !groupMessageModal.sending && setGroupMessageModal({ open: false, group: null, contacts: [], loading: false, sending: false, content: '' })}>
            <div className="app-modal-scroll-panel max-w-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">{`Send to ${groupMessageModal.group?.name}`}</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {groupMessageModal.loading ? 'Loading contacts...' : `${groupMessageModal.contacts.length} contact${groupMessageModal.contacts.length === 1 ? '' : 's'} will receive this message`}
                  </p>
                </div>
                <button onClick={() => !groupMessageModal.sending && setGroupMessageModal({ open: false, group: null, contacts: [], loading: false, sending: false, content: '' })} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"><IoClose /></button>
              </div>
              <form onSubmit={sendGroupMessage} className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  {groupMessageModal.contacts.slice(0, 5).map((contact) => contact.name || contact.phone).join(', ')}
                  {groupMessageModal.contacts.length > 5 ? ` +${groupMessageModal.contacts.length - 5} more` : ''}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Message</label>
                  <textarea
                    value={groupMessageModal.content}
                    onChange={(e) => setGroupMessageModal((current) => ({ ...current, content: e.target.value }))}
                    rows={5}
                    className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Type the message for this group..."
                    required
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => !groupMessageModal.sending && setGroupMessageModal({ open: false, group: null, contacts: [], loading: false, sending: false, content: '' })} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={groupMessageModal.loading || groupMessageModal.sending || groupMessageModal.contacts.length === 0} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 hover:bg-primary-hover disabled:opacity-60">
                    {groupMessageModal.sending ? 'Sending...' : 'Send Group Message'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {labelModal.open && isAdmin && (
          <div className="app-modal-overlay z-50 bg-black/50" onClick={() => !labelModal.saving && setLabelModal({ open: false, label: null, contacts: [], selectedIds: [], loading: false, saving: false })}>
            <div className="app-modal-scroll-panel max-w-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">{labelModal.label?.name}</h2>
                  <p className="mt-1 text-sm text-gray-500">Select contacts for this label</p>
                </div>
                <button onClick={() => !labelModal.saving && setLabelModal({ open: false, label: null, contacts: [], selectedIds: [], loading: false, saving: false })} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"><IoClose /></button>
              </div>
              {labelModal.loading ? (
                <div className="flex items-center justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
              ) : (
                <>
                  <div className="mb-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                    {labelModal.selectedIds.length} contact{labelModal.selectedIds.length === 1 ? '' : 's'} selected
                  </div>
                  <div className="max-h-96 space-y-2 overflow-y-auto">
                    {labelModal.contacts.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => toggleLabelContactSelection(contact.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                          labelModal.selectedIds.includes(contact.id)
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={labelModal.selectedIds.includes(contact.id)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-sm font-semibold text-white">
                          {(contact.name || contact.phone)?.[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-800">{contact.name || contact.phone}</p>
                          <p className="text-sm text-gray-500">{contact.phone}</p>
                        </div>
                      </button>
                    ))}
                    {labelModal.contacts.length === 0 && (
                      <div className="py-10 text-center text-sm text-gray-400">No contacts available</div>
                    )}
                  </div>
                </>
              )}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => !labelModal.saving && setLabelModal({ open: false, label: null, contacts: [], selectedIds: [], loading: false, saving: false })} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="button" onClick={saveLabelContacts} disabled={labelModal.loading || labelModal.saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 hover:bg-primary-hover disabled:opacity-60">
                  {labelModal.saving ? 'Saving...' : 'Save Label Contacts'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Contact Modal */}
        {showAddContact && (
          <div className="app-modal-overlay z-50 bg-black/50" onClick={closeAddContact}>
            <div className="app-modal-scroll-panel max-w-[22rem] sm:max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800">Add Contact</h2>
                <button onClick={closeAddContact} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100">
                  <IoClose />
                </button>
              </div>
              <form onSubmit={createSingleContact} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    value={newContactForm.name}
                    onChange={(e) => setNewContactForm({ ...newContactForm, name: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Enter contact name"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newContactForm.phone}
                    onKeyDown={(e) => {
                      const allowed = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
                      if (allowed.includes(e.key)) return;
                      if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) return;
                      if (!/^[0-9]$/.test(e.key)) e.preventDefault();
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '');
                      const input = e.target;
                      const start = input.selectionStart;
                      const end = input.selectionEnd;
                      const current = newContactForm.phone;
                      const next = current.slice(0, start) + pasted + current.slice(end);
                      setNewContactForm({ ...newContactForm, phone: next });
                      if (next.length >= 10) {
                        const check = isValidIndianPhone(next);
                        setNewContactPhoneError(check.valid ? '' : check.reason);
                      } else if (next.length > 0) {
                        setNewContactPhoneError('Too short (need 10 digits)');
                      } else {
                        setNewContactPhoneError('');
                      }
                      requestAnimationFrame(() => { input.setSelectionRange(start + pasted.length, start + pasted.length); });
                    }}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      setNewContactForm({ ...newContactForm, phone: digits });
                      if (digits.length >= 10) {
                        const check = isValidIndianPhone(digits);
                        setNewContactPhoneError(check.valid ? '' : check.reason);
                      } else if (digits.length > 0) {
                        setNewContactPhoneError('Too short (need 10 digits)');
                      } else {
                        setNewContactPhoneError('');
                      }
                    }}
                    maxLength={12}
                    className={`w-full rounded-xl border bg-gray-50 px-3 py-2.5 text-sm outline-none transition-colors ${
                      newContactPhoneError
                        ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                        : 'border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20'
                    }`}
                    placeholder="Enter mobile number"
                    required
                  />
                  {newContactPhoneError && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
                      <IoWarning className="flex-shrink-0" /> {newContactPhoneError}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Labels</label>
                  <input
                    type="text"
                    value={newContactForm.labels}
                    onChange={(e) => setNewContactForm({ ...newContactForm, labels: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Enter labels separated by commas"
                  />
                  <p className="mt-1 text-xs text-gray-400">Optional. Separate multiple labels with commas.</p>
                </div>
                <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeAddContact} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={savingContact || !!newContactPhoneError} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 hover:bg-primary-hover disabled:opacity-50">
                    {savingContact ? 'Adding...' : 'Add Contact'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Contact Modal */}
        {editingContact && (
          <div className="app-modal-overlay z-50 bg-black/50" onClick={closeEditContact}>
            <div className="app-modal-scroll-panel max-w-[22rem] sm:max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800">Edit Contact</h2>
                <button onClick={closeEditContact} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100">
                  <IoClose />
                </button>
              </div>
               <form onSubmit={saveEditedContact} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    value={editContactForm.name}
                    onChange={(e) => setEditContactForm({ ...editContactForm, name: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Enter contact name"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={editContactForm.phone}
                    onKeyDown={(e) => {
                      // Allow: backspace, delete, tab, escape, enter, arrows, home, end
                      const allowed = ['Backspace','Delete','Tab','Escape','Enter','ArrowLeft','ArrowRight','Home','End'];
                      if (allowed.includes(e.key)) return;
                      // Allow Ctrl/Cmd+A, C, V, X
                      if ((e.ctrlKey || e.metaKey) && ['a','c','v','x'].includes(e.key.toLowerCase())) return;
                      // Block anything that is not a digit
                      if (!/^[0-9]$/.test(e.key)) e.preventDefault();
                    }}
                    onPaste={(e) => {
                      // Strip non-digits from pasted content
                      e.preventDefault();
                      const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '');
                      const input = e.target;
                      const start = input.selectionStart;
                      const end = input.selectionEnd;
                      const current = editContactForm.phone;
                      const next = current.slice(0, start) + pasted + current.slice(end);
                      setEditContactForm({ ...editContactForm, phone: next });
                      // Validate pasted result
                      if (next.length >= 10) {
                        const check = isValidIndianPhone(next);
                        setEditContactPhoneError(check.valid ? '' : check.reason);
                      } else if (next.length > 0) {
                        setEditContactPhoneError('Too short (need 10 digits)');
                      } else {
                        setEditContactPhoneError('');
                      }
                      // Restore cursor position after React re-render
                      requestAnimationFrame(() => { input.setSelectionRange(start + pasted.length, start + pasted.length); });
                    }}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      setEditContactForm({ ...editContactForm, phone: digits });
                      // Live validation as user types
                      if (digits.length >= 10) {
                        const check = isValidIndianPhone(digits);
                        setEditContactPhoneError(check.valid ? '' : check.reason);
                      } else if (digits.length > 0) {
                        setEditContactPhoneError('Too short (need 10 digits)');
                      } else {
                        setEditContactPhoneError('');
                      }
                    }}
                    maxLength={12}
                    className={`w-full rounded-xl border bg-gray-50 px-3 py-2.5 text-sm outline-none transition-colors ${
                      editContactPhoneError
                        ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                        : 'border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20'
                    }`}
                    placeholder="Enter mobile number"
                    required
                  />
                  {editContactPhoneError && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
                      <IoWarning className="flex-shrink-0" /> {editContactPhoneError}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    Valid: 10 digits, 0 + 10 digits, or 91 + 10 digits (e.g. 9876543210, 09876543210, 919876543210)
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeEditContact} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={savingContact || !!editContactPhoneError} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 hover:bg-primary-hover disabled:opacity-50">
                    {savingContact ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Bulk Message Modal */}
        {showBulkMessage && isAdmin && (() => {
          const hasText = bulkMessage.trim().length > 0;
          const hasMedia = !!bulkMedia;
          const canSend = (hasText || hasMedia) && !sendingBulkMessage;
          return (
          <div className="app-modal-overlay z-50 bg-black/50" onClick={() => { if (!sendingBulkMessage) setShowBulkMessage(false); }}>
            <div className="app-modal-scroll-panel max-w-lg" onClick={(e) => e.stopPropagation()}>

              {/* Header */}
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Send Message</h2>
                  <p className="mt-0.5 text-sm text-gray-500">{selectedContactCount} selected contact{selectedContactCount === 1 ? '' : 's'}</p>
                </div>
                <button onClick={() => { if (!sendingBulkMessage) setShowBulkMessage(false); }} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100">
                  <IoClose />
                </button>
              </div>

              {/* Hidden file input */}
              <input ref={bulkMediaRef} type="file" className="hidden" onChange={onBulkFileChange} />

              <form onSubmit={sendBulkMessage} className="space-y-4">

                {/* Media attachment buttons */}
                {!bulkMedia && (
                  <div className="flex gap-2">
                    {[{ type: 'image', icon: <IoImage />, label: 'Image' },
                      { type: 'video', icon: <IoVideocam />, label: 'Video' },
                      { type: 'document', icon: <IoDocument />, label: 'PDF / Doc' }].map(({ type, icon, label }) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleBulkMediaSelect(type)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-xs font-medium text-gray-600 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                      >
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Media preview */}
                {bulkMedia && (
                  <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={clearBulkMedia}
                      className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm hover:bg-red-50 hover:text-red-500"
                    >
                      <IoClose className="text-sm" />
                    </button>

                    {bulkMedia.type === 'image' && (
                      <img src={bulkMedia.previewUrl} alt="preview" className="max-h-48 w-full object-contain" />
                    )}
                    {bulkMedia.type === 'video' && (
                      <video src={bulkMedia.previewUrl} controls className="max-h-48 w-full" />
                    )}
                    {bulkMedia.type === 'document' && (
                      <div className="flex items-center gap-3 px-4 py-4">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                          <IoDocument className="text-xl text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-800">{bulkMedia.file.name}</p>
                          <p className="text-xs text-gray-500">{(bulkMedia.file.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                    )}

                    {/* Caption field for media */}
                    <div className="border-t border-gray-200 px-3 py-2">
                      <input
                        type="text"
                        value={bulkCaption}
                        onChange={(e) => setBulkCaption(e.target.value)}
                        placeholder="Enter caption (optional)"
                        className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
                      />
                    </div>
                  </div>
                )}

                {/* Text message — shown when no media is attached */}
                {!bulkMedia && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Message</label>
                    <textarea
                      value={bulkMessage}
                      onChange={(e) => setBulkMessage(e.target.value)}
                      className="h-32 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="Enter message"
                      maxLength={4096}
                    />
                    <p className="mt-1 text-xs text-gray-400">{bulkMessage.length}/4096 characters</p>
                  </div>
                )}

                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-700">
                  WhatsApp may only allow free-form messages inside the 24-hour customer service window. For cold/bulk outreach, use approved templates.
                </div>

                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => { if (!sendingBulkMessage) setShowBulkMessage(false); }} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
                  <button
                    type="submit"
                    disabled={!canSend}
                    className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 hover:bg-primary-hover disabled:opacity-50"
                  >
                    <IoSend /> {sendingBulkMessage ? (bulkMedia ? 'Uploading & Sending...' : 'Sending...') : 'Send to Selected'}
                  </button>
                </div>
              </form>
            </div>
          </div>
          );
        })()}
        {groupDeleteModal.open && (
          <div
            className="app-modal-overlay z-50 bg-black/50"
            onClick={closeGroupDeleteModal}
          >
            <div
              className="app-modal-panel max-w-[22rem] sm:max-w-md"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500">
                    <IoTrash className="text-xl" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Delete Group</h2>
                    <p className="text-sm text-gray-500">{groupDeleteModal.group?.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeGroupDeleteModal}
                  disabled={groupDeleteModal.deleting}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                >
                  <IoClose />
                </button>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                  Choose what should happen to contacts in this group before deleting it.
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5">
                  <input
                    type="checkbox"
                    checked={groupDeleteModal.moveContacts}
                    disabled={groupDeleteModal.deleting}
                    onChange={(event) => {
                      const moveContacts = event.target.checked;
                      setGroupDeleteModal((current) => ({
                        ...current,
                        moveContacts,
                      }));
                      if (moveContacts) setShowDeleteImpactDetails(false);
                    }}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-gray-800">Move all contacts to All Contacts</span>
                    <span className="mt-1 block text-xs leading-5 text-gray-500">
                      {groupDeleteModal.group?.contactCount || 0} contact{(groupDeleteModal.group?.contactCount || 0) === 1 ? '' : 's'} will remain visible in the All Contacts list after this group is deleted.
                    </span>
                  </span>
                </label>

                {!groupDeleteModal.moveContacts && (
                  <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-600">
                    <p>
                      Move is unchecked, so deleting this group will also delete its contacts.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowDeleteImpactDetails((current) => !current)}
                      className="mt-2 text-sm font-semibold text-red-700 underline underline-offset-2 transition-colors hover:text-red-800"
                    >
                      {showDeleteImpactDetails ? 'Read less' : 'Read more'}
                    </button>
                    {showDeleteImpactDetails && (
                      <p className="mt-2">
                        This also removes related chat history, labels, campaign records, and flow sessions from this account.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeGroupDeleteModal}
                  disabled={groupDeleteModal.deleting}
                  className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmRemoveGroup}
                  disabled={groupDeleteModal.deleting}
                  className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-red-500/20 transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {groupDeleteModal.deleting
                    ? 'Deleting...'
                    : groupDeleteModal.moveContacts
                      ? 'Delete Group'
                      : 'Delete Group & Contacts'}
                </button>
              </div>
            </div>
          </div>
        )}
        {confirmDialog}
      </div>
    </div>
  );
}

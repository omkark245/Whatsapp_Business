import { useCallback, useEffect, useMemo, useState } from 'react';
import { IoAdd, IoRefresh, IoTrash, IoCheckmarkCircle, IoCloseCircle, IoTime, IoDocumentText, IoCreate, IoClose, IoCloudUpload, IoDocument, IoStar, IoStarOutline } from 'react-icons/io5';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAccountStore from '../store/accountStore';
import useAuthStore from '../store/authStore';
import AppSelect from '../components/ui/AppSelect';
import PaginationBar from '../components/ui/PaginationBar';
import { showApiError } from '../utils/apiError';

const statusStyles = {
  APPROVED: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  REJECTED: 'text-red-700 bg-red-50 border-red-200',
  PENDING: 'text-amber-700 bg-amber-50 border-amber-200',
};
const statusIcons = { APPROVED: IoCheckmarkCircle, REJECTED: IoCloseCircle, PENDING: IoTime };
const MAX_UPLOAD_BYTES = 35 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 40, 80, 100];
const MAX_TEMPLATE_BUTTONS = 3;
const TEMPLATE_BUTTON_TEXT_LIMIT = 25;
const buttonTypeOptions = [
  { value: 'QUICK_REPLY', label: 'Quick reply' },
  { value: 'URL', label: 'Website URL' },
];

export default function Templates() {
  const { activeAccount } = useAccountStore();
  const { user } = useAuthStore();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [favoriteTemplateIds, setFavoriteTemplateIds] = useState([]);
  const [form, setForm] = useState(getEmptyTemplateForm);

  // Edit state
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editForm, setEditForm] = useState(getEmptyEditTemplateForm);
  const [saving, setSaving] = useState(false);
  const [uploadingCreateMedia, setUploadingCreateMedia] = useState(false);
  const [uploadingEditMedia, setUploadingEditMedia] = useState(false);

  const categoryOptions = [
    { value: 'MARKETING', label: 'Marketing' },
    { value: 'UTILITY', label: 'Utility' },
    { value: 'AUTHENTICATION', label: 'Authentication' },
  ];
  const languageOptions = [
    { value: 'en_US', label: 'English (US)' },
    { value: 'en', label: 'English' },
    { value: 'hi', label: 'Hindi' },
    { value: 'mr', label: 'Marathi' },
  ];
  const headerTypeOptions = [
    { value: 'none', label: 'None' },
    { value: 'text', label: 'Text' },
    { value: 'image', label: 'Image' },
    { value: 'video', label: 'Video' },
    { value: 'document', label: 'Document' },
  ];
  const favoriteStorageKey = useMemo(
    () => getTemplateFavoritesStorageKey(user?.id, activeAccount?.id),
    [user?.id, activeAccount?.id],
  );

  const loadTemplates = useCallback(async () => {
    if (!activeAccount?.id) {
      setTemplates([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try { const { data } = await api.get(`/templates/${activeAccount.id}`); setTemplates(data.templates); } catch (error) { showApiError(error, 'Failed to load templates'); }
    setLoading(false);
  }, [activeAccount]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadTemplates();
    });
  }, [loadTemplates]);

  useEffect(() => {
    setFavoriteTemplateIds(readTemplateFavorites(favoriteStorageKey));
  }, [favoriteStorageKey]);

  const sync = async () => {
    try { const { data } = await api.post(`/templates/${activeAccount.id}/sync`); setTemplates(data.templates); toast.success(`Synced ${data.synced} templates`); } catch (error) { showApiError(error, 'Sync failed'); }
  };

  const create = async (e) => {
    e.preventDefault();
    if (form.headerType !== 'none' && form.headerType !== 'text' && !form.headerContent) {
      toast.error(`Please upload a ${form.headerType} file first`);
      return;
    }
    const buttonError = getButtonValidationError(form.buttons);
    if (buttonError) {
      toast.error(buttonError);
      return;
    }
    try {
      await api.post(`/templates/${activeAccount.id}`, {
        ...form,
        buttons: normalizeButtonsForSubmit(form.buttons),
      });
      toast.success('Template submitted to Meta');
      setShowForm(false);
      setForm(getEmptyTemplateForm());
      await loadTemplates();
    } catch (error) {
      showApiError(error, 'Failed to create template');
    }
  };

  const remove = async () => {
    if (!templateToDelete?.id) return;
    setDeleting(true);
    try {
      const { data } = await api.delete(`/templates/${templateToDelete.id}`);
      if (data.warning) {
        toast.success('Deleted locally');
        toast('Meta API failed — template may reappear after sync', { icon: '⚠️', duration: 5000 });
      } else {
        toast.success('Deleted');
      }
      setTemplateToDelete(null);
      await loadTemplates();
    } catch (error) {
      showApiError(error, 'Failed to delete template');
    } finally {
      setDeleting(false);
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const openEdit = (template) => {
    setEditingTemplate(template);
    setEditForm({
      headerType: template.headerType || 'none',
      headerContent: template.headerContent || '',
      headerFilename: getMediaDisplayName(template.headerContent, template.headerType),
      body: template.body || '',
      footer: template.footer || '',
      category: template.category || 'MARKETING',
      buttons: normalizeButtonsForForm(template.buttons),
    });
  };

  const closeEdit = () => {
    if (saving) return;
    setEditingTemplate(null);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editingTemplate) return;
    if (editForm.headerType !== 'none' && editForm.headerType !== 'text' && !editForm.headerContent) {
      toast.error(`Please upload a ${editForm.headerType} file first`);
      return;
    }
    const buttonError = getButtonValidationError(editForm.buttons);
    if (buttonError) {
      toast.error(buttonError);
      return;
    }

    const payload = {};
    const normalizedEditButtons = normalizeButtonsForSubmit(editForm.buttons);
    const normalizedCurrentButtons = normalizeButtonsForSubmit(editingTemplate.buttons);
    if ((editForm.headerType || 'none') !== (editingTemplate.headerType || 'none')) {
      payload.headerType = editForm.headerType || 'none';
    }
    if ((editForm.headerContent || '') !== (editingTemplate.headerContent || '')) {
      payload.headerContent = editForm.headerContent || '';
    }
    if ((editForm.body || '') !== (editingTemplate.body || '')) {
      payload.body = editForm.body || '';
    }
    if ((editForm.footer || '') !== (editingTemplate.footer || '')) {
      payload.footer = editForm.footer || '';
    }
    if ((editForm.category || 'MARKETING') !== (editingTemplate.category || 'MARKETING')) {
      payload.category = editForm.category || 'MARKETING';
    }
    if (JSON.stringify(normalizedEditButtons) !== JSON.stringify(normalizedCurrentButtons)) {
      payload.buttons = normalizedEditButtons;
    }

    if (Object.keys(payload).length === 0) {
      toast('No changes to save', { icon: 'i' });
      return;
    }

    setSaving(true);
    try {
      await api.put(`/templates/${editingTemplate.id}`, payload);
      toast.success('Template updated & submitted to Meta');
      setEditingTemplate(null);
      await loadTemplates();
    } catch (error) {
      showApiError(error, 'Failed to update template');
    }
    setSaving(false);
  };

  const uploadTemplateMedia = async (file, mode) => {
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('File is too large. Keep it under 35 MB.');
      return;
    }

    const setUploading = mode === 'create' ? setUploadingCreateMedia : setUploadingEditMedia;
    const setTargetForm = mode === 'create' ? setForm : setEditForm;

    setUploading(true);
    try {
      const contentBase64 = await fileToBase64(file);
      const { data } = await api.post('/uploads/media', {
        filename: file.name,
        mimeType: file.type,
        contentBase64,
      });

      setTargetForm((current) => ({
        ...current,
        headerContent: data.path || data.url,
        headerFilename: data.filename,
      }));
      toast.success('Media uploaded');
    } catch (error) {
      showApiError(error, 'Failed to upload media');
    }
    setUploading(false);
  };

  const handleCreateMediaUpload = async (event) => {
    const file = event.target.files?.[0];
    await uploadTemplateMedia(file, 'create');
    event.target.value = '';
  };

  const handleEditMediaUpload = async (event) => {
    const file = event.target.files?.[0];
    await uploadTemplateMedia(file, 'edit');
    event.target.value = '';
  };

  const addCreateButton = () => {
    setForm((current) => addButtonToTemplateForm(current));
  };

  const updateCreateButton = (buttonIndex, changes) => {
    setForm((current) => ({
      ...current,
      buttons: updateTemplateButton(current.buttons, buttonIndex, changes),
    }));
  };

  const removeCreateButton = (buttonIndex) => {
    setForm((current) => ({
      ...current,
      buttons: removeTemplateButton(current.buttons, buttonIndex),
    }));
  };

  const addEditButton = () => {
    setEditForm((current) => addButtonToTemplateForm(current));
  };

  const updateEditButton = (buttonIndex, changes) => {
    setEditForm((current) => ({
      ...current,
      buttons: updateTemplateButton(current.buttons, buttonIndex, changes),
    }));
  };

  const removeEditButton = (buttonIndex) => {
    setEditForm((current) => ({
      ...current,
      buttons: removeTemplateButton(current.buttons, buttonIndex),
    }));
  };

  const activeTemplates = useMemo(() => (
    templates.filter((template) => String(template.status || '').toUpperCase() !== 'DELETED')
  ), [templates]);

  const dedupedTemplates = useMemo(() => {
    const uniqueTemplates = [];
    const seen = new Set();

    for (const template of activeTemplates) {
      const templateKey = template.metaTemplateId || `${template.name}__${template.language}`;
      if (seen.has(templateKey)) continue;
      seen.add(templateKey);
      uniqueTemplates.push(template);
    }

    return uniqueTemplates;
  }, [activeTemplates]);

  const filteredTemplates = useMemo(() => (
    statusFilter === 'ALL'
      ? dedupedTemplates
      : statusFilter === 'FAVORITES'
        ? dedupedTemplates.filter((template) => favoriteTemplateIds.includes(template.id))
        : dedupedTemplates.filter((template) => String(template.status || '').toUpperCase() === statusFilter)
  ), [dedupedTemplates, favoriteTemplateIds, statusFilter]);

  const sortedTemplates = useMemo(() => (
    filteredTemplates
      .map((template, index) => ({
        template,
        index,
        isFavorite: favoriteTemplateIds.includes(template.id),
      }))
      .sort((left, right) => {
        if (left.isFavorite !== right.isFavorite) {
          return left.isFavorite ? -1 : 1;
        }

        return left.index - right.index;
      })
      .map(({ template }) => template)
  ), [favoriteTemplateIds, filteredTemplates]);

  const filterCounts = useMemo(() => ({
    ALL: dedupedTemplates.length,
    APPROVED: dedupedTemplates.filter((template) => String(template.status || '').toUpperCase() === 'APPROVED').length,
    PENDING: dedupedTemplates.filter((template) => String(template.status || '').toUpperCase() === 'PENDING').length,
    REJECTED: dedupedTemplates.filter((template) => String(template.status || '').toUpperCase() === 'REJECTED').length,
    FAVORITES: dedupedTemplates.filter((template) => favoriteTemplateIds.includes(template.id)).length,
  }), [dedupedTemplates, favoriteTemplateIds]);

  const totalPages = Math.max(1, Math.ceil(sortedTemplates.length / pageSize));
  const paginatedTemplates = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedTemplates.slice(startIndex, startIndex + pageSize);
  }, [currentPage, pageSize, sortedTemplates]);
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const toggleFavorite = (templateId) => {
    setFavoriteTemplateIds((current) => {
      const nextFavorites = current.includes(templateId)
        ? current.filter((id) => id !== templateId)
        : [...current, templateId];

      writeTemplateFavorites(favoriteStorageKey, nextFavorites);
      return nextFavorites;
    });
  };

  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Message Templates</h1>
            <p className="mt-0.5 text-sm text-gray-500">Create and manage your WhatsApp message templates</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button onClick={sync} className="flex min-w-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 sm:w-auto sm:px-4">
              <IoRefresh /> Sync from Meta
            </button>
            <button onClick={() => setShowForm(!showForm)} className="flex min-w-0 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover sm:w-auto sm:px-4">
              <IoAdd /> Create Template
            </button>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {[
            { value: 'ALL', label: 'All' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'PENDING', label: 'Pending' },
            { value: 'REJECTED', label: 'Rejected' },
            { value: 'FAVORITES', label: 'Favorites' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatusFilter(option.value)}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === option.value
                  ? option.value === 'APPROVED'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : option.value === 'PENDING'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : option.value === 'REJECTED'
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : option.value === 'FAVORITES'
                          ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                        : 'border-primary/20 bg-primary/10 text-primary'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {option.label} ({filterCounts[option.value] || 0})
            </button>
          ))}
        </div>

        {showForm && (
          <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">New Template</h2>
            <form onSubmit={create} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Template Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s/g, '_') })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Enter template name" required />
              </div>
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Category</label>
                  <AppSelect value={form.category} onChange={(value) => setForm({ ...form, category: value })} options={categoryOptions} />
                </div>
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Language</label>
                  <AppSelect value={form.language} onChange={(value) => setForm({ ...form, language: value })} options={languageOptions} />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Header Type</label>
                <AppSelect value={form.headerType} onChange={(value) => setForm({ ...form, headerType: value })} options={headerTypeOptions} />
              </div>
              {form.headerType !== 'none' && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Header Content</label>
                  {form.headerType === 'text' ? (
                    <input type="text" value={form.headerContent} onChange={(e) => setForm({ ...form, headerContent: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none" placeholder="Enter header text" />
                  ) : (
                    <div className="space-y-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100">
                        <IoCloudUpload className="text-base" />
                        <span>{uploadingCreateMedia ? 'Uploading...' : `Upload ${form.headerType}`}</span>
                        <input
                          type="file"
                          accept={getTemplateAcceptValue(form.headerType)}
                          className="hidden"
                          onChange={handleCreateMediaUpload}
                          disabled={uploadingCreateMedia}
                        />
                      </label>
                      <TemplateMediaPreview
                        headerType={form.headerType}
                        headerContent={form.headerContent}
                        headerFilename={form.headerFilename}
                      />
                      <p className="text-xs text-gray-400"> Current upload limit: 35 MB per file.</p>
                    </div>
                  )}
                </div>
              )}
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Body <span className="font-normal text-gray-400">(Use {'{{1}}'}, {'{{2}}'} for variables)</span></label>
                <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                  className="h-24 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20" placeholder="Enter template message" required />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Footer (optional)</label>
                <input type="text" value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none" placeholder="Enter footer text" />
              </div>
              <div className="md:col-span-2">
                <TemplateButtonsEditor
                  buttons={form.buttons}
                  onAdd={addCreateButton}
                  onUpdate={updateCreateButton}
                  onRemove={removeCreateButton}
                />
              </div>
              <div className="md:col-span-2">
                <TemplateLivePreview template={form} />
              </div>
              <div className="flex flex-col gap-2 pt-2 md:col-span-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50">Cancel</button>
                <button type="submit" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover">Submit to Meta</button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : sortedTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100">
              <IoDocumentText className="text-3xl text-gray-300" />
            </div>
            <p className="font-medium text-gray-500">
              {statusFilter === 'ALL'
                ? 'No templates yet'
                : statusFilter === 'FAVORITES'
                  ? 'No favorite templates yet'
                  : `No ${statusFilter.toLowerCase()} templates`}
            </p>
            <p className="mt-1 text-sm text-gray-400">
              {statusFilter === 'ALL'
                ? 'Create or sync templates to get started'
                : statusFilter === 'FAVORITES'
                  ? 'Mark templates as favorite to see them here'
                  : 'Try a different status filter or sync from Meta'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {paginatedTemplates.map((template) => {
              const StatusIcon = statusIcons[template.status] || IoTime;
              const isFavorite = favoriteTemplateIds.includes(template.id);
              return (
                <div key={template.id} className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => toggleFavorite(template.id)}
                        className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border transition-colors ${
                          isFavorite
                            ? 'border-amber-200 bg-amber-50 text-amber-500 hover:bg-amber-100'
                            : 'border-gray-200 bg-white text-gray-300 hover:text-amber-500'
                        }`}
                        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {isFavorite ? <IoStar className="text-base" /> : <IoStarOutline className="text-base" />}
                      </button>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-800">{template.name}</h3>
                        {isFavorite && <p className="mt-1 text-xs font-medium text-amber-600">Favorite template</p>}
                      </div>
                    </div>
                    <span className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${statusStyles[template.status] || 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                      <StatusIcon className="text-xs" />
                      {template.status}
                    </span>
                  </div>
                  <div className="mb-3 rounded-xl border border-amber-100/50 bg-gradient-to-br from-amber-50/80 to-orange-50/50 p-3">
                    {template.headerType !== 'none' && (
                      template.headerType === 'text' ? (
                        <p className="mb-1 text-sm font-semibold text-gray-700">{template.headerContent || `[${template.headerType}]`}</p>
                      ) : (
                        <div className="mb-3">
                          <TemplateMediaPreview
                            headerType={template.headerType}
                            headerContent={template.headerContent}
                            headerFilename={getMediaDisplayName(template.headerContent, template.headerType)}
                            compact
                          />
                        </div>
                      )
                    )}
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{template.body}</p>
                    {template.footer && <p className="mt-2 text-xs italic text-gray-500">{template.footer}</p>}
                    <TemplateButtonPreview buttons={template.buttons} />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
                    <span className="break-words font-medium">{`${template.category} | ${template.language}`}</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEdit(template)}
                        className="text-gray-300 transition-colors hover:text-blue-500 md:opacity-0 md:group-hover:opacity-100"
                        title="Edit template"
                      >
                        <IoCreate className="text-base" />
                      </button>
                      <button onClick={() => setTemplateToDelete(template)} className="text-gray-300 transition-colors hover:text-red-500 md:opacity-0 md:group-hover:opacity-100">
                        <IoTrash className="text-base" />
                      </button>
                    </div>
                  </div>
                </div>
              );
              })}
            </div>

            {sortedTemplates.length > 0 && (
              <PaginationBar
                className="mt-5"
                page={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={sortedTemplates.length}
                onPageChange={setCurrentPage}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageSizeChange={(size) => {
                  setPageSize(size || DEFAULT_PAGE_SIZE);
                  setCurrentPage(1);
                }}
              />
            )}
          </>
        )}

        {/* Delete Confirmation Modal */}
        {templateToDelete && (
          <div className="app-modal-overlay z-50 bg-slate-900/55">
            <div className="app-modal-panel max-w-[22rem] border border-slate-200 sm:max-w-md">
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-500">
                  <IoTrash className="text-lg" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Delete template?</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    This will remove <span className="font-medium text-slate-700">{templateToDelete.name}</span> from your app and WhatsApp template list.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => !deleting && setTemplateToDelete(null)}
                  className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={remove}
                  className="rounded-2xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-red-500/25 transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete Template'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Template Modal */}
        {editingTemplate && (
          <div className="app-modal-overlay z-50 bg-black/50" onClick={closeEdit}>
            <div className="app-modal-scroll-panel max-w-2xl" onClick={(e) => e.stopPropagation()}>

              {/* Header */}
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Edit Template</h2>
                  <p className="mt-0.5 text-sm text-gray-500">
                    Editing <span className="font-medium text-gray-700">{editingTemplate.name}</span>
                    <span className="ml-2 text-gray-400">({editingTemplate.language})</span>
                  </p>
                </div>
                <button onClick={closeEdit} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100">
                  <IoClose />
                </button>
              </div>

              {/* Info note */}
              <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
                <strong>Note:</strong> Template name and language cannot be changed after creation. Body, header, and footer are safe to update. Category changes may be rejected by Meta for approved templates.
              </div>

              <form onSubmit={saveEdit} className="space-y-4">
                {/* Category */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Category</label>
                  <AppSelect
                    value={editForm.category}
                    onChange={(value) => setEditForm({ ...editForm, category: value })}
                    options={categoryOptions}
                    disabled={editingTemplate.status === 'APPROVED'}
                  />
                  {editingTemplate.status === 'APPROVED' && (
                    <p className="mt-1 text-xs text-amber-600">Approved templates usually cannot change category. Create a new template if you need a different category.</p>
                  )}
                </div>

                {/* Header */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Header Type</label>
                  <AppSelect value={editForm.headerType} onChange={(value) => setEditForm({ ...editForm, headerType: value })} options={headerTypeOptions} />
                </div>
                {editForm.headerType !== 'none' && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Header Content</label>
                    {editForm.headerType === 'text' ? (
                      <input
                        type="text"
                        value={editForm.headerContent}
                        onChange={(e) => setEditForm({ ...editForm, headerContent: e.target.value })}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder="Enter header text"
                      />
                    ) : (
                      <div className="space-y-3">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100">
                          <IoCloudUpload className="text-base" />
                          <span>{uploadingEditMedia ? 'Uploading...' : `Upload ${editForm.headerType}`}</span>
                          <input
                            type="file"
                            accept={getTemplateAcceptValue(editForm.headerType)}
                            className="hidden"
                            onChange={handleEditMediaUpload}
                            disabled={uploadingEditMedia}
                          />
                        </label>
                        <TemplateMediaPreview
                          headerType={editForm.headerType}
                          headerContent={editForm.headerContent}
                          headerFilename={editForm.headerFilename}
                        />
                        
                      </div>
                    )}
                  </div>
                )}

                {/* Body */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Body <span className="font-normal text-gray-400">(Use {'{{1}}'}, {'{{2}}'} for variables)</span>
                  </label>
                  <textarea
                    value={editForm.body}
                    onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                    className="h-32 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Enter template message"
                    required
                  />
                </div>

                {/* Footer */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Footer (optional)</label>
                  <input
                    type="text"
                    value={editForm.footer}
                    onChange={(e) => setEditForm({ ...editForm, footer: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Enter footer text"
                  />
                </div>

                <TemplateButtonsEditor
                  buttons={editForm.buttons}
                  onAdd={addEditButton}
                  onUpdate={updateEditButton}
                  onRemove={removeEditButton}
                />

                <TemplateLivePreview template={editForm} title="Updated WhatsApp Preview" />

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeEdit} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save & Update on Meta'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getEmptyTemplateForm() {
  return {
    name: '',
    language: 'en_US',
    category: 'MARKETING',
    headerType: 'none',
    headerContent: '',
    headerFilename: '',
    body: '',
    footer: '',
    buttons: [],
  };
}

function getEmptyEditTemplateForm() {
  return {
    headerType: 'none',
    headerContent: '',
    headerFilename: '',
    body: '',
    footer: '',
    category: 'MARKETING',
    buttons: [],
  };
}

function getEmptyTemplateButton() {
  return { type: 'QUICK_REPLY', text: '', url: '' };
}

function addButtonToTemplateForm(formState) {
  const currentButtons = normalizeButtonsForForm(formState.buttons);
  if (currentButtons.length >= MAX_TEMPLATE_BUTTONS) return formState;
  return { ...formState, buttons: [...currentButtons, getEmptyTemplateButton()] };
}

function updateTemplateButton(buttons, buttonIndex, changes) {
  return normalizeButtonsForForm(buttons).map((button, index) => {
    if (index !== buttonIndex) return button;
    const nextButton = normalizeButtonForForm({ ...button, ...changes });
    if (changes.type && changes.type !== button.type) {
      return { ...nextButton, url: '' };
    }
    return nextButton;
  });
}

function removeTemplateButton(buttons, buttonIndex) {
  return normalizeButtonsForForm(buttons).filter((_, index) => index !== buttonIndex);
}

function normalizeButtonForForm(button = {}) {
  const type = String(button.type || 'QUICK_REPLY').toUpperCase() === 'URL' ? 'URL' : 'QUICK_REPLY';
  return {
    type,
    text: String(button.text || ''),
    url: type === 'URL' ? String(button.url || '') : '',
  };
}

function normalizeButtonsForForm(buttons) {
  if (!Array.isArray(buttons)) return [];
  return buttons.map(normalizeButtonForForm);
}

function buttonHasAnyInput(button) {
  return Boolean(String(button.text || '').trim() || String(button.url || '').trim());
}

function normalizeButtonsForSubmit(buttons) {
  return normalizeButtonsForForm(buttons)
    .filter(buttonHasAnyInput)
    .map((button) => {
      const normalizedButton = {
        type: button.type,
        text: button.text.trim(),
      };

      if (button.type === 'URL') {
        normalizedButton.url = button.url.trim();
      }

      return normalizedButton;
    });
}

function getButtonValidationError(buttons) {
  const configuredButtons = normalizeButtonsForForm(buttons).filter(buttonHasAnyInput);
  if (configuredButtons.length > MAX_TEMPLATE_BUTTONS) {
    return `Add no more than ${MAX_TEMPLATE_BUTTONS} buttons`;
  }

  for (const button of configuredButtons) {
    const text = button.text.trim();
    if (!text) return 'Button text is required';
    if (text.length > TEMPLATE_BUTTON_TEXT_LIMIT) {
      return `Button text must be ${TEMPLATE_BUTTON_TEXT_LIMIT} characters or fewer`;
    }
    if (button.type === 'URL' && !/^https?:\/\//i.test(button.url.trim())) {
      return 'Website button URL must start with http:// or https://';
    }
  }

  return '';
}

function TemplateButtonsEditor({ buttons, onAdd, onUpdate, onRemove }) {
  const safeButtons = normalizeButtonsForForm(buttons);
  const canAdd = safeButtons.length < MAX_TEMPLATE_BUTTONS;

  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label className="block text-sm font-medium text-gray-700">Buttons optional</label>
          <p className="mt-0.5 text-xs text-gray-400">Add quick replies or website CTAs like the WhatsApp card.</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IoAdd className="text-base" />
          Add Button
        </button>
      </div>

      {safeButtons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-400">
          No buttons added yet
        </div>
      ) : (
        <div className="space-y-3">
          {safeButtons.map((button, index) => (
            <div key={index} className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr_auto]">
                <AppSelect
                  value={button.type}
                  onChange={(value) => onUpdate(index, { type: value })}
                  options={buttonTypeOptions}
                />
                <input
                  type="text"
                  value={button.text}
                  onChange={(event) => onUpdate(index, { text: event.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder={button.type === 'URL' ? 'Button label, e.g. Visit website' : 'Button label, e.g. Get started'}
                  maxLength={TEMPLATE_BUTTON_TEXT_LIMIT}
                />
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-red-100 px-3 text-red-500 transition-colors hover:bg-red-50"
                  title="Remove button"
                >
                  <IoTrash className="text-base" />
                </button>
              </div>
              {button.type === 'URL' && (
                <input
                  type="url"
                  value={button.url}
                  onChange={(event) => onUpdate(index, { url: event.target.value })}
                  className="mt-3 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="https://example.com"
                />
              )}
              <p className="mt-2 text-xs text-gray-400">
                {button.text.length}/{TEMPLATE_BUTTON_TEXT_LIMIT} characters
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateLivePreview({ template, title = 'Live WhatsApp Preview' }) {
  const bodyText = String(template.body || '').trim() || 'Your template message preview will appear here.';
  const footerText = String(template.footer || '').trim();
  const buttons = normalizeButtonsForForm(template.buttons).filter((button) => String(button.text || '').trim());

  return (
    <div className="rounded-2xl border border-emerald-100 bg-[#efe7dd] p-4">
      <div className="mx-auto max-w-md">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{title}</p>
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {template.headerType === 'text' && template.headerContent && (
            <p className="px-4 pt-4 text-sm font-semibold text-gray-800">{template.headerContent}</p>
          )}
          {template.headerType && template.headerType !== 'none' && template.headerType !== 'text' && template.headerContent && (
            <div className="p-2 pb-0">
              <TemplateMediaPreview
                headerType={template.headerType}
                headerContent={template.headerContent}
                headerFilename={template.headerFilename}
                compact
              />
            </div>
          )}
          <div className="space-y-2 px-4 py-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900">{bodyText}</p>
            {footerText && <p className="text-xs text-gray-400">{footerText}</p>}
            <p className="text-right text-[11px] text-gray-400">Now</p>
          </div>
          <TemplateButtonPreview buttons={buttons} flush />
        </div>
      </div>
    </div>
  );
}

function TemplateButtonPreview({ buttons, flush = false }) {
  const visibleButtons = normalizeButtonsForForm(buttons).filter((button) => String(button.text || '').trim());
  if (visibleButtons.length === 0) return null;

  return (
    <div className={`${flush ? 'border-t border-gray-100' : 'mt-3 space-y-1.5'}`}>
      {visibleButtons.map((button, index) => (
        <div
          key={`${button.type}-${button.text}-${index}`}
          className={`${flush ? 'border-b border-gray-100 last:border-b-0 rounded-none' : 'rounded-xl border border-emerald-100 bg-white'} px-3 py-2 text-center text-sm font-semibold text-emerald-700`}
        >
          {button.text}
        </div>
      ))}
    </div>
  );
}

function getTemplateAcceptValue(headerType) {
  if (headerType === 'image') return '.jpg,.jpeg,.png,.gif,.webp,.bmp';
  if (headerType === 'video') return '.mp4,.mov,.avi,.mkv,.webm';
  if (headerType === 'document') return '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv';
  return '';
}

function getMediaDisplayName(headerContent, headerType) {
  if (!headerContent) return '';

  if (looksLikeMetaHandle(headerContent)) {
    return getFallbackMediaLabel(headerType);
  }

  try {
    const parsedUrl = new URL(headerContent, window.location.origin);
    const filename = parsedUrl.pathname.split('/').filter(Boolean).pop();
    if (filename) return decodeURIComponent(filename);
  } catch {
    // Fall back to a generic label when the saved value is not a valid URL.
  }

  return getFallbackMediaLabel(headerType);
}

function looksLikeMetaHandle(value) {
  const text = String(value || '');
  return !/^https?:\/\//i.test(text) && /^[A-Za-z0-9._-]{25,}$/.test(text);
}

function getFallbackMediaLabel(headerType) {
  if (headerType === 'image') return 'Image Header';
  if (headerType === 'video') return 'Video Header';
  if (headerType === 'document') return 'Document Header';
  return 'Media Header';
}

function TemplateMediaPreview({ headerType, headerContent, headerFilename, compact = false }) {
  const filename = headerFilename || getMediaDisplayName(headerContent, headerType);
  const previewUrl = getTemplatePreviewUrl(headerContent);
  const [failedUrl, setFailedUrl] = useState('');

  if (!headerType || headerType === 'none') return null;

  if (!headerContent) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
        No media uploaded yet
      </div>
    );
  }

  if (failedUrl === previewUrl) {
    return (
      <TemplateMediaUnavailable
        compact={compact}
        filename={filename}
        previewUrl={previewUrl}
      />
    );
  }

  if (headerType === 'image') {
    return (
      <div className={`overflow-hidden rounded-xl border border-gray-200 bg-white ${compact ? '' : 'shadow-sm'}`}>
        <img
          src={previewUrl}
          alt={filename}
          loading="lazy"
          onError={() => setFailedUrl(previewUrl)}
          className={`w-full object-cover ${compact ? 'max-h-40' : 'max-h-56'}`}
        />
      </div>
    );
  }

  if (headerType === 'video') {
    return (
      <div className={`overflow-hidden rounded-xl border border-gray-200 bg-white ${compact ? '' : 'shadow-sm'}`}>
        <video
          src={previewUrl}
          controls
          muted
          playsInline
          onError={() => setFailedUrl(previewUrl)}
          className={`w-full bg-black ${compact ? 'max-h-40' : 'max-h-56'}`}
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <IoDocument className="text-lg" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-800">{filename}</p>
          <p className="mt-0.5 text-xs text-gray-500">Document linked and ready for template review</p>
        </div>
      </div>
    </div>
  );
}

function TemplateMediaUnavailable({ filename, previewUrl, compact = false }) {
  return (
    <div className={`rounded-xl border border-dashed border-amber-300 bg-amber-50/80 px-3 py-3 text-amber-900 ${compact ? 'text-xs' : 'text-sm'}`}>
      <div className="flex items-start gap-2">
        <IoCloseCircle className="mt-0.5 flex-shrink-0 text-base text-amber-600" />
        <div className="min-w-0">
          <p className="font-semibold">Media preview unavailable</p>
          <p className="mt-1 truncate text-amber-800">{filename || 'Uploaded media file'}</p>
          <p className="mt-1 text-amber-700">
            Re-upload this header file if the backend was redeployed or uploads storage is not persistent.
          </p>
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex max-w-full truncate font-semibold text-amber-800 underline decoration-amber-400 underline-offset-2"
            >
              Open media URL
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function getTemplatePreviewUrl(headerContent) {
  const text = String(headerContent || '').trim();
  if (!text) return '';

  try {
    const parsedUrl = new URL(text, window.location.origin);
    if (parsedUrl.pathname.startsWith('/uploads/')) {
      return getUploadAssetUrl(`${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`);
    }
    return parsedUrl.href;
  } catch {
    // Use the original value when it is not a standard URL.
  }

  return text;
}

function getUploadAssetUrl(uploadPath) {
  const normalizedPath = String(uploadPath || '').startsWith('/') ? uploadPath : `/${uploadPath}`;
  const apiBaseUrl = api.defaults.baseURL || '/api';

  try {
    const parsedApiUrl = new URL(apiBaseUrl, window.location.origin);
    const assetBasePath = parsedApiUrl.pathname.replace(/\/api\/?$/, '');
    return new URL(normalizedPath, `${parsedApiUrl.origin}${assetBasePath || ''}/`).href;
  } catch {
    return normalizedPath;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getTemplateFavoritesStorageKey(userId, accountId) {
  return `templateFavorites:${userId || 'guest'}:${accountId || 'all'}`;
}

function readTemplateFavorites(storageKey) {
  try {
    const storedValue = localStorage.getItem(storageKey);
    const parsedValue = JSON.parse(storedValue || '[]');
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

function writeTemplateFavorites(storageKey, templateIds) {
  localStorage.setItem(storageKey, JSON.stringify(templateIds));
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { IoAdd, IoTrash, IoFlash, IoCreate, IoToggle } from 'react-icons/io5';
import toast from 'react-hot-toast';
import api from '../services/api';
import PaginationBar from '../components/ui/PaginationBar';
import useAccountStore from '../store/accountStore';
import useConfirmDialog from '../hooks/useConfirmDialog';
import { showApiError } from '../utils/apiError';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 40, 80, 100];

export default function QuickReplies() {
  const { activeAccount } = useAccountStore();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', shortcut: '', content: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const loadReplies = useCallback(async () => {
    if (!activeAccount?.id) {
      setReplies([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.get(`/quick-replies/${activeAccount.id}`, {
        params: { includeInactive: 'true' },
      });
      setReplies(data.quickReplies);
    }
    catch (error) { showApiError(error, 'Failed to load quick replies'); }
    setLoading(false);
  }, [activeAccount]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadReplies();
    });
  }, [loadReplies]);

  const totalPages = Math.max(1, Math.ceil(replies.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const visibleReplies = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return replies.slice(startIndex, startIndex + pageSize);
  }, [pageSize, replies, safeCurrentPage]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/quick-replies/${editing}`, form);
        toast.success('Updated');
      } else {
        await api.post(`/quick-replies/${activeAccount.id}`, form);
        toast.success('Created');
      }
      setShowForm(false);
      setEditing(null);
      setForm({ title: '', shortcut: '', content: '' });
      await loadReplies();
    } catch (error) {
      showApiError(error, 'Failed to save quick reply');
    }
  };

  const edit = (reply) => {
    setForm({ title: reply.title, shortcut: reply.shortcut || '', content: reply.content });
    setEditing(reply.id);
    setShowForm(true);
  };

  const toggle = async (id) => {
    try {
      await api.patch(`/quick-replies/${id}/toggle`);
      await loadReplies();
    } catch (error) {
      showApiError(error, 'Failed to update quick reply');
    }
  };

  const remove = async (id) => {
    const approved = await confirm({
      title: 'Delete Quick Reply',
      message: 'Delete this quick reply permanently?',
      confirmLabel: 'Delete Reply',
    });
    if (!approved) return;
    try { await api.delete(`/quick-replies/${id}`); await loadReplies(); } catch (error) { showApiError(error, 'Failed to delete quick reply'); }
  };

  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Quick Replies</h1>
            <p className="mt-0.5 text-sm text-gray-500">Pre-saved messages for faster responses. Type / in chat to use.</p>
          </div>
          <button onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ title: '', shortcut: '', content: '' }); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover sm:w-auto">
            <IoAdd /> New Reply
          </button>
        </div>

        {showForm && (
          <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">{editing ? 'Edit' : 'New'} Quick Reply</h2>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Title</label>
                  <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" required placeholder="Enter reply title" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Shortcut (optional)</label>
                  <input type="text" value={form.shortcut} onChange={(e) => setForm({ ...form, shortcut: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none" placeholder="Enter shortcut" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Message Content</label>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={4}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" required
                  placeholder="Enter quick reply message" />
                <p className="mt-1 text-xs text-gray-400">Variables: {'{{name}}'}, {'{{phone}}'}</p>
              </div>
              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 hover:bg-primary-hover">{editing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
        ) : replies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100"><IoFlash className="text-3xl text-gray-300" /></div>
            <p className="font-medium text-gray-500">No quick replies yet</p>
            <p className="mt-1 text-sm text-gray-400">Create one to speed up your conversations</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleReplies.map((reply) => {
              const isActive = reply.isActive !== false;

              return (
                <div key={reply.id} className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:shadow-md sm:p-5 ${!isActive ? 'opacity-70' : ''}`}>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50"><IoFlash className="text-amber-500" /></div>
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-gray-800">{reply.title}</h3>
                          {reply.shortcut && <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-500">/{reply.shortcut}</span>}
                          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-gray-600">{reply.content}</p>
                      </div>
                    </div>
                    <div className="grid w-full grid-cols-3 gap-2 xl:w-auto xl:min-w-[260px] xl:flex xl:justify-end">
                      <button
                        type="button"
                        onClick={() => toggle(reply.id)}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                          isActive
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                        title={isActive ? 'Turn off quick reply' : 'Turn on quick reply'}
                      >
                        <IoToggle className="text-base" />
                        {isActive ? 'On' : 'Off'}
                      </button>
                      <button
                        type="button"
                        onClick={() => edit(reply)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 transition-colors hover:bg-blue-100"
                        title="Update quick reply"
                        aria-label={`Edit quick reply ${reply.title}`}
                      >
                        <IoCreate className="text-base" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(reply.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
                        title="Delete quick reply"
                        aria-label={`Delete quick reply ${reply.title}`}
                      >
                        <IoTrash className="text-base" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            <PaginationBar
              className="mt-5"
              page={safeCurrentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={replies.length}
              onPageChange={setCurrentPage}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={(size) => {
                setPageSize(size || DEFAULT_PAGE_SIZE);
                setCurrentPage(1);
              }}
            />
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}

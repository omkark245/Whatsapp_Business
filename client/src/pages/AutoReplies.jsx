import { useCallback, useEffect, useMemo, useState } from 'react';
import { IoAdd, IoTrash, IoCreate, IoToggle, IoChatbox, IoTime, IoMoon } from 'react-icons/io5';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAccountStore from '../store/accountStore';
import AppSelect from '../components/ui/AppSelect';
import PaginationBar from '../components/ui/PaginationBar';
import useConfirmDialog from '../hooks/useConfirmDialog';
import { showApiError } from '../utils/apiError';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 40, 80, 100];
const TYPE_CONFIG = {
  keyword: {
    icon: IoChatbox,
    label: 'Keyword',
    option: 'bg-blue-50 text-blue-600 border-blue-200',
    iconWrap: 'bg-blue-50',
    iconText: 'text-blue-500',
    badge: 'bg-blue-50 text-blue-600',
  },
  greeting: {
    icon: IoTime,
    label: 'Greeting',
    option: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    iconWrap: 'bg-emerald-50',
    iconText: 'text-emerald-500',
    badge: 'bg-emerald-50 text-emerald-600',
  },
  away: {
    icon: IoMoon,
    label: 'Away',
    option: 'bg-purple-50 text-purple-600 border-purple-200',
    iconWrap: 'bg-purple-50',
    iconText: 'text-purple-500',
    badge: 'bg-purple-50 text-purple-600',
  },
};
const MATCH_TYPE_OPTIONS = [
  { value: 'contains', label: 'Contains' },
  { value: 'exact', label: 'Exact Match' },
];

export default function AutoReplies() {
  const { activeAccount } = useAccountStore();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [form, setForm] = useState({
    type: 'keyword',
    keyword: '',
    matchType: 'contains',
    replyText: '',
    scheduleStart: '09:00',
    scheduleEnd: '18:00',
    scheduleDays: [1, 2, 3, 4, 5],
  });

  const loadReplies = useCallback(async () => {
    if (!activeAccount?.id) {
      setReplies([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try { const { data } = await api.get(`/auto-replies/${activeAccount.id}`); setReplies(data.autoReplies); }
    catch (error) { showApiError(error, 'Failed to load auto replies'); }
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

  const resetForm = () => setForm({
    type: 'keyword',
    keyword: '',
    matchType: 'contains',
    replyText: '',
    scheduleStart: '09:00',
    scheduleEnd: '18:00',
    scheduleDays: [1, 2, 3, 4, 5],
  });

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/auto-replies/${editing}`, form);
        toast.success('Updated');
      } else {
        await api.post(`/auto-replies/${activeAccount.id}`, form);
        toast.success('Created');
      }
      setShowForm(false);
      setEditing(null);
      resetForm();
      await loadReplies();
    } catch (error) {
      showApiError(error, 'Failed to save auto reply');
    }
  };

  const edit = (reply) => {
    setForm({
      type: reply.type,
      keyword: reply.keyword || '',
      matchType: reply.matchType || 'contains',
      replyText: reply.replyText,
      scheduleStart: reply.scheduleStart || '09:00',
      scheduleEnd: reply.scheduleEnd || '18:00',
      scheduleDays: reply.scheduleDays || [1, 2, 3, 4, 5],
    });
    setEditing(reply.id);
    setShowForm(true);
  };

  const toggle = async (id) => {
    try { await api.patch(`/auto-replies/${id}/toggle`); await loadReplies(); } catch (error) { showApiError(error, 'Failed to update auto reply'); }
  };

  const remove = async (id) => {
    const approved = await confirm({
      title: 'Delete Auto Reply',
      message: 'Delete this auto reply permanently?',
      confirmLabel: 'Delete Reply',
    });
    if (!approved) return;
    try { await api.delete(`/auto-replies/${id}`); await loadReplies(); } catch (error) { showApiError(error, 'Failed to delete auto reply'); }
  };

  const toggleDay = (day) => {
    setForm((currentForm) => ({
      ...currentForm,
      scheduleDays: currentForm.scheduleDays.includes(day)
        ? currentForm.scheduleDays.filter((value) => value !== day)
        : [...currentForm.scheduleDays, day].sort(),
    }));
  };

  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Auto Replies</h1>
            <p className="mt-0.5 text-sm text-gray-500">Automatic responses for keywords, greetings, and away messages</p>
          </div>
          <button onClick={() => { setShowForm(!showForm); setEditing(null); resetForm(); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover sm:w-auto">
            <IoAdd /> New Auto Reply
          </button>
        </div>

        {showForm && (
          <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">{editing ? 'Edit' : 'New'} Auto Reply</h2>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Type</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(TYPE_CONFIG).map(([key, config]) => {
                    const TypeIcon = config.icon;

                    return (
                      <button key={key} type="button" onClick={() => setForm({ ...form, type: key })}
                        className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                          form.type === key ? config.option : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}>
                        <TypeIcon />
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {form.type === 'keyword' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Keyword</label>
                    <input type="text" value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20" required placeholder="Enter keywords separated by commas" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Match Type</label>
                    <AppSelect value={form.matchType} onChange={(value) => setForm({ ...form, matchType: value })} options={MATCH_TYPE_OPTIONS} />
                  </div>
                </div>
              )}

              {(form.type === 'greeting' || form.type === 'away') && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Business Hours Start</label>
                      <input type="time" value={form.scheduleStart} onChange={(e) => setForm({ ...form, scheduleStart: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Business Hours End</label>
                      <input type="time" value={form.scheduleEnd} onChange={(e) => setForm({ ...form, scheduleEnd: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Active Days</label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS.map((day, index) => (
                        <button key={index} type="button" onClick={() => toggleDay(index)}
                          className={`h-10 w-10 rounded-lg text-xs font-medium transition-all ${form.scheduleDays.includes(index) ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    {form.type === 'greeting' ? 'Greeting will be sent during business hours' : 'Away message will be sent outside business hours'}
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Reply Message</label>
                <textarea value={form.replyText} onChange={(e) => setForm({ ...form, replyText: e.target.value })} rows={3}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20" required
                  placeholder="Enter the auto reply message" />
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
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100"><IoChatbox className="text-3xl text-gray-300" /></div>
            <p className="font-medium text-gray-500">No auto replies yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleReplies.map((reply) => {
              const config = TYPE_CONFIG[reply.type];
              const ReplyIcon = config.icon;
              return (
                <div key={reply.id} className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:shadow-md sm:p-5 ${!reply.isActive ? 'opacity-70' : ''}`}>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${config.iconWrap}`}>
                        <ReplyIcon className={config.iconText} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${config.badge}`}>{config.label}</span>
                          {reply.type === 'keyword' && (
                            <span className="max-w-full break-words rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              {`${reply.matchType}: "${reply.keyword}"`}
                            </span>
                          )}
                          {(reply.type === 'greeting' || reply.type === 'away') && reply.scheduleStart && (
                            <span className="text-xs text-gray-500">{`${reply.scheduleStart} - ${reply.scheduleEnd}`}</span>
                          )}
                          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${reply.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                            {reply.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-600">{reply.replyText}</p>
                      </div>
                    </div>
                    <div className="grid w-full grid-cols-3 gap-2 xl:w-auto xl:min-w-[260px] xl:flex xl:justify-end">
                      <button
                        type="button"
                        onClick={() => toggle(reply.id)}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                          reply.isActive
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                        title={reply.isActive ? 'Turn off auto reply' : 'Turn on auto reply'}
                      >
                        <IoToggle className="text-base" />
                        {reply.isActive ? 'On' : 'Off'}
                      </button>
                      <button
                        type="button"
                        onClick={() => edit(reply)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 transition-colors hover:bg-blue-100"
                        title="Update auto reply"
                        aria-label={`Edit auto reply ${reply.keyword}`}
                      >
                        <IoCreate className="text-base" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(reply.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
                        title="Delete auto reply"
                        aria-label={`Delete auto reply ${reply.keyword}`}
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

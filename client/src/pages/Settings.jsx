import { useEffect, useEffectEvent, useState } from 'react';
import {
  IoAdd, IoTrash, IoCheckmarkCircle, IoWarning, IoGlobe, IoKey,
  IoPencil, IoEye, IoEyeOff, IoClose, IoSave,
} from 'react-icons/io5';
import toast from 'react-hot-toast';
import useAccountStore from '../store/accountStore';
import useConfirmDialog from '../hooks/useConfirmDialog';
import { showApiError } from '../utils/apiError';

export default function Settings() {
  const { accounts, activeAccount, fetchAccounts, setActiveAccount, connectManual, deleteAccount, updateAccount } = useAccountStore();
  const { confirm, confirmDialog } = useConfirmDialog();

  // ── Connect new account ──────────────────────────────────────────────────
  const [showConnect, setShowConnect] = useState(false);
  const [form, setForm] = useState({ accessToken: '', phoneNumberId: '', wabaId: '' });
  const [connecting, setConnecting] = useState(false);

  // ── Edit existing account ────────────────────────────────────────────────
  const [editingId, setEditingId] = useState(null);          // account id being edited
  const [editForm, setEditForm] = useState({ accessToken: '', phoneNumberId: '', wabaId: '' });
  const [showToken, setShowToken] = useState(false);          // toggle access-token visibility
  const [saving, setSaving] = useState(false);

  const loadAccounts = useEffectEvent(async () => {
    await fetchAccounts();
  });

  useEffect(() => { void loadAccounts(); }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleConnect = async (e) => {
    e.preventDefault();
    setConnecting(true);
    try {
      await connectManual(form.accessToken, form.phoneNumberId, form.wabaId);
      toast.success('Connected!');
      setShowConnect(false);
      setForm({ accessToken: '', phoneNumberId: '', wabaId: '' });
    } catch (err) {
      showApiError(err, 'Failed to connect');
    }
    setConnecting(false);
  };

  const openEdit = (account) => {
    setEditingId(account.id);
    setEditForm({
      accessToken: account.accessToken || '',
      phoneNumberId: account.phoneNumberId || '',
      wabaId: account.wabaId || '',
    });
    setShowToken(false);
    setShowConnect(false); // close connect form if open
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ accessToken: '', phoneNumberId: '', wabaId: '' });
    setShowToken(false);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateAccount(editingId, editForm.accessToken, editForm.phoneNumberId, editForm.wabaId);
      toast.success('Account updated!');
      cancelEdit();
    } catch (err) {
      showApiError(err, 'Failed to update');
    }
    setSaving(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
          <p className="mt-0.5 text-sm text-gray-500">Manage your WhatsApp accounts and configuration</p>
        </div>

        {/* ── WhatsApp Accounts card ─────────────────────────────────────── */}
        <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <IoGlobe className="text-lg text-primary" />
              </div>
              <h2 className="text-lg font-semibold">WhatsApp Accounts</h2>
            </div>
            <button
              onClick={() => { setShowConnect(!showConnect); cancelEdit(); }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover sm:w-auto"
            >
              <IoAdd /> Connect / Reconnect
            </button>
          </div>

          {/* ── Connect new account form ─────────────────────────────────── */}
          {showConnect && (
            <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50/50 p-4 sm:p-5">
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="mb-2 text-sm font-medium text-blue-800">How to get credentials:</p>
                <ol className="ml-4 list-decimal space-y-1 text-xs text-blue-700">
                  <li>Go to <span className="font-medium">developers.facebook.com</span></li>
                  <li>Create/select app -&gt; Add WhatsApp product</li>
                  <li>Get Phone Number ID and WABA ID from API Setup</li>
                  <li>Generate Permanent Token from System Users</li>
                  <li>Use IDs from the same WABA and a token with WhatsApp messaging + management access</li>
                </ol>
              </div>
              <form onSubmit={handleConnect} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Access Token</label>
                  <input type="password" value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" required />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Phone Number ID</label>
                    <input type="text" value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" required />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">WABA ID</label>
                    <input type="text" value={form.wabaId} onChange={(e) => setForm({ ...form, wabaId: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" required />
                  </div>
                </div>
                <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setShowConnect(false)} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={connecting} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 hover:bg-primary-hover disabled:opacity-50">
                    {connecting ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── Account list ─────────────────────────────────────────────── */}
          {accounts.length === 0 ? (
            <div className="py-10 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
                <IoWarning className="text-2xl text-gray-300" />
              </div>
              <p className="font-medium text-gray-500">No account connected</p>
              <p className="mt-1 text-sm text-gray-400">Connect your WhatsApp Business account to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div key={account.id} className={`rounded-xl border transition-all ${activeAccount?.id === account.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}>
                  {/* ── Account row ────────────────────────────────────────── */}
                  <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 h-3 w-3 flex-shrink-0 rounded-full ${account.status === 'active' ? 'bg-emerald-500 ring-emerald-200' : 'bg-amber-500 ring-amber-200'} ring-2 ring-offset-2`} />
                      <div>
                        <p className="font-semibold text-gray-800">{account.businessName || 'WhatsApp Account'}</p>
                        <p className="text-sm text-gray-500">{account.phoneNumber}</p>
                        {account.status !== 'active' && (
                          <p className="mt-1 text-xs text-amber-600">Reconnect this account with a fresh access token.</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {activeAccount?.id !== account.id ? (
                        <button onClick={() => setActiveAccount(account)} className="rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-hover">Set Active</button>
                      ) : (
                        <span className="flex items-center gap-1 rounded-xl bg-primary/10 px-3 py-2 text-xs font-medium text-primary"><IoCheckmarkCircle /> Active</span>
                      )}

                      {/* Edit button */}
                      <button
                        onClick={() => editingId === account.id ? cancelEdit() : openEdit(account)}
                        title="Edit credentials"
                        className={`rounded-xl p-2 transition-all ${editingId === account.id ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:bg-primary/10 hover:text-primary'}`}
                      >
                        <IoPencil className="text-sm" />
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={async () => {
                          const approved = await confirm({
                            title: 'Disconnect Account',
                            message: 'Disconnect this WhatsApp account from the app?',
                            confirmLabel: 'Disconnect',
                          });
                          if (approved) deleteAccount(account.id);
                        }}
                        title="Disconnect account"
                        className="rounded-xl p-2 text-gray-300 transition-all hover:bg-red-50 hover:text-red-500"
                      >
                        <IoTrash className="text-sm" />
                      </button>
                    </div>
                  </div>

                  {/* ── Inline edit form ───────────────────────────────────── */}
                  {editingId === account.id && (
                    <div className="border-t border-dashed border-gray-200 bg-gray-50/60 px-4 pb-4 pt-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Edit Credentials</p>
                      <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-700">
                        If Meta returns 100/33, reconnect with a permanent token that owns both the WABA ID and Phone Number ID.
                      </div>
                      <form onSubmit={handleUpdate} className="space-y-3">
                        {/* Access Token with show/hide */}
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-gray-700">Access Token</label>
                          <div className="relative">
                            <input
                              type={showToken ? 'text' : 'password'}
                              value={editForm.accessToken}
                              onChange={(e) => setEditForm({ ...editForm, accessToken: e.target.value })}
                              placeholder="Enter access token"
                              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-3 pr-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                            <button
                              type="button"
                              onClick={() => setShowToken(!showToken)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                              title={showToken ? 'Hide token' : 'Show token'}
                            >
                              {showToken ? <IoEyeOff className="text-base" /> : <IoEye className="text-base" />}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-gray-700">Phone Number ID</label>
                            <input
                              type="text"
                              value={editForm.phoneNumberId}
                              onChange={(e) => setEditForm({ ...editForm, phoneNumberId: e.target.value })}
                              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-gray-700">WABA ID</label>
                            <input
                              type="text"
                              value={editForm.wabaId}
                              onChange={(e) => setEditForm({ ...editForm, wabaId: e.target.value })}
                              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                          <button type="button" onClick={cancelEdit} className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50">
                            <IoClose /> Cancel
                          </button>
                          <button type="submit" disabled={saving} className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm shadow-primary/25 hover:bg-primary-hover disabled:opacity-50">
                            <IoSave /> {saving ? 'Saving...' : 'Save Changes'}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Webhook Configuration card ─────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <IoKey className="text-lg text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold">Webhook Configuration</h2>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">Webhook URL</p>
              <code className="inline-block break-all rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm text-blue-600">https://your-domain.com/webhook</code>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">Verify Token</p>
              <code className="inline-block break-all rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm text-blue-600">Set in server/.env (WEBHOOK_VERIFY_TOKEN)</code>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">Subscribed Fields</p>
              <code className="inline-block break-all rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm text-blue-600">messages</code>
            </div>
          </div>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}

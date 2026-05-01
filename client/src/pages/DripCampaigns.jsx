import { useCallback, useEffect, useState } from 'react';
import { IoAdd, IoTrash, IoPlay, IoPause, IoStatsChart, IoClose, IoWater } from 'react-icons/io5';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAccountStore from '../store/accountStore';
import AppSelect from '../components/ui/AppSelect';
import useConfirmDialog from '../hooks/useConfirmDialog';
import { showApiError } from '../utils/apiError';

const statusColors = {
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  active: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  paused: 'bg-amber-50 text-amber-600 border-amber-200',
  completed: 'bg-blue-50 text-blue-600 border-blue-200',
};

function formatDelay(minutes) {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

const DELAY_OPTIONS = [
  { label: 'Immediately', value: 0 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '3 hours', value: 180 },
  { label: '6 hours', value: 360 },
  { label: '12 hours', value: 720 },
  { label: '1 day', value: 1440 },
  { label: '2 days', value: 2880 },
  { label: '3 days', value: 4320 },
  { label: '5 days', value: 7200 },
  { label: '7 days', value: 10080 },
  { label: '14 days', value: 20160 },
  { label: '30 days', value: 43200 },
];

export default function DripCampaigns() {
  const { activeAccount } = useAccountStore();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [statsView, setStatsView] = useState(null);
  const [form, setForm] = useState({ name: '', groupId: '', steps: [{ delayMinutes: 0, templateId: '' }] });
  const groupOptions = [
    { value: '', label: 'Select group...' },
    ...groups.map((group) => ({ value: String(group.id), label: `${group.name} (${group.contactCount})` })),
  ];
  const templateOptions = [
    { value: '', label: 'Select template...' },
    ...templates.map((template) => ({ value: String(template.id), label: template.name })),
  ];

  const loadDripData = useCallback(async () => {
    if (!activeAccount?.id) {
      setCampaigns([]);
      setTemplates([]);
      setGroups([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [campaignResponse, templateResponse, groupResponse] = await Promise.all([
        api.get(`/drip-campaigns/${activeAccount.id}`),
        api.get(`/templates/${activeAccount.id}`),
        api.get(`/contact-groups/${activeAccount.id}`),
      ]);
      setCampaigns(campaignResponse.data.dripCampaigns);
      setTemplates(templateResponse.data.templates.filter((template) => template.status === 'APPROVED'));
      setGroups(groupResponse.data.groups);
    } catch (error) {
      showApiError(error, 'Failed to load drip campaigns');
    }
    setLoading(false);
  }, [activeAccount]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadDripData();
    });
  }, [loadDripData]);

  const addStep = () => {
    setForm({ ...form, steps: [...form.steps, { delayMinutes: 1440, templateId: '' }] });
  };

  const removeStep = (index) => {
    setForm({ ...form, steps: form.steps.filter((_, currentIndex) => currentIndex !== index) });
  };

  const updateStep = (index, field, value) => {
    const steps = [...form.steps];
    steps[index] = { ...steps[index], [field]: value };
    setForm({ ...form, steps });
  };

  const create = async (e) => {
    e.preventDefault();
    if (form.steps.some((step) => !step.templateId)) {
      toast.error('Select template for all steps');
      return;
    }

    try {
      await api.post(`/drip-campaigns/${activeAccount.id}`, form);
      toast.success('Created');
      setShowForm(false);
      setForm({ name: '', groupId: '', steps: [{ delayMinutes: 0, templateId: '' }] });
      await loadDripData();
    } catch (error) {
      showApiError(error, 'Failed to create drip campaign');
    }
  };

  const activate = async (id) => {
    try {
      const { data } = await api.post(`/drip-campaigns/${id}/activate`);
      toast.success(`Activated! Enrolled: ${data.enrolledCount}`);
      await loadDripData();
    } catch (error) {
      showApiError(error, 'Failed to activate drip campaign');
    }
  };

  const pause = async (id) => {
    try { await api.post(`/drip-campaigns/${id}/pause`); await loadDripData(); } catch (error) { showApiError(error, 'Failed to pause drip campaign'); }
  };

  const viewStats = async (id) => {
    try { const { data } = await api.get(`/drip-campaigns/${id}/stats`); setStatsView(data); } catch (error) { showApiError(error, 'Failed to load drip campaign stats'); }
  };

  const remove = async (id) => {
    const approved = await confirm({
      title: 'Delete Drip Campaign',
      message: 'Delete this drip campaign permanently?',
      confirmLabel: 'Delete Campaign',
    });
    if (!approved) return;
    try { await api.delete(`/drip-campaigns/${id}`); await loadDripData(); } catch (error) { showApiError(error, 'Failed to delete drip campaign'); }
  };

  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Drip Campaigns</h1>
            <p className="mt-0.5 text-sm text-gray-500">Automated sequence of messages over time</p>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover sm:w-auto">
            <IoAdd /> New Drip Campaign
          </button>
        </div>

        {showForm && (
          <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">New Drip Campaign</h2>
            <form onSubmit={create} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Campaign Name</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" required />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Contact Group</label>
                  <AppSelect value={form.groupId} onChange={(value) => setForm({ ...form, groupId: value })} options={groupOptions} />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Steps</label>
                <div className="space-y-3">
                  {form.steps.map((step, index) => (
                    <div key={index} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 md:flex-row md:items-center">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">{index + 1}</div>
                      <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
                        <AppSelect
                          value={step.delayMinutes}
                          onChange={(value) => updateStep(index, 'delayMinutes', parseInt(value, 10))}
                          options={DELAY_OPTIONS.map((option) => ({ value: String(option.value), label: `${index === 0 ? 'Start' : 'Wait'}: ${option.label}` }))}
                          buttonClassName="bg-white"
                        />
                        <AppSelect
                          value={step.templateId}
                          onChange={(value) => updateStep(index, 'templateId', value)}
                          options={templateOptions}
                          buttonClassName="bg-white"
                        />
                      </div>
                      {form.steps.length > 1 && (
                        <button type="button" onClick={() => removeStep(index)} className="self-end p-1 text-gray-400 hover:text-red-500 md:self-auto"><IoTrash /></button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addStep} className="mt-2 flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  <IoAdd /> Add Step
                </button>
              </div>

              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 hover:bg-primary-hover">Create</button>
              </div>
            </form>
          </div>
        )}

        {statsView && (
          <div className="app-modal-overlay z-50 bg-black/50" onClick={() => setStatsView(null)}>
            <div className="app-modal-scroll-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-bold">{statsView.dripCampaign.name}</h2>
                <button onClick={() => setStatsView(null)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"><IoClose /></button>
              </div>
              <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-center"><p className="text-2xl font-bold text-blue-600">{statsView.stats.total}</p><p className="mt-0.5 text-xs text-gray-500">Total</p></div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-center"><p className="text-2xl font-bold text-emerald-600">{statsView.stats.completed}</p><p className="mt-0.5 text-xs text-gray-500">Completed</p></div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-center"><p className="text-2xl font-bold text-amber-600">{statsView.stats.active}</p><p className="mt-0.5 text-xs text-gray-500">Active</p></div>
              </div>
              <div className="space-y-2">
                <h3 className="mb-2 text-sm font-medium text-gray-700">{`Steps (${statsView.dripCampaign.steps.length})`}</h3>
                {statsView.dripCampaign.steps.map((step, index) => (
                  <div key={index} className="flex items-center gap-2 rounded-lg bg-gray-50 p-2 text-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                    <span className="text-gray-500">{`After ${formatDelay(step.delayMinutes)}`}</span>
                    <span className="text-gray-400">{'->'}</span>
                    <span className="font-medium text-gray-700">{`Template #${step.templateId}`}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                <h3 className="mb-2 text-sm font-medium text-gray-700">Enrollments</h3>
                {statsView.dripCampaign.enrollments?.map((enrollment) => (
                  <div key={enrollment.id} className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2 text-sm">
                    <span className="font-medium">{enrollment.contact?.name || enrollment.contact?.phone}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{`Step ${enrollment.currentStep + 1}/${statsView.dripCampaign.steps.length}`}</span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                        enrollment.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                        enrollment.status === 'active' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'
                      }`}>{enrollment.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100"><IoWater className="text-3xl text-gray-300" /></div>
            <p className="font-medium text-gray-500">No drip campaigns yet</p>
            <p className="mt-1 text-sm text-gray-400">Create automated message sequences</p>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-3">
                      <h3 className="font-semibold text-gray-800">{campaign.name}</h3>
                      <span className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${statusColors[campaign.status]}`}>{campaign.status}</span>
                    </div>
                    <p className="text-sm text-gray-500">{`Group: ${campaign.group?.name || 'N/A'} | ${campaign.steps?.length || 0} steps`}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:ml-4 lg:flex-shrink-0 lg:justify-end">
                    {(campaign.status === 'draft' || campaign.status === 'paused') && (
                      <button onClick={() => activate(campaign.id)} className="flex items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-100">
                        <IoPlay /> Activate
                      </button>
                    )}
                    {campaign.status === 'active' && (
                      <button onClick={() => pause(campaign.id)} className="flex items-center gap-1.5 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-600 hover:bg-amber-100">
                        <IoPause /> Pause
                      </button>
                    )}
                    <button onClick={() => viewStats(campaign.id)} className="flex items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-100">
                      <IoStatsChart /> Stats
                    </button>
                    <button onClick={() => remove(campaign.id)} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100">
                      <IoTrash />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}

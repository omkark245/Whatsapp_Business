import { useEffect, useEffectEvent, useState } from 'react';
import { IoStatsChart, IoTrendingUp, IoSend, IoCheckmarkDone, IoAlert, IoPeople, IoMegaphone } from 'react-icons/io5';
import api from '../services/api';
import useAccountStore from '../store/accountStore';
import ErrorDetails from '../components/ui/ErrorDetails';
import PaginationBar from '../components/ui/PaginationBar';
import { showApiError } from '../utils/apiError';

const DEFAULT_CAMPAIGNS_PER_PAGE = 20;
const PAGE_SIZE_OPTIONS = [20, 40, 80, 100];
const TREND_DAYS_VISIBLE = 10;

const STAT_STYLES = {
  blue: { container: 'bg-blue-50', icon: 'text-blue-500', accent: 'from-blue-200/70 to-blue-50/0' },
  emerald: { container: 'bg-emerald-50', icon: 'text-emerald-500', accent: 'from-emerald-200/70 to-emerald-50/0' },
  purple: { container: 'bg-purple-50', icon: 'text-purple-500', accent: 'from-purple-200/70 to-purple-50/0' },
  amber: { container: 'bg-amber-50', icon: 'text-amber-500', accent: 'from-amber-200/70 to-amber-50/0' },
  teal: { container: 'bg-teal-50', icon: 'text-teal-500', accent: 'from-teal-200/70 to-teal-50/0' },
  red: { container: 'bg-red-50', icon: 'text-red-500', accent: 'from-red-200/70 to-red-50/0' },
};

const CAMPAIGN_STATUS_STYLES = {
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  running: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  scheduled: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  draft: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  cancelled: 'bg-red-50 text-red-700 ring-1 ring-red-200',
};

const TREND_STYLES = {
  messages: {
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    highlight: 'border-emerald-100 bg-emerald-50/80',
    value: 'text-emerald-800',
  },
  contacts: {
    bar: 'bg-blue-500',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
    highlight: 'border-blue-100 bg-blue-50/80',
    value: 'text-blue-800',
  },
};

function formatMetric(value) {
  const number = Number(value) || 0;
  return number.toLocaleString(undefined, {
    maximumFractionDigits: Number.isInteger(number) ? 0 : 1,
  });
}

function StatCard({ icon, label, value, color, sub }) {
  const IconComponent = icon;
  const styles = STAT_STYLES[color] || STAT_STYLES.blue;

  return (
    <div className="relative overflow-hidden rounded-[26px] border border-slate-200/80 bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)] sm:p-5">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-br ${styles.accent}`} />
      <div className="relative">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${styles.container}`}>
            <IconComponent className={`${styles.icon} text-lg`} />
          </div>
          <p className="pt-1 text-right text-sm font-semibold text-slate-500">{label}</p>
        </div>
        <p className="mt-2 break-words text-[1.9rem] font-bold leading-none text-slate-900 sm:text-3xl">{value}</p>
        {sub && <p className="mt-2 text-[11px] leading-4 text-slate-400 sm:text-xs">{sub}</p>}
      </div>
    </div>
  );
}

function TrendSummary({ label, value, hint, highlight, styles }) {
  return (
    <div className={`rounded-xl border px-2.5 py-2 ${highlight ? styles.highlight : 'border-slate-100 bg-slate-50/70'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className={`mt-1.5 text-xl font-bold leading-none ${highlight ? styles.value : 'text-slate-900'}`}>{formatMetric(value)}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{hint}</p>}
    </div>
  );
}

function SimpleBarChart({ data, styles }) {
  if (!data || data.length === 0) return <p className="py-8 text-center text-sm text-gray-400">No data yet</p>;
  const max = Math.max(...data.map((item) => item.count), 1);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[64px_minmax(0,1fr)_54px] items-center gap-3 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:grid-cols-[76px_minmax(0,1fr)_64px]">
        <span>Date</span>
        <span>Activity</span>
        <span className="text-right">Count</span>
      </div>
      {data.slice(-14).map((item, index) => (
        <div key={index} className="grid grid-cols-[58px_minmax(0,1fr)_48px] items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 px-2 py-1.5 sm:grid-cols-[68px_minmax(0,1fr)_56px]">
          <span className="text-xs font-semibold text-slate-600 sm:text-sm">{item.date}</span>
          <div className="h-2 overflow-hidden rounded-full bg-white shadow-inner shadow-slate-200/70">
            <div
              className={`h-full rounded-full transition-all duration-500 ${styles.bar}`}
              style={{ width: item.count > 0 ? `${Math.max((item.count / max) * 100, 7)}%` : '0%' }}
            />
          </div>
          <span className="rounded-lg bg-white px-2 py-0.5 text-right text-xs font-bold text-slate-800 shadow-sm ring-1 ring-slate-100">
            {formatMetric(item.count)}
          </span>
        </div>
      ))}
    </div>
  );
}

function TrendCard({ title, data, tone = 'messages' }) {
  const visibleData = data.slice(-TREND_DAYS_VISIBLE);
  const total = visibleData.reduce((sum, item) => sum + item.count, 0);
  const peak = visibleData.reduce((best, item) => (item.count > (best?.count || 0) ? item : best), null);
  const average = visibleData.length > 0 ? total / visibleData.length : 0;
  const styles = TREND_STYLES[tone] || TREND_STYLES.messages;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_12px_26px_-22px_rgba(15,23,42,0.25)] sm:p-4">
      <div>
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {visibleData.length > 0 ? `Showing ${visibleData.length} recent day${visibleData.length === 1 ? '' : 's'}` : 'No recent activity'}
          </p>
        </div>
      </div>

      <div className="my-3 grid grid-cols-3 gap-2">
        <TrendSummary label="Total" value={total} highlight styles={styles} />
        <TrendSummary label="Best day" value={peak?.count || 0} hint={peak?.date} styles={styles} />
        <TrendSummary label="Daily avg" value={average} styles={styles} />
      </div>

      <SimpleBarChart data={visibleData} styles={styles} />
    </div>
  );
}

function toCampaignPercent(value, total) {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function formatCampaignDate(value) {
  return new Date(value).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function CampaignMetricTableCell({ value, percent, valueClassName = 'text-slate-900', percentClassName = 'text-slate-400' }) {
  return (
    <div className="min-w-[70px] text-right">
      <p className={`text-sm font-bold sm:text-base ${valueClassName}`}>{formatMetric(value)}</p>
      <p className={`mt-0.5 text-[11px] font-medium ${percentClassName}`}>{percent}%</p>
    </div>
  );
}

function CampaignPerformanceTableRow({ campaign }) {
  const totalMessages = campaign.totalMessages || 0;
  const queuedCount = campaign.sentCount || 0;
  const deliveredCount = campaign.deliveredCount || 0;
  const failedCount = campaign.failedCount || 0;
  const queuedPct = toCampaignPercent(queuedCount, totalMessages);
  const deliveredPct = toCampaignPercent(deliveredCount, totalMessages);
  const failedPct = toCampaignPercent(failedCount, totalMessages);
  const statusClassName = CAMPAIGN_STATUS_STYLES[campaign.status] || CAMPAIGN_STATUS_STYLES.draft;
  const recipientLabel = `${totalMessages} recipient${totalMessages === 1 ? '' : 's'}`;

  return (
    <tr className="border-t border-slate-100 align-top first:border-t-0">
      <td className="px-4 py-3 sm:px-5">
        <div className="min-w-[220px]">
          <p className="break-words text-sm font-semibold text-slate-950 sm:text-[15px]">{campaign.name}</p>
          <p className="mt-1 text-xs text-slate-500">{recipientLabel}</p>
        </div>
      </td>
      <td className="px-4 py-3 sm:px-5">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${statusClassName}`}>
          {campaign.status}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 sm:px-5">
        {formatCampaignDate(campaign.createdAt)}
      </td>
      <td className="px-4 py-3 sm:px-5">
        <div className="min-w-[70px] text-right">
          <p className="text-sm font-bold text-slate-900 sm:text-base">{formatMetric(totalMessages)}</p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">100%</p>
        </div>
      </td>
      <td className="px-4 py-3 sm:px-5">
        <CampaignMetricTableCell value={queuedCount} percent={queuedPct} valueClassName="text-emerald-700" percentClassName="text-emerald-500" />
      </td>
      <td className="px-4 py-3 sm:px-5">
        <CampaignMetricTableCell value={deliveredCount} percent={deliveredPct} valueClassName="text-blue-700" percentClassName="text-blue-500" />
      </td>
      <td className="px-4 py-3 sm:px-5">
        <CampaignMetricTableCell value={failedCount} percent={failedPct} valueClassName="text-rose-700" percentClassName="text-rose-500" />
      </td>
    </tr>
  );
}

export default function Analytics() {
  const { activeAccount } = useAccountStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignPageSize, setCampaignPageSize] = useState(DEFAULT_CAMPAIGNS_PER_PAGE);
  const [loadError, setLoadError] = useState(null);

  const loadAnalytics = useEffectEvent(async () => {
    if (!activeAccount?.id) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const { data: response } = await api.get(`/analytics/${activeAccount.id}`, { params: { days } });
      setData(response);
    } catch (error) {
      setLoadError(error);
      showApiError(error, 'Failed to load analytics');
    }
    setLoading(false);
  });

  useEffect(() => { void loadAnalytics(); }, [activeAccount?.id, days]);

  const inboundByDate = {};
  const outboundByDate = {};
  data?.dailyMessages?.forEach((dayItem) => {
    if (dayItem.direction === 'inbound') inboundByDate[dayItem.date] = parseInt(dayItem.count, 10);
    else outboundByDate[dayItem.date] = parseInt(dayItem.count, 10);
  });

  const allDates = [...new Set([...Object.keys(inboundByDate), ...Object.keys(outboundByDate)])].sort();
  const totalInbound = allDates.reduce((sum, date) => sum + (inboundByDate[date] || 0), 0);
  const totalOutbound = allDates.reduce((sum, date) => sum + (outboundByDate[date] || 0), 0);

  const messageChart = allDates.map((date) => ({
    date: new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    count: (inboundByDate[date] || 0) + (outboundByDate[date] || 0),
  }));

  const contactChart = data?.contactGrowth?.map((item) => ({
    date: new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    count: parseInt(item.count, 10),
  })) || [];

  const campaignStats = data?.campaignStats || {};
  const campaigns = data?.campaigns || [];
  const totalCampaignPages = Math.max(1, Math.ceil(campaigns.length / campaignPageSize));
  const safeCampaignPage = Math.min(campaignPage, totalCampaignPages);
  const campaignStartIndex = (safeCampaignPage - 1) * campaignPageSize;
  const visibleCampaigns = campaigns.slice(campaignStartIndex, campaignStartIndex + campaignPageSize);

  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Analytics</h1>
            <p className="mt-2 text-sm text-gray-500">Campaign performance and messaging insights.</p>
          </div>
          <div className="grid w-full grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto">
              {[7, 14, 30, 90].map((dayOption) => (
                <button key={dayOption} onClick={() => {
                  setCampaignPage(1);
                  setDays(dayOption);
                }}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                    days === dayOption
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }`}>
                  {dayOption}d
                </button>
              ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
        ) : loadError ? (
          <ErrorDetails error={loadError} fallback="Failed to load analytics" title="Analytics could not load" />
        ) : !data ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100"><IoStatsChart className="text-3xl text-gray-300" /></div>
            <p className="font-medium text-gray-500">No analytics data yet</p>
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <StatCard icon={IoPeople} label="Total Contacts" value={data.totalContacts || 0} color="blue" />
              <StatCard icon={IoSend} label="Messages Sent" value={totalOutbound} color="emerald" />
              <StatCard icon={IoTrendingUp} label="Messages Received" value={totalInbound} color="purple" />
              <StatCard icon={IoMegaphone} label="Campaigns" value={campaignStats.totalCampaigns || 0} color="amber" />
              <StatCard icon={IoCheckmarkDone} label="Campaign Delivered" value={campaignStats.totalDelivered || 0} color="teal" />
              <StatCard icon={IoAlert} label="Campaign Failed" value={campaignStats.totalFailed || 0} color="red" />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <TrendCard title="Messages Over Time" data={messageChart} tone="messages" />
              <TrendCard title="New Contacts" data={contactChart} tone="contacts" />
            </div>

            <div className="rounded-[34px] border border-slate-200/80 bg-white px-5 py-6 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.28)] sm:px-6 sm:py-7">
              <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-[1.75rem]">Campaign Performance</h3>
                  <p className="mt-1 text-sm text-slate-500 sm:text-[0.95rem]">A delivery strength, and failed sends for each campaign.</p>
                </div>
                
              </div>
              {campaigns.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">No campaigns in this period</p>
              ) : (
                <>
                  <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse">
                        <thead className="bg-slate-50/90">
                          <tr className="text-left">
                            <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:px-5">Campaign</th>
                            <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:px-5">Status</th>
                            <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:px-5">Created</th>
                            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:px-5">Total</th>
                            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:px-5">Queued</th>
                            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:px-5">Delivered</th>
                            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:px-5">Failed</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {visibleCampaigns.map((campaign) => (
                            <CampaignPerformanceTableRow key={campaign.id} campaign={campaign} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <PaginationBar
                    className="mt-5"
                    page={safeCampaignPage}
                    totalPages={totalCampaignPages}
                    pageSize={campaignPageSize}
                    totalItems={campaigns.length}
                    onPageChange={setCampaignPage}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageSizeChange={(size) => {
                      setCampaignPageSize(size || DEFAULT_CAMPAIGNS_PER_PAGE);
                      setCampaignPage(1);
                    }}
                  />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

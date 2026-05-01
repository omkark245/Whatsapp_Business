import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import {
  IoCard,
  IoChatboxEllipses,
  IoCheckmarkDone,
  IoLayers,
  IoReceipt,
  IoSend,
  IoWarning,
} from 'react-icons/io5';
import api from '../services/api';
import useAccountStore from '../store/accountStore';
import ErrorDetails from '../components/ui/ErrorDetails';
import { showApiError } from '../utils/apiError';

const STORAGE_KEY_PREFIX = 'usage-rate-card';

const DEFAULT_RATE_CARD = {
  MARKETING: '',
  UTILITY: '',
  AUTHENTICATION: '',
  UNKNOWN: '',
};

function getStorageKey(accountId) {
  return `${STORAGE_KEY_PREFIX}:${accountId || 'default'}`;
}

function getStoredRateCard(accountId) {
  try {
    const stored = window.localStorage.getItem(getStorageKey(accountId));
    if (!stored) return DEFAULT_RATE_CARD;
    const parsed = JSON.parse(stored);
    return { ...DEFAULT_RATE_CARD, ...parsed };
  } catch {
    return DEFAULT_RATE_CARD;
  }
}

function parseRate(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

const STAT_STYLES = {
  emerald: { container: 'bg-emerald-50', icon: 'text-emerald-500', accent: 'from-emerald-200/70 to-emerald-50/0' },
  blue: { container: 'bg-blue-50', icon: 'text-blue-500', accent: 'from-blue-200/70 to-blue-50/0' },
  purple: { container: 'bg-purple-50', icon: 'text-purple-500', accent: 'from-purple-200/70 to-purple-50/0' },
  amber: { container: 'bg-amber-50', icon: 'text-amber-500', accent: 'from-amber-200/70 to-amber-50/0' },
  red: { container: 'bg-red-50', icon: 'text-red-500', accent: 'from-red-200/70 to-red-50/0' },
  teal: { container: 'bg-teal-50', icon: 'text-teal-500', accent: 'from-teal-200/70 to-teal-50/0' },
};

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function StatCard({ icon, label, value, color, sub, valueClassName = '' }) {
  const IconComponent = icon;
  const styles = STAT_STYLES[color] || STAT_STYLES.blue;

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-slate-200/80 bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.07)] sm:p-4">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-br ${styles.accent}`} />
      <div className="relative">
        <div className="mb-3 flex items-start justify-between gap-2.5">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] ${styles.container}`}>
            <IconComponent className={`${styles.icon} text-base`} />
          </div>
          <p className="pt-0.5 text-right text-[13px] font-semibold text-slate-500 sm:text-sm">{label}</p>
        </div>
        <p className={`mt-1 break-words text-[1.7rem] font-bold leading-none text-slate-900 sm:text-[2rem] ${valueClassName}`}>{value}</p>
        {sub ? <p className="mt-1.5 text-[10px] leading-4 text-slate-400 sm:text-[11px]">{sub}</p> : null}
      </div>
    </div>
  );
}

function MiniUsageChart({ data }) {
  if (!data?.length) {
    return <p className="py-8 text-center text-sm text-gray-400">No outbound activity in this range</p>;
  }

  const max = Math.max(...data.map((item) => item.outbound), 1);

  return (
    <div className="space-y-2">
      {data.slice(-10).map((item) => (
        <div key={item.date} className="flex items-center gap-3">
          <span className="w-16 flex-shrink-0 text-xs text-gray-500 sm:w-20">
            {new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </span>
          <div className="h-6 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className="flex h-full items-center justify-end rounded-full bg-primary/75 pr-2 text-[10px] font-medium text-white transition-all duration-500"
              style={{ width: `${Math.max((item.outbound / max) * 100, 8)}%` }}
            >
              {item.outbound}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SimpleUsagePanel({ title, description, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function EmptyTableMessage({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-5 text-center text-xs text-slate-400">
        {children}
      </td>
    </tr>
  );
}

function UsageContent({ activeAccount }) {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [rateCard, setRateCard] = useState(() => getStoredRateCard(activeAccount?.id));

  useEffect(() => {
    if (!activeAccount?.id) return;
    window.localStorage.setItem(getStorageKey(activeAccount.id), JSON.stringify(rateCard));
  }, [activeAccount?.id, rateCard]);

  const loadUsage = useEffectEvent(async () => {
    if (!activeAccount?.id) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const response = await api.get(`/analytics/${activeAccount.id}/usage`, {
        params: { days },
      });
      setData(response.data);
    } catch (error) {
      setLoadError(error);
      showApiError(error, 'Failed to load usage');
    }
    setLoading(false);
  });

  useEffect(() => {
    void loadUsage();
  }, [activeAccount?.id, days]);

  const rateFields = [
    { key: 'MARKETING', label: 'Marketing' },
    { key: 'UTILITY', label: 'Utility' },
    { key: 'AUTHENTICATION', label: 'Authentication' },
    { key: 'UNKNOWN', label: 'Unknown' },
  ];

  const pricedCategoryBreakdown = useMemo(() => (data?.categoryBreakdown || []).map((item) => {
    const configuredRate = parseRate(rateCard[item.category]);
    return {
      ...item,
      configuredRate,
      estimate: configuredRate === null ? null : item.delivered * configuredRate,
    };
  }), [data?.categoryBreakdown, rateCard]);

  const deliveredTemplateMessages = pricedCategoryBreakdown.reduce((sum, item) => sum + item.delivered, 0);
  const queuedTemplateMessages = data?.usageSummary?.queuedTemplateMessages || 0;
  const unpricedDeliveredTemplateMessages = pricedCategoryBreakdown.reduce(
    (sum, item) => sum + (item.configuredRate === null ? item.delivered : 0),
    0
  );
  const hasConfiguredRate = rateFields.some((field) => parseRate(rateCard[field.key]) !== null);
  const estimatedCost = pricedCategoryBreakdown.reduce((sum, item) => sum + (item.estimate || 0), 0);
  const showUnsetRateState = deliveredTemplateMessages > 0 && !hasConfiguredRate;
  const showPartialRateState =
    deliveredTemplateMessages > 0 &&
    hasConfiguredRate &&
    unpricedDeliveredTemplateMessages > 0;
  const estimatedCostValue = showUnsetRateState ? 'Set rates' : formatCurrency(estimatedCost);
  const deliveredMessagesSub = `${deliveredTemplateMessages} delivered template message${deliveredTemplateMessages === 1 ? '' : 's'} in pricing`;
  const estimatedCostSub = showUnsetRateState
    ? `${deliveredTemplateMessages} delivered template messages waiting for pricing`
    : showPartialRateState
      ? `${unpricedDeliveredTemplateMessages} delivered template messages still missing rates`
      : `${deliveredTemplateMessages} delivered template message${deliveredTemplateMessages === 1 ? '' : 's'} priced`;

  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Usage & Cost</h1>
            <p className="mt-2 text-sm text-gray-500">
              Count outbound messages and estimate Meta charges from delivered template traffic.
            </p>
          </div>

          <div className="grid w-full grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto">
              {[7, 14, 30, 90].map((dayOption) => (
                <button
                  key={dayOption}
                  type="button"
                  onClick={() => setDays(dayOption)}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                    days === dayOption
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                >
                  {dayOption}d
                </button>
              ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : loadError ? (
          <ErrorDetails error={loadError} fallback="Failed to load usage" title="Usage could not load" />
        ) : !data ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100">
              <IoReceipt className="text-3xl text-gray-300" />
            </div>
            <p className="font-medium text-gray-500">No usage data yet</p>
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6">
              <StatCard
                icon={IoSend}
                label="Outbound"
                value={data.usageSummary?.totalOutbound || 0}
                color="emerald"
              />
              <StatCard
                icon={IoChatboxEllipses}
                label="Inbound"
                value={data.usageSummary?.totalInbound || 0}
                color="blue"
              />
              <StatCard
                icon={IoLayers}
                label="Queued"
                value={data.usageSummary?.queued || 0}
                color="purple"
              />
              <StatCard
                icon={IoCheckmarkDone}
                label="Delivered All"
                value={data.usageSummary?.delivered || 0}
                color="teal"
                sub={deliveredMessagesSub}
              />
              <StatCard
                icon={IoWarning}
                label="Failed by Meta"
                value={data.usageSummary?.failed || 0}
                color="red"
              />
              <StatCard
                icon={IoCard}
                label="Estimated Cost"
                value={estimatedCostValue}
                color="amber"
                sub={estimatedCostSub}
                valueClassName={showUnsetRateState ? 'text-base sm:text-xl' : 'text-lg sm:text-[2rem]'}
              />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-gray-800">Outbound Trend</h2>
                    <p className="text-xs text-gray-400">Last {days} days</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {data.usageSummary?.templateMessages || 0} template sends
                  </span>
                </div>
                <MiniUsageChart data={data.dailyUsage} />
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-gray-800">Rate Card</h2>
                  <p className="text-xs text-gray-400">
                    Enter your current Meta rate per delivered template message. These rates are saved per
                    WhatsApp account in this browser.
                  </p>
                </div>

                {showUnsetRateState ? (
                  <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/80 p-3 text-xs text-blue-900">
                    Add your Meta per-message rates below to calculate the estimate for {deliveredTemplateMessages} delivered template messages.
                  </div>
                ) : null}

                {queuedTemplateMessages > 0 ? (
                  <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50/80 p-3 text-xs text-amber-900">
                    {queuedTemplateMessages} template message{queuedTemplateMessages === 1 ? '' : 's'} {queuedTemplateMessages === 1 ? 'is' : 'are'} still queued and not included in delivered pricing yet.
                  </div>
                ) : null}

                <div className="space-y-3">
                  {rateFields.map((field) => (
                    <label key={field.key} className="block">
                      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                        {field.label}
                      </span>
                      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-sm font-medium text-gray-500">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={rateCard[field.key] ?? ''}
                          placeholder="Enter rate"
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setRateCard((current) => ({ ...current, [field.key]: nextValue }));
                          }}
                          className="w-full bg-transparent text-sm font-medium text-gray-800 outline-none"
                        />
                      </div>
                    </label>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-xs text-amber-900">
                  {data.pricingNote}
                </div>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <SimpleUsagePanel title="Source Breakdown" description="Outbound traffic by source, including queued messages">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Source</th>
                        <th className="py-2 pr-3 font-medium">Total</th>
                        <th className="py-2 pr-3 font-medium">Queued</th>
                        <th className="py-2 pr-3 font-medium">Delivered</th>
                        <th className="py-2 font-medium">Failed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.sourceBreakdown?.length ? data.sourceBreakdown.map((row) => (
                        <tr key={row.key}>
                          <td className="py-2.5 pr-3 font-medium text-slate-800">{row.label}</td>
                          <td className="py-2.5 pr-3 text-slate-600">{row.total}</td>
                          <td className="py-2.5 pr-3 text-amber-600">{row.queued}</td>
                          <td className="py-2.5 pr-3 text-emerald-600">{row.delivered}</td>
                          <td className="py-2.5 text-red-500">{row.failed}</td>
                        </tr>
                      )) : (
                        <EmptyTableMessage colSpan="5">No outbound sources yet</EmptyTableMessage>
                      )}
                    </tbody>
                  </table>
                </div>
              </SimpleUsagePanel>

              <SimpleUsagePanel title="Template Cost Estimate" description="Delivered templates by category">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Category</th>
                        <th className="py-2 pr-3 font-medium">Delivered</th>
                        <th className="py-2 pr-3 font-medium">Rate</th>
                        <th className="py-2 font-medium">Estimate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pricedCategoryBreakdown.length ? pricedCategoryBreakdown.map((row) => (
                        <tr key={row.category}>
                          <td className="py-2.5 pr-3 font-medium text-slate-800">{row.category}</td>
                          <td className="py-2.5 pr-3 text-slate-600">{row.delivered}</td>
                          <td className="py-2.5 pr-3 text-slate-600">
                            {row.configuredRate === null ? (
                              <span className="font-medium text-amber-600">Not set</span>
                            ) : formatCurrency(row.configuredRate)}
                          </td>
                          <td className="py-2.5 font-semibold text-slate-900">
                            {row.estimate === null ? '-' : formatCurrency(row.estimate)}
                          </td>
                        </tr>
                      )) : (
                        <EmptyTableMessage colSpan="4">No template traffic yet</EmptyTableMessage>
                      )}
                    </tbody>
                  </table>
                </div>
              </SimpleUsagePanel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Usage() {
  const { activeAccount } = useAccountStore();
  return <UsageContent key={activeAccount?.id || 'no-account'} activeAccount={activeAccount} />;
}

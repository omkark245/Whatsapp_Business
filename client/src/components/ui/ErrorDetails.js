import React from 'react';
import { formatApiErrorDetail, normalizeApiError } from '../../utils/apiError.js';

const h = React.createElement;

function DetailList({ details }) {
  if (!details?.length) return null;

  return h(
    'div',
    { className: 'mt-3 space-y-1.5' },
    details.map((detail, index) => h(
      'div',
      {
        key: `${formatApiErrorDetail(detail)}-${index}`,
        className: 'rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-700',
      },
      formatApiErrorDetail(detail) || 'Additional error detail unavailable'
    ))
  );
}

export default function ErrorDetails({ error, fallback = 'Something went wrong', title = 'Action failed', className = '' }) {
  const normalized = normalizeApiError(error, fallback);
  const meta = [
    normalized.status ? `Status ${normalized.status}` : '',
    normalized.code || '',
    normalized.requestId ? `Request ${normalized.requestId}` : '',
  ].filter(Boolean);

  const copyRequestId = () => {
    if (normalized.requestId && navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(normalized.requestId);
    }
  };

  return h(
    'div',
    {
      role: 'alert',
      className: `rounded-2xl border border-red-100 bg-white p-4 text-left shadow-sm ${className}`.trim(),
    },
    h('p', { className: 'text-sm font-semibold text-red-700' }, title),
    h('p', { className: 'mt-1 text-sm leading-6 text-slate-700' }, normalized.message),
    meta.length > 0 && h(
      'div',
      { className: 'mt-3 flex flex-wrap gap-2' },
      meta.map((item) => h(
        'span',
        {
          key: item,
          className: 'rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600',
        },
        item
      )),
      normalized.requestId && h(
        'button',
        {
          type: 'button',
          onClick: copyRequestId,
          className: 'rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100',
        },
        'Copy request ID'
      )
    ),
    h(DetailList, { details: normalized.details })
  );
}

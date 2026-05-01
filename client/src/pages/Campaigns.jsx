import { useCallback, useEffect, useMemo, useState } from 'react';
import { IoAdd, IoPlay, IoTrash, IoStatsChart, IoMegaphone, IoClose, IoRefresh, IoCloudUpload } from 'react-icons/io5';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAccountStore from '../store/accountStore';
import AppSelect from '../components/ui/AppSelect';
import PaginationBar from '../components/ui/PaginationBar';
import SimpleDateTimePicker from '../components/ui/SimpleDateTimePicker';
import useConfirmDialog from '../hooks/useConfirmDialog';
import { getApiErrorDetails, showApiError } from '../utils/apiError';

const MAX_UPLOAD_BYTES = 35 * 1024 * 1024;
const DEFAULT_CAMPAIGN_PAGE_SIZE = 20;
const DEFAULT_SEND_INTERVAL_SECONDS = 3;
const PAGE_SIZE_OPTIONS = [20, 40, 80, 100];

const statusColors = {
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  scheduled: 'bg-blue-50 text-blue-600 border-blue-200',
  running: 'bg-amber-50 text-amber-600 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
};

function formatCampaignMessageStatus(status, failureSource = '') {
  if (status === 'sent') return 'Queued';
  if (status === 'delivered') return 'Delivered';
  if (status === 'read') return 'Read';
  if (status === 'failed') return String(failureSource || '').startsWith('meta') ? 'Failed by Meta' : 'Failed locally';
  return status || 'Unknown';
}

function isEcosystemEngagementFailure(campaignMessage = {}) {
  return String(campaignMessage.errorCode || '').includes('131049') ||
    /healthy ecosystem engagement/i.test(String(campaignMessage.errorMessage || ''));
}

function hasEcosystemEngagementFailures(campaign = {}) {
  return Array.isArray(campaign.campaignMessages) &&
    campaign.campaignMessages.some((message) => message.status === 'failed' && isEcosystemEngagementFailure(message));
}

function formatCampaignFailureMessage(campaignMessage = {}) {
  if (isEcosystemEngagementFailure(campaignMessage)) {
    return 'Meta blocked delivery to this recipient because of marketing engagement/frequency protections. Do not resend immediately; wait and retry later with a more relevant opted-in audience.';
  }

  return campaignMessage.errorMessage || 'No provider reason was saved for this failed attempt. Resend to capture the latest Meta error.';
}

function getCampaignRecipientLabel(campaignMessage = {}, index = 0) {
  return campaignMessage.contact?.phone || campaignMessage.contact?.waId || `Recipient ${index + 1}`;
}

function getCampaignRecipientName(campaignMessage = {}) {
  return String(campaignMessage.contact?.name || '').trim();
}

function getCampaignReportRows(campaign = {}) {
  return Array.isArray(campaign.campaignMessages)
    ? campaign.campaignMessages.map((campaignMessage, index) => ({
      name: getCampaignRecipientName(campaignMessage),
      recipient: getCampaignRecipientLabel(campaignMessage, index),
      status: formatCampaignMessageStatus(campaignMessage.status, campaignMessage.failureSource),
      errorCode: campaignMessage.errorCode || '',
      failureReason: campaignMessage.status === 'failed' ? formatCampaignFailureMessage(campaignMessage) : '',
    }))
    : [];
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapePdfText(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function slugifyFilename(value = '', fallback = 'campaign-report') {
  const normalized = String(value || '')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return normalized || fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function wrapReportLine(text = '', maxLength = 92) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines = [];
  let current = '';

  words.forEach((word) => {
    if (word.length > maxLength) {
      if (current) {
        lines.push(current);
        current = '';
      }

      for (let index = 0; index < word.length; index += maxLength) {
        lines.push(word.slice(index, index + maxLength));
      }
      return;
    }

    if (!current) {
      current = word;
      return;
    }

    const next = `${current} ${word}`;
    if (next.length > maxLength) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  return lines;
}

function buildPdfTextCommand(text, x, y, { font = 'F1', size = 10 } = {}) {
  return `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`;
}

function createPdfDocument(pageStreams, title = 'Campaign Report') {
  const pageHeight = 792;
  const objects = new Map();
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.set(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  let nextObjectId = 5;
  const pageObjectIds = [];

  pageStreams.forEach((streamBody) => {
    const pageId = nextObjectId;
    const contentId = nextObjectId + 1;
    nextObjectId += 2;
    pageObjectIds.push(pageId);

    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, `<< /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream`);
  });

  objects.set(2, `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`);

  const orderedIds = [1, 2, 3, 4, ...pageObjectIds.flatMap((pageId) => [pageId, pageId + 1])];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  orderedIds.forEach((id) => {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${orderedIds.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  orderedIds.forEach((id) => {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer << /Size ${orderedIds.length + 1} /Root 1 0 R /Info << /Title (${escapePdfText(title)}) >> >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

function createCampaignReportPdf(campaign = {}) {
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 36;
  const topMargin = 44;
  const bottomMargin = 40;
  const tableWidth = pageWidth - (marginX * 2);
  const headerHeight = 24;
  const rowPaddingY = 6;
  const rowLineHeight = 12;
  const rows = getCampaignReportRows(campaign);
  const title = campaign.name || 'Campaign Report';
  const generatedAt = new Date().toLocaleString();
  const columns = [
    { key: 'name', label: 'Name', width: 110, maxLength: 18 },
    { key: 'recipient', label: 'Recipient', width: 94, maxLength: 14 },
    { key: 'status', label: 'Status', width: 84, maxLength: 12 },
    { key: 'errorCode', label: 'Error Code', width: 72, maxLength: 10 },
    { key: 'failureReason', label: 'Failure Reason', width: 180, maxLength: 38 },
  ];
  const pageStreams = [];
  const summaryLines = [
    `Generated: ${generatedAt}`,
    `Total: ${campaign.totalMessages || 0}`,
    `Queued: ${campaign.sentCount || 0}`,
    `Delivered: ${campaign.deliveredCount || 0}`,
    `Read: ${campaign.readCount || 0}`,
    `Failed: ${campaign.failedCount || 0}`,
  ];

  let commands = [];
  let currentY = 0;

  const startPage = ({ includeSummary = false } = {}) => {
    commands = [];
    currentY = pageHeight - topMargin;

    commands.push(buildPdfTextCommand(title, marginX, currentY, { font: 'F2', size: 16 }));
    currentY -= 20;

    commands.push(buildPdfTextCommand(includeSummary ? summaryLines[0] : `Recipient Details - ${generatedAt}`, marginX, currentY, { size: 10 }));
    currentY -= 18;

    if (includeSummary) {
      summaryLines.slice(1).forEach((line) => {
        commands.push(buildPdfTextCommand(line, marginX, currentY, { size: 10 }));
        currentY -= 14;
      });
      currentY -= 6;
    }

    commands.push(buildPdfTextCommand('Recipient Details', marginX, currentY, { font: 'F2', size: 12 }));
    currentY -= 16;

    const headerBottomY = currentY - headerHeight;
    commands.push('0.96 g');
    commands.push(`${marginX} ${headerBottomY} ${tableWidth} ${headerHeight} re f`);
    commands.push('0.82 G 0.8 w');
    commands.push(`${marginX} ${headerBottomY} ${tableWidth} ${headerHeight} re S`);
    commands.push('0 g');

    let currentX = marginX;
    columns.forEach((column, index) => {
      if (index > 0) {
        commands.push('0.82 G 0.8 w');
        commands.push(`${currentX} ${headerBottomY} m ${currentX} ${currentY} l S`);
      }
      commands.push('0 g');
      commands.push(buildPdfTextCommand(column.label, currentX + 6, headerBottomY + 8, { font: 'F2', size: 9 }));
      currentX += column.width;
    });

    currentY = headerBottomY;
  };

  const finishPage = () => {
    pageStreams.push(commands.join('\n'));
  };

  const ensureRowSpace = (rowHeight) => {
    if (currentY - rowHeight >= bottomMargin) return;
    finishPage();
    startPage();
  };

  startPage({ includeSummary: true });

  const safeRows = rows.length > 0 ? rows : [{
    name: '-',
    recipient: 'No recipients',
    status: '-',
    errorCode: '-',
    failureReason: '-',
  }];

  safeRows.forEach((row) => {
    const wrappedCells = columns.map((column) => {
      const value = String(row[column.key] || '').trim();
      return wrapReportLine(value || '-', column.maxLength);
    });
    const rowLineCount = Math.max(...wrappedCells.map((cellLines) => cellLines.length));
    const rowHeight = Math.max(24, (rowLineCount * rowLineHeight) + (rowPaddingY * 2));

    ensureRowSpace(rowHeight);

    const rowTopY = currentY;
    const rowBottomY = rowTopY - rowHeight;
    commands.push('0.88 G 0.7 w');
    commands.push(`${marginX} ${rowBottomY} ${tableWidth} ${rowHeight} re S`);

    let currentX = marginX;
    columns.forEach((column, index) => {
      if (index > 0) {
        commands.push(`${currentX} ${rowBottomY} m ${currentX} ${rowTopY} l S`);
      }

      wrappedCells[index].forEach((line, lineIndex) => {
        commands.push('0 g');
        commands.push(buildPdfTextCommand(line, currentX + 6, rowTopY - 16 - (lineIndex * rowLineHeight), { size: 9 }));
      });

      currentX += column.width;
    });

    currentY = rowBottomY;
  });

  finishPage();
  return createPdfDocument(pageStreams, `${title} Report`);
}

function extractPlaceholderIndexes(text = '') {
  return [...new Set(
    [...String(text || '').matchAll(/\{\{(\d+)\}\}/g)]
      .map((match) => Number(match[1]))
      .filter((value) => Number.isInteger(value) && value > 0)
  )].sort((a, b) => a - b);
}

function createDefaultVariablesMapping(template) {
  const bodyParameters = extractPlaceholderIndexes(template?.body).map(() => ({
    source: 'contact',
    field: 'name',
    value: '',
  }));

  return {
    bodyParameters,
    headerMediaUrl: ['image', 'video', 'document'].includes(template?.headerType) && isUsableHeaderMediaReference(template?.headerContent)
      ? template.headerContent
      : '',
  };
}

function normalizeSendIntervalInput(value) {
  if (value === '') return '';

  const digits = String(value).replace(/[^\d]/g, '');
  if (!digits) return '';

  return String(Math.min(3600, Number.parseInt(digits, 10)));
}

function isMetaSampleMediaReference(value = '') {
  const text = String(value || '').trim();
  if (!/^https?:\/\//i.test(text)) return false;

  try {
    const parsedUrl = new URL(text);
    const host = String(parsedUrl.hostname || '').toLowerCase();
    return host === 'scontent.whatsapp.net' || host === 'lookaside.fbsbx.com';
  } catch {
    return false;
  }
}

function isUsableHeaderMediaReference(value = '') {
  const text = String(value || '').trim();
  if (!text) return false;
  if (text.startsWith('/uploads/')) return true;
  return /^https?:\/\//i.test(text) && !isMetaSampleMediaReference(text);
}

function hasUnusableTemplateHeaderMedia(template) {
  return ['image', 'video', 'document'].includes(template?.headerType) &&
    Boolean(template?.headerContent) &&
    !isUsableHeaderMediaReference(template.headerContent);
}

function campaignRequiresHeaderMedia(campaign = {}) {
  return ['image', 'video', 'document'].includes(campaign?.template?.headerType);
}

function getCampaignHeaderMediaReference(campaign = {}) {
  return String(campaign?.variablesMapping?.headerMediaUrl || campaign?.template?.headerContent || '').trim();
}

function createInitialResendHeaderMediaUrl(campaign = {}) {
  const currentReference = getCampaignHeaderMediaReference(campaign);
  return isUsableHeaderMediaReference(currentReference) ? currentReference : '';
}

function normalizeVariablesMapping(template, rawMapping) {
  const defaults = createDefaultVariablesMapping(template);
  const nextMapping = rawMapping && typeof rawMapping === 'object' ? rawMapping : {};
  const configuredBody = Array.isArray(nextMapping.bodyParameters) ? nextMapping.bodyParameters : [];

  return {
    bodyParameters: defaults.bodyParameters.map((defaultValue, index) => {
      const configuredValue = configuredBody[index] || {};
      return {
        source: configuredValue.source || defaultValue.source,
        field: configuredValue.field || defaultValue.field,
        value: configuredValue.value || '',
      };
    }),
    headerMediaUrl: String(nextMapping.headerMediaUrl || defaults.headerMediaUrl || ''),
  };
}

function getVariableOptions() {
  return [
    { value: 'contact:name', label: 'Contact Name' },
    { value: 'contact:phone', label: 'Contact Phone' },
    { value: 'static', label: 'Custom Text' },
  ];
}

function getUniqueApprovedTemplates(templates = []) {
  const seen = new Set();
  const approvedTemplates = [];

  for (const template of templates) {
    if (String(template.status || '').toUpperCase() !== 'APPROVED') continue;

    const templateKey = template.metaTemplateId || `${template.name}__${template.language}`;
    if (seen.has(templateKey)) continue;

    seen.add(templateKey);
    approvedTemplates.push(template);
  }

  return approvedTemplates;
}

export default function Campaigns() {
  const { activeAccount } = useAccountStore();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignPageSize, setCampaignPageSize] = useState(DEFAULT_CAMPAIGN_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [statsView, setStatsView] = useState(null);
  const [uploadingHeaderMedia, setUploadingHeaderMedia] = useState(false);
  const [uploadingResendHeaderMedia, setUploadingResendHeaderMedia] = useState(false);
  const [resendHeaderMediaUrl, setResendHeaderMediaUrl] = useState('');
  const [form, setForm] = useState({
    name: '',
    templateId: '',
    groupId: '',
    scheduledAt: '',
    sendIntervalSeconds: String(DEFAULT_SEND_INTERVAL_SECONDS),
    variablesMapping: { bodyParameters: [], headerMediaUrl: '' },
  });
  const approvedTemplates = useMemo(() => getUniqueApprovedTemplates(templates), [templates]);
  const templateOptions = [
    { value: '', label: 'Select template...' },
    ...approvedTemplates.map((template) => ({
      value: String(template.id),
      label: `${template.name}${template.language ? ` (${template.language})` : ''}`,
    })),
  ];
  const groupOptions = [
    { value: '', label: 'Select group...' },
    ...groups.map((group) => ({ value: String(group.id), label: `${group.name} (${group.contactCount})` })),
  ];
  const selectedTemplate = approvedTemplates.find((template) => String(template.id) === String(form.templateId)) || null;
  const bodyVariableIndexes = extractPlaceholderIndexes(selectedTemplate?.body);
  const hasUnsupportedHeaderTextVariables = selectedTemplate?.headerType === 'text' && extractPlaceholderIndexes(selectedTemplate?.headerContent).length > 0;
  const hasUnsupportedButtonVariables = Array.isArray(selectedTemplate?.buttons) && selectedTemplate.buttons.some((button) => /\{\{\d+\}\}/.test(JSON.stringify(button)));
  const requiresHeaderMedia = ['image', 'video', 'document'].includes(selectedTemplate?.headerType);
  const templateHasMetaSampleMediaOnly = hasUnusableTemplateHeaderMedia(selectedTemplate);
  const variableOptions = getVariableOptions();
  const totalCampaignPages = Math.max(1, Math.ceil(campaigns.length / campaignPageSize));
  const safeCampaignPage = Math.min(campaignPage, totalCampaignPages);
  const campaignStartIndex = (safeCampaignPage - 1) * campaignPageSize;
  const visibleCampaigns = useMemo(
    () => campaigns.slice(campaignStartIndex, campaignStartIndex + campaignPageSize),
    [campaignPageSize, campaignStartIndex, campaigns]
  );

  const downloadCampaignReportExcel = useCallback((campaign) => {
    if (!campaign) return;

    const rows = getCampaignReportRows(campaign);
    const summaryRows = [
      ['Campaign', campaign.name || 'Campaign Report'],
      ['Total', campaign.totalMessages || 0],
      ['Queued', campaign.sentCount || 0],
      ['Delivered', campaign.deliveredCount || 0],
      ['Read', campaign.readCount || 0],
      ['Failed', campaign.failedCount || 0],
    ];

    const tableRows = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.name || '-')}</td>
        <td>${escapeHtml(row.recipient)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.errorCode)}</td>
        <td>${escapeHtml(row.failureReason)}</td>
      </tr>
    `).join('');

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; }
            h1 { font-size: 20px; margin-bottom: 12px; }
            table { border-collapse: collapse; width: 100%; margin-top: 16px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; text-align: left; vertical-align: top; }
            th { background: #f8fafc; }
            .summary td:first-child { font-weight: 700; width: 180px; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(campaign.name || 'Campaign Report')}</h1>
          <table class="summary">
            <tbody>
              ${summaryRows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}
            </tbody>
          </table>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Recipient</th>
                <th>Status</th>
                <th>Error Code</th>
                <th>Failure Reason</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </body>
      </html>
    `;

    downloadBlob(
      new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }),
      `${slugifyFilename(campaign.name, 'campaign-report')}.xls`
    );
  }, []);

  const downloadCampaignReportPdf = useCallback((campaign) => {
    if (!campaign) return;

    downloadBlob(
      createCampaignReportPdf(campaign),
      `${slugifyFilename(campaign.name, 'campaign-report')}.pdf`
    );
  }, []);

  const loadCampaignData = useCallback(async () => {
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
        api.get(`/campaigns/${activeAccount.id}`),
        api.get(`/templates/${activeAccount.id}`),
        api.get(`/contact-groups/${activeAccount.id}`),
      ]);
      setCampaigns(campaignResponse.data.campaigns);
      setTemplates(templateResponse.data.templates || []);
      setGroups(groupResponse.data.groups);
    } catch (error) {
      showApiError(error, 'Failed to load campaigns');
    }
    setLoading(false);
  }, [activeAccount]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadCampaignData();
    });
  }, [loadCampaignData]);

  useEffect(() => {
    if (campaignPage > totalCampaignPages) {
      setCampaignPage(totalCampaignPages);
    }
  }, [campaignPage, totalCampaignPages]);

  const create = async (e) => {
    e.preventDefault();
    if (!activeAccount?.id) {
      toast.error('Select a WhatsApp account first');
      return;
    }
    if (!form.name.trim()) {
      toast.error('Campaign name is required');
      return;
    }
    if (!form.templateId) {
      toast.error('Select an approved template');
      return;
    }
    if (!form.groupId) {
      toast.error('Select a contact group');
      return;
    }
    if (hasUnsupportedHeaderTextVariables) {
      toast.error('Templates with variable text headers are not supported in campaigns yet');
      return;
    }
    if (hasUnsupportedButtonVariables) {
      toast.error('Templates with variable buttons are not supported in campaigns yet');
      return;
    }
    for (const index of bodyVariableIndexes) {
      const parameter = form.variablesMapping.bodyParameters[index - 1];
      const configured = parameter?.source === 'contact'
        ? Boolean(parameter?.field)
        : Boolean(String(parameter?.value || '').trim());
      if (!configured) {
        toast.error(`Configure template variable {{${index}}}`);
        return;
      }
    }
    if (requiresHeaderMedia && !isUsableHeaderMediaReference(form.variablesMapping.headerMediaUrl)) {
      toast.error(`Upload ${selectedTemplate.headerType} media or provide a public URL`);
      return;
    }

    const payload = {
      name: form.name,
      templateId: Number(form.templateId),
      groupId: Number(form.groupId),
      scheduledAt: form.scheduledAt || null,
      sendIntervalSeconds: Number.parseInt(form.sendIntervalSeconds || '0', 10) || 0,
      variablesMapping: form.variablesMapping,
    };

    try {
      await api.post(`/campaigns/${activeAccount.id}`, payload);
      toast.success('Created');
      setShowForm(false);
      setForm({
        name: '',
        templateId: '',
        groupId: '',
        scheduledAt: '',
        sendIntervalSeconds: String(DEFAULT_SEND_INTERVAL_SECONDS),
        variablesMapping: { bodyParameters: [], headerMediaUrl: '' },
      });
      await loadCampaignData();
    } catch (error) {
      const details = getApiErrorDetails(error);
      const validationMessage = Array.isArray(details) && details.length > 0
        ? details[0].message
        : null;
      if (validationMessage) {
        toast.error(validationMessage);
      } else {
        showApiError(error, 'Failed to create campaign');
      }
    }
  };

  const uploadHeaderMedia = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedTemplate) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('File is too large. Keep it under 35 MB.');
      return;
    }

    setUploadingHeaderMedia(true);
    try {
      const contentBase64 = await fileToBase64(file);
      const { data } = await api.post('/uploads/media', {
        filename: file.name,
        mimeType: file.type,
        contentBase64,
      });

      setForm((current) => ({
        ...current,
        variablesMapping: {
          ...current.variablesMapping,
          headerMediaUrl: data.path,
        },
      }));
      toast.success('Header media uploaded');
    } catch (error) {
      showApiError(error, 'Failed to upload header media');
    } finally {
      setUploadingHeaderMedia(false);
    }
  };

  const uploadResendHeaderMedia = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !campaignRequiresHeaderMedia(statsView)) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('File is too large. Keep it under 35 MB.');
      return;
    }

    setUploadingResendHeaderMedia(true);
    try {
      const contentBase64 = await fileToBase64(file);
      const { data } = await api.post('/uploads/media', {
        filename: file.name,
        mimeType: file.type,
        contentBase64,
      });

      setResendHeaderMediaUrl(data.path);
      setStatsView((current) => current ? ({
        ...current,
        variablesMapping: {
          ...(current.variablesMapping || {}),
          headerMediaUrl: data.path,
        },
      }) : current);
      toast.success('Header media uploaded for resend');
    } catch (error) {
      showApiError(error, 'Failed to upload resend media');
    } finally {
      setUploadingResendHeaderMedia(false);
    }
  };

  const run = async (id) => {
    const approved = await confirm({
      title: 'Send Campaign',
      message: 'Send this campaign to the selected group right now?',
      confirmLabel: 'Send Now',
      tone: 'primary',
    });
    if (!approved) return;
    try {
      const { data } = await api.post(`/campaigns/${id}/run`);
      if (data.queued) {
        toast.success(`Campaign started for ${data.queuedCount || 0} contacts`);
      } else if (data.sentCount === 0 && data.failedCount > 0) {
        toast.error(`Campaign failed for all contacts. Open Stats to view Meta reasons.`);
      } else if (data.failedCount > 0) {
        toast.success(`Queued: ${data.sentCount}, Failed immediately: ${data.failedCount}`);
      } else {
        toast.success(`Queued to WhatsApp: ${data.sentCount}`);
      }
      await loadCampaignData();
    } catch (error) {
      showApiError(error, 'Failed to run campaign');
    }
  };

  const stats = async (id) => {
    try {
      const { data } = await api.get(`/campaigns/${id}/stats`);
      setStatsView(data.campaign);
      setResendHeaderMediaUrl(createInitialResendHeaderMediaUrl(data.campaign));
    } catch (error) {
      showApiError(error, 'Failed to load campaign stats');
    }
  };

  const resend = async (campaign, options = {}) => {
    const resendFailedOnly = Number(campaign.failedCount || 0) > 0;
    const hasEcosystemBlocks = hasEcosystemEngagementFailures(campaign);
    const overrideHeaderMediaUrl = String(options.headerMediaUrl || '').trim();
    const currentHeaderMediaReference = getCampaignHeaderMediaReference(campaign);
    if (
      campaignRequiresHeaderMedia(campaign) &&
      !isUsableHeaderMediaReference(overrideHeaderMediaUrl) &&
      !isUsableHeaderMediaReference(currentHeaderMediaReference)
    ) {
      toast.error(`Upload ${campaign.template.headerType} media before resending this campaign.`);
      return;
    }

    const approved = await confirm({
      title: resendFailedOnly ? 'Resend Failed Messages' : 'Resend Campaign',
      message: hasEcosystemBlocks
        ? 'Some failed contacts were blocked by Meta engagement/frequency protections. Immediate retry usually fails again. Retry only after waiting or after improving the audience/template.'
        : resendFailedOnly
        ? 'This will retry only the contacts that failed in the last campaign attempt.'
        : 'This will send this campaign again to the full selected group.',
      confirmLabel: resendFailedOnly ? 'Resend Failed' : 'Resend Campaign',
      tone: 'primary',
    });
    if (!approved) return;

    try {
      const resendPayload = overrideHeaderMediaUrl ? { headerMediaUrl: overrideHeaderMediaUrl } : {};
      const { data } = await api.post(`/campaigns/${campaign.id}/resend`, resendPayload);
      if (data.queued) {
        toast.success(data.scope === 'failed'
          ? `Retry started for ${data.queuedCount || 0} failed contacts`
          : `Campaign started for ${data.queuedCount || 0} contacts`);
      } else if (data.sentCount === 0 && data.failedCount > 0) {
        toast.error('Resend failed for all selected contacts');
      } else if (data.failedCount > 0) {
        toast.success(`${data.scope === 'failed' ? 'Retried failed contacts' : 'Resent campaign'}: queued ${data.sentCount}, failed ${data.failedCount}`);
      } else {
        toast.success(data.scope === 'failed'
          ? `Retried failed contacts: queued ${data.sentCount}`
          : `Resent campaign: queued ${data.sentCount}`);
      }
      await loadCampaignData();
      if (options.refreshStats) {
        await stats(campaign.id);
      }
    } catch (error) {
      showApiError(error, 'Failed to resend campaign');
    }
  };

  const remove = async (id) => {
    const approved = await confirm({
      title: 'Delete Campaign',
      message: 'Delete this campaign permanently?',
      confirmLabel: 'Delete Campaign',
    });
    if (!approved) return;
    try {
      await api.delete(`/campaigns/${id}`);
      await loadCampaignData();
    } catch (error) {
      showApiError(error, 'Failed to delete campaign');
    }
  };

  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Campaigns</h1>
            <p className="mt-0.5 text-sm text-gray-500">Send bulk messages using approved templates</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover sm:w-auto">
            <IoAdd /> New Campaign
          </button>
        </div>

        {showForm && (
          <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-lg font-semibold">New Campaign</h2>
            <form onSubmit={create} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Template</label>
                <AppSelect
                  value={form.templateId}
                  onChange={(value) => {
                    const template = approvedTemplates.find((item) => String(item.id) === String(value));
                    setForm((current) => ({
                      ...current,
                      templateId: value,
                      variablesMapping: normalizeVariablesMapping(template, current.templateId === value ? current.variablesMapping : null),
                    }));
                  }}
                  options={templateOptions}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Contact Group</label>
                <AppSelect value={form.groupId} onChange={(value) => setForm({ ...form, groupId: value })} options={groupOptions} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Schedule (optional)</label>
                <SimpleDateTimePicker value={form.scheduledAt} onChange={(value) => setForm({ ...form, scheduledAt: value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Send interval (seconds)</label>
                <input
                  type="number"
                  min="0"
                  max="3600"
                  step="1"
                  value={form.sendIntervalSeconds}
                  onChange={(e) => setForm((current) => ({
                    ...current,
                    sendIntervalSeconds: normalizeSendIntervalInput(e.target.value),
                  }))}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <p className="mt-1 text-xs text-gray-500">Default: 3 seconds between each contact send.</p>
              </div>
              {selectedTemplate && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 md:col-span-2">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-gray-800">Template Preview</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {selectedTemplate.headerType !== 'none' ? `Header: ${selectedTemplate.headerType} | ` : ''}
                      {selectedTemplate.category} | {selectedTemplate.language}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-700 shadow-sm">
                    {selectedTemplate.headerType === 'text' && selectedTemplate.headerContent && (
                      <p className="mb-2 font-semibold text-gray-800">{selectedTemplate.headerContent}</p>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">{selectedTemplate.body}</p>
                    {selectedTemplate.footer && <p className="mt-3 text-xs italic text-gray-500">{selectedTemplate.footer}</p>}
                  </div>
                </div>
              )}

              {(hasUnsupportedHeaderTextVariables || hasUnsupportedButtonVariables) && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 md:col-span-2">
                  {hasUnsupportedHeaderTextVariables
                    ? 'This template has variable text in the header. Campaign sending for variable text headers is not supported yet.'
                    : 'This template has variable buttons. Campaign sending for templates with variable buttons is not supported yet.'}
                </div>
              )}

              {bodyVariableIndexes.length > 0 && (
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:col-span-2">
                  <h3 className="mb-3 text-sm font-semibold text-gray-800">Template Variables</h3>
                  <div className="space-y-4">
                    {bodyVariableIndexes.map((index) => {
                      const parameter = form.variablesMapping.bodyParameters[index - 1] || { source: 'contact', field: 'name', value: '' };
                      const optionValue = parameter.source === 'contact' ? `contact:${parameter.field || 'name'}` : 'static';

                      return (
                        <div key={index} className="grid grid-cols-1 gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 md:grid-cols-[140px_1fr]">
                          <div>
                            <p className="text-sm font-medium text-gray-700">Variable {`{{${index}}}`}</p>
                          </div>
                          <div className="space-y-3">
                            <AppSelect
                              value={optionValue}
                              onChange={(value) => {
                                const [source, field] = String(value).split(':');
                                setForm((current) => {
                                  const nextBodyParameters = [...current.variablesMapping.bodyParameters];
                                  nextBodyParameters[index - 1] = source === 'static'
                                    ? { source: 'static', field: '', value: nextBodyParameters[index - 1]?.value || '' }
                                    : { source: 'contact', field: field || 'name', value: '' };
                                  return {
                                    ...current,
                                    variablesMapping: {
                                      ...current.variablesMapping,
                                      bodyParameters: nextBodyParameters,
                                    },
                                  };
                                });
                              }}
                              options={variableOptions}
                            />
                            {parameter.source === 'static' && (
                              <input
                                type="text"
                                value={parameter.value || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setForm((current) => {
                                    const nextBodyParameters = [...current.variablesMapping.bodyParameters];
                                    nextBodyParameters[index - 1] = { ...nextBodyParameters[index - 1], source: 'static', field: '', value };
                                    return {
                                      ...current,
                                      variablesMapping: {
                                        ...current.variablesMapping,
                                        bodyParameters: nextBodyParameters,
                                      },
                                    };
                                  });
                                }}
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                placeholder={`Enter value for {{${index}}}`}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {requiresHeaderMedia && (
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:col-span-2">
                  <h3 className="mb-3 text-sm font-semibold text-gray-800">Header Media</h3>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    {selectedTemplate.headerType[0].toUpperCase() + selectedTemplate.headerType.slice(1)} media
                  </label>
                  <div className="mb-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100">
                      <IoCloudUpload className="text-base" />
                      <span>{uploadingHeaderMedia ? 'Uploading...' : `Upload ${selectedTemplate.headerType}`}</span>
                      <input
                        type="file"
                        accept={getCampaignHeaderAcceptValue(selectedTemplate.headerType)}
                        className="hidden"
                        onChange={uploadHeaderMedia}
                        disabled={uploadingHeaderMedia}
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    value={form.variablesMapping.headerMediaUrl || ''}
                    onChange={(e) => setForm((current) => ({
                      ...current,
                      variablesMapping: {
                        ...current.variablesMapping,
                        headerMediaUrl: e.target.value,
                      },
                    }))}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder={`Upload media or enter a public ${selectedTemplate.headerType.toLowerCase()} URL`}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    App-uploaded media is sent to Meta as a media ID. If an older local upload was deleted, upload it again here. Public URLs must be accessible without login or 403 blocks.
                  </p>
                  {templateHasMetaSampleMediaOnly && (
                    <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                      This approved template only includes Meta sample media. Upload the actual campaign image here before creating the campaign.
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2 md:col-span-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 hover:bg-primary-hover">Create</button>
              </div>
            </form>
          </div>
        )}

        {statsView && (
          <div className="app-modal-overlay z-50 bg-black/50" onClick={() => {
            setStatsView(null);
            setResendHeaderMediaUrl('');
          }}>
            <div className="app-modal-scroll-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{statsView.name}</h2>
                  {Number(statsView.failedCount || 0) > 0 && (
                    <button
                      onClick={() => resend(statsView, { refreshStats: true, headerMediaUrl: resendHeaderMediaUrl })}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-100"
                    >
                      <IoRefresh /> Resend Failed
                    </button>
                  )}
                </div>
                <button onClick={() => {
                  setStatsView(null);
                  setResendHeaderMediaUrl('');
                }} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg hover:bg-gray-100"><IoClose /></button>
              </div>
              {campaignRequiresHeaderMedia(statsView) && (
                <div className="mb-5 rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
                  <p className="text-sm font-semibold text-gray-800">Header Media for Resend</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    Use this when the old campaign used Meta sample media or when the previous app upload is no longer available on the server.
                  </p>
                  <div className="mt-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100">
                      <IoCloudUpload className="text-base" />
                      <span>{uploadingResendHeaderMedia ? 'Uploading...' : `Upload ${statsView.template.headerType}`}</span>
                      <input
                        type="file"
                        accept={getCampaignHeaderAcceptValue(statsView.template.headerType)}
                        className="hidden"
                        onChange={uploadResendHeaderMedia}
                        disabled={uploadingResendHeaderMedia}
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    value={resendHeaderMediaUrl}
                    onChange={(e) => setResendHeaderMediaUrl(e.target.value)}
                    className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder={`Upload media or enter a public ${statsView.template.headerType} URL`}
                  />
                  {!isUsableHeaderMediaReference(getCampaignHeaderMediaReference(statsView)) && !isUsableHeaderMediaReference(resendHeaderMediaUrl) && (
                    <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                      This campaign does not currently have reusable header media. Upload the actual header media here before retrying.
                    </p>
                  )}
                </div>
              )}
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center"><p className="text-2xl font-bold text-slate-700">{statsView.totalMessages}</p><p className="mt-0.5 text-xs text-gray-500">Total</p></div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-center"><p className="text-2xl font-bold text-emerald-600">{statsView.sentCount}</p><p className="mt-0.5 text-xs text-gray-500">Queued</p></div>
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-center"><p className="text-2xl font-bold text-blue-600">{statsView.deliveredCount}</p><p className="mt-0.5 text-xs text-gray-500">Delivered</p></div>
                <div className="rounded-xl border border-purple-100 bg-purple-50 p-3 text-center"><p className="text-2xl font-bold text-purple-600">{statsView.readCount}</p><p className="mt-0.5 text-xs text-gray-500">Read</p></div>
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center"><p className="text-2xl font-bold text-red-600">{statsView.failedCount}</p><p className="mt-0.5 text-xs text-gray-500">Failed</p></div>
              </div>
              <div className="mb-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 font-sans shadow-sm">
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Download Campaign Report</p>
                      
                    </div>
                    
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => downloadCampaignReportPdf(statsView)}
                      className="flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition-all hover:-translate-y-0.5 hover:bg-rose-100 hover:shadow-sm"
                    >
                      Download PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadCampaignReportExcel(statsView)}
                      className="flex items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-600 transition-all hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-sm"
                    >
                      Download CSV
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100">
              <IoMegaphone className="text-3xl text-gray-300" />
            </div>
            <p className="font-medium text-gray-500">No campaigns yet</p>
            <p className="mt-1 text-sm text-gray-400">Create a campaign to send bulk messages</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleCampaigns.map((campaign) => (
              <div key={campaign.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-3">
                      <h3 className="font-semibold text-gray-800">{campaign.name}</h3>
                      <span className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${statusColors[campaign.status]}`}>{campaign.status}</span>
                    </div>
                    <p className="break-words text-sm text-gray-500">{`Template: ${campaign.template?.name || 'N/A'} | Group: ${campaign.group?.name || 'N/A'}`}</p>
                    {campaign.scheduledAt && <p className="mt-1 text-xs text-gray-400">Scheduled: {new Date(campaign.scheduledAt).toLocaleString()}</p>}
                    {Number(campaign.sendIntervalSeconds || 0) > 0 && (
                      <p className="mt-1 text-xs text-gray-400">Send interval: {campaign.sendIntervalSeconds} second{Number(campaign.sendIntervalSeconds) === 1 ? '' : 's'}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:ml-4 lg:flex-shrink-0 lg:justify-end">
                    {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
                      <button onClick={() => run(campaign.id)} className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-100">
                        <IoPlay /> Send
                      </button>
                    )}
                    {campaign.template?.name && (campaign.status === 'completed' || campaign.status === 'cancelled') && (
                      <button onClick={() => resend(campaign)} className="flex items-center justify-center gap-1.5 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-100">
                        <IoRefresh /> {Number(campaign.failedCount || 0) > 0 ? 'Resend Failed' : 'Resend'}
                      </button>
                    )}
                    <button onClick={() => stats(campaign.id)} className="flex items-center justify-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100">
                      <IoStatsChart /> Stats
                    </button>
                    <button onClick={() => remove(campaign.id)} className="flex items-center justify-center rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100">
                      <IoTrash />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <PaginationBar
              className="mt-5"
              page={safeCampaignPage}
              totalPages={totalCampaignPages}
              pageSize={campaignPageSize}
              totalItems={campaigns.length}
              onPageChange={setCampaignPage}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={(size) => {
                setCampaignPageSize(size || DEFAULT_CAMPAIGN_PAGE_SIZE);
                setCampaignPage(1);
              }}
            />
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}

function getCampaignHeaderAcceptValue(headerType) {
  if (headerType === 'image') return '.jpg,.jpeg,.png,.gif,.webp,.bmp';
  if (headerType === 'video') return '.mp4,.mov,.avi,.mkv,.webm';
  if (headerType === 'document') return '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv';
  return '';
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

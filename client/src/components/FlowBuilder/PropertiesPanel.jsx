import { useRef, useState } from 'react';
import { IoClose, IoTrash, IoAdd, IoChatbubble, IoGitBranch, IoTime, IoCloudUpload, IoStop, IoFlag, IoImage, IoVideocam, IoDocument } from 'react-icons/io5';
import api from '../../services/api';
import { DEFAULT_BUTTON_MESSAGE_TEXT } from './flowBuilderDefaults';

const DELAY_PRESETS = [
  { label: '30s', value: 30 }, { label: '1m', value: 60 }, { label: '5m', value: 300 },
  { label: '15m', value: 900 }, { label: '30m', value: 1800 }, { label: '1h', value: 3600 },
  { label: '3h', value: 10800 }, { label: '6h', value: 21600 }, { label: '12h', value: 43200 },
  { label: '1d', value: 86400 }, { label: '2d', value: 172800 }, { label: '7d', value: 604800 },
];

const nodeConfig = {
  startNode: { icon: IoFlag, label: 'Start Trigger', headerGradient: 'from-emerald-50 to-white', iconWrap: 'bg-emerald-100', iconText: 'text-emerald-600' },
  messageNode: { icon: IoChatbubble, label: 'Send Message', headerGradient: 'from-blue-50 to-white', iconWrap: 'bg-blue-100', iconText: 'text-blue-600' },
  conditionNode: { icon: IoGitBranch, label: 'Condition', headerGradient: 'from-amber-50 to-white', iconWrap: 'bg-amber-100', iconText: 'text-amber-600' },
  delayNode: { icon: IoTime, label: 'Wait / Delay', headerGradient: 'from-purple-50 to-white', iconWrap: 'bg-purple-100', iconText: 'text-purple-600' },
  apiNode: { icon: IoCloudUpload, label: 'API Call', headerGradient: 'from-cyan-50 to-white', iconWrap: 'bg-cyan-100', iconText: 'text-cyan-600' },
  endNode: { icon: IoStop, label: 'End Flow', headerGradient: 'from-red-50 to-white', iconWrap: 'bg-red-100', iconText: 'text-red-600' },
};

const mediaIcons = {
  image: IoImage,
  video: IoVideocam,
  document: IoDocument,
};

export default function PropertiesPanel({ node, onUpdate, onClose, onDelete }) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  if (!node) return null;
  const config = nodeConfig[node.type] || nodeConfig.startNode;
  const NodeIcon = config.icon;
  const messageType = getEditorMessageType(node.data);
  const isMediaMessage = node.type === 'messageNode' && ['image', 'video', 'document'].includes(messageType);
  const hasQuickReplyButtons = node.type === 'messageNode' && (node.data.buttons || []).length > 0;
  const isButtonMessageMissingText = hasQuickReplyButtons && messageType === 'text' && !String(node.data.text || '').trim();
  const MediaIcon = mediaIcons[messageType] || IoCloudUpload;

  const update = (key, value) => onUpdate(node.id, { ...node.data, [key]: value });
  const updateMany = (values) => onUpdate(node.id, { ...node.data, ...values });
  const addQuickReplyButton = () => {
    const nextValues = {
      buttons: [...(node.data.buttons || []), { title: '', payload: '' }],
    };

    if (messageType === 'text' && !String(node.data.text || '').trim()) {
      nextValues.text = DEFAULT_BUTTON_MESSAGE_TEXT;
    }

    updateMany(nextValues);
  };

  const uploadFile = async (file) => {
    if (!file || !isMediaMessage) return;

    const mediaKind = getMediaKind(file.type, file.name);
    if (mediaKind !== messageType) {
      setUploadError(`Please upload a ${getMediaLabel(messageType).toLowerCase()} file only.`);
      return;
    }

    setUploadError('');
    setUploading(true);
    try {
      const contentBase64 = await fileToBase64(file);
      const { data } = await api.post('/uploads/media', {
        filename: file.name,
        mimeType: file.type,
        contentBase64,
      });

      updateMany({
        mediaUrl: data.path || data.url,
        filename: data.filename,
        mimeType: data.mimeType,
        mediaKind,
        messageType: mediaKind,
      });
    } catch (error) {
      console.error('Flow media upload failed:', error);
      setUploadError(`Failed to upload ${getMediaLabel(messageType).toLowerCase()}. Please try again.`);
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = async (event) => {
    const file = event.target.files?.[0];
    if (file) {
      await uploadFile(file);
    }
    event.target.value = '';
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };

  return (
    <div className="app-modal-overlay z-50">
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl sm:max-h-[94dvh] sm:rounded-3xl">

        {/* Header */}
        <div className={`flex items-center justify-between border-b border-gray-100 bg-gradient-to-r px-4 pb-4 pt-4 sm:px-6 sm:pt-6 ${config.headerGradient}`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.iconWrap}`}>
              <NodeIcon className={`${config.iconText} text-lg`} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-gray-800">{config.label}</h3>
              <p className="text-xs text-gray-500">Configure this step</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200">
            <IoClose className="text-lg" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">

          {/* START NODE */}
          {node.type === 'startNode' && (
            <>
              <Field label="Description">
                <input type="text" value={node.data.label || ''} onChange={(e) => update('label', e.target.value)}
                  className="input-field" placeholder="Describe this trigger" />
              </Field>
              <Field label="Trigger Type">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[{ id: 'keyword', label: 'Keyword' }, { id: 'all', label: 'All Messages' }, { id: 'none', label: 'Manual' }].map(t => (
                    <button key={t.id} type="button" onClick={() => update('triggerType', t.id)}
                      className={`py-2.5 rounded-xl text-xs font-bold transition-all border-2 ${
                        node.data.triggerType === t.id ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                      }`}>{t.label}</button>
                  ))}
                </div>
              </Field>
              {node.data.triggerType === 'keyword' && (
                <Field label="Trigger Keyword">
                  <input type="text" value={node.data.triggerValue || ''} onChange={(e) => update('triggerValue', e.target.value)}
                    className="input-field" placeholder="Enter trigger keywords" />
                  <p className="text-xs text-gray-400 mt-1">Separate multiple keywords with commas</p>
                </Field>
              )}
            </>
          )}

          {/* MESSAGE NODE */}
          {node.type === 'messageNode' && (
            <>
              <Field label={isMediaMessage ? 'Caption / Message' : 'Message'}>
                <textarea
                  value={node.data.text || ''}
                  onChange={(e) => update('text', e.target.value)}
                  className="input-field h-32 resize-none leading-relaxed"
                  placeholder={isMediaMessage ? `Enter ${getMediaLabel(messageType).toLowerCase()} caption or message` : 'Enter message'}
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-400">Use {'{{name}}'}, {'{{phone}}'} for personalization</p>
              </Field>

              {isMediaMessage && (
                <Field label={`${getMediaLabel(messageType)} Upload`}>
                  <div className="space-y-3">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragActive(true);
                      }}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setDragActive(true);
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        const nextTarget = event.relatedTarget;
                        if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
                          setDragActive(false);
                        }
                      }}
                      onDrop={handleDrop}
                      className={`rounded-2xl border-2 border-dashed px-4 py-4 transition-colors ${
                        dragActive
                          ? 'border-primary bg-primary-light/60'
                          : 'border-blue-200 bg-blue-50/60 hover:bg-blue-50'
                      } ${uploading ? 'cursor-wait opacity-80' : 'cursor-pointer'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-500 shadow-sm">
                          <MediaIcon className="text-xl" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-blue-700">
                            {uploading ? `Uploading ${getMediaLabel(messageType).toLowerCase()}...` : `Upload ${getMediaLabel(messageType).toLowerCase()}`}
                          </p>
                          <p className="mt-1 text-xs text-blue-500">
                            Click to browse or drag and drop a {getMediaLabel(messageType).toLowerCase()} file here.
                          </p>
                          <p className="mt-2 truncate text-xs font-medium text-gray-600">
                            {node.data.filename || `No ${getMediaLabel(messageType).toLowerCase()} selected yet`}
                          </p>
                        </div>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={getAcceptValue(messageType)}
                        className="hidden"
                        onChange={handleInputChange}
                        disabled={uploading}
                      />
                    </div>

                    {uploadError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                        {uploadError}
                      </div>
                    )}

                    {node.data.mediaUrl && (
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800">{node.data.filename || `${getMediaLabel(messageType)} uploaded`}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-blue-600">
                              {getMediaLabel(messageType)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setUploadError('');
                              updateMany({
                                mediaUrl: '',
                                filename: '',
                                mimeType: '',
                                mediaKind: '',
                                messageType,
                              });
                            }}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </Field>
              )}

              {/* Buttons */}
              <Field label={`Quick Reply Buttons (${node.data.buttons?.length || 0}/3)`}>
                {isButtonMessageMissingText && (
                  <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    Quick reply buttons need message text. A default message will be added before saving if this is left blank.
                  </div>
                )}
                <div className="space-y-2 mb-2">
                  {(node.data.buttons || []).map((btn, i) => (
                    <div key={i} className="flex gap-2">
                      <input type="text" value={btn.title} placeholder={`Enter button ${i + 1} label`}
                        onChange={(e) => {
                          const buttons = [...node.data.buttons];
                          buttons[i] = { ...btn, title: e.target.value };
                          update('buttons', buttons);
                        }}
                        className="min-w-0 flex-1 rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-blue-400" />
                      <button onClick={() => update('buttons', node.data.buttons.filter((_, j) => j !== i))}
                        className="w-10 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 bg-white border-2 border-gray-200 rounded-xl transition-all">
                        <IoTrash />
                      </button>
                    </div>
                  ))}
                </div>
                {(node.data.buttons?.length || 0) < 3 && (
                  <button onClick={addQuickReplyButton}
                    className="w-full py-3 bg-blue-50 border-2 border-blue-200 border-dashed rounded-xl text-sm font-bold text-blue-600 hover:bg-blue-100 transition-colors flex items-center justify-center gap-1.5">
                    <IoAdd /> Add Button
                  </button>
                )}
              </Field>
            </>
          )}

          {/* CONDITION NODE */}
          {node.type === 'conditionNode' && (
            <>
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                <p className="text-sm text-amber-800 font-medium leading-relaxed">
                  This step checks what the user said and splits the flow into <strong>Yes</strong> (match) and <strong>No</strong> (no match) paths.
                </p>
              </div>
              <Field label="Match Type">
                <div className="grid grid-cols-2 gap-2">
                  {[{ id: 'contains', label: 'Contains' }, { id: 'exact', label: 'Exact Match' }].map(t => (
                    <button key={t.id} type="button" onClick={() => update('matchType', t.id)}
                      className={`py-2.5 rounded-xl text-xs font-bold transition-all border-2 ${
                        node.data.matchType === t.id ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                      }`}>{t.label}</button>
                  ))}
                </div>
              </Field>
              <Field label="Check if user's message...">
                <input type="text" value={node.data.value || ''} onChange={(e) => update('value', e.target.value)}
                  className="input-field" placeholder="Enter matching text" autoFocus />
                <p className="text-xs text-gray-400 mt-1">Separate multiple with commas for OR matching</p>
              </Field>
            </>
          )}

          {/* DELAY NODE */}
          {node.type === 'delayNode' && (
            <>
              <Field label="Delay Duration">
                <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {DELAY_PRESETS.map(p => (
                    <button key={p.value} type="button" onClick={() => update('seconds', p.value)}
                      className={`py-2.5 rounded-xl text-xs font-bold transition-all border-2 ${
                        node.data.seconds === p.value ? 'bg-purple-50 text-purple-700 border-purple-300' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                      }`}>{p.label}</button>
                  ))}
                </div>
              </Field>
              <Field label="Custom (seconds)">
                <input type="number" value={node.data.seconds || 0} onChange={(e) => update('seconds', parseInt(e.target.value) || 0)}
                  className="input-field" min="0" />
              </Field>
            </>
          )}

          {/* API NODE */}
          {node.type === 'apiNode' && (
            <>
              <Field label="HTTP Method">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
                    <button key={m} type="button" onClick={() => update('method', m)}
                      className={`py-2.5 rounded-xl text-[10px] font-black transition-all border-2 ${
                        node.data.method === m ? 'bg-cyan-50 text-cyan-700 border-cyan-300' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                      }`}>{m}</button>
                  ))}
                </div>
              </Field>
              <Field label="URL">
                <input type="text" value={node.data.url || ''} onChange={(e) => update('url', e.target.value)}
                  className="input-field font-mono text-xs" placeholder="Enter API endpoint URL" />
              </Field>
              <Field label="Headers (JSON)">
                <textarea value={node.data.headers || '{}'} onChange={(e) => update('headers', e.target.value)}
                  className="input-field resize-none h-20 font-mono text-xs" placeholder='Enter request headers in JSON format' />
              </Field>
              {(node.data.method === 'POST' || node.data.method === 'PUT' || node.data.method === 'PATCH') && (
                <Field label="Request Body (JSON)">
                  <textarea value={node.data.body || ''} onChange={(e) => update('body', e.target.value)}
                    className="input-field resize-none h-20 font-mono text-xs" placeholder='Enter request body in JSON format' />
                </Field>
              )}
              <Field label="Save response as variable">
                <input type="text" value={node.data.saveResponseAs || ''} onChange={(e) => update('saveResponseAs', e.target.value)}
                  className="input-field" placeholder="Enter variable name" />
                <p className="text-xs text-gray-400 mt-1">Access later with {'{{apiResult}}'}</p>
              </Field>
              <div className="bg-cyan-50 rounded-xl p-3 border border-cyan-200">
                <p className="text-xs text-cyan-700 font-medium">
                  <strong>Success</strong> path (left handle) runs on 2xx response. <strong>Error</strong> path (right handle) runs on failure.
                </p>
              </div>
            </>
          )}

          {/* END NODE */}
          {node.type === 'endNode' && (
            <>
              <Field label="End Message (optional)">
                <input type="text" value={node.data.label || ''} onChange={(e) => update('label', e.target.value)}
                  className="input-field" placeholder="Enter completion message" />
              </Field>
              <Field label="End Action">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[{ id: '', label: 'None' }, { id: 'assign', label: 'Assign Agent' }, { id: 'tag', label: 'Add Tag' }].map(a => (
                    <button key={a.id} type="button" onClick={() => update('action', a.id)}
                      className={`py-2.5 rounded-xl text-xs font-bold transition-all border-2 ${
                        (node.data.action || '') === a.id ? 'bg-red-50 text-red-700 border-red-300' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                      }`}>{a.label}</button>
                  ))}
                </div>
              </Field>
              {node.data.action === 'tag' && (
                <Field label="Tag Name">
                  <input type="text" value={node.data.tagName || ''} onChange={(e) => update('tagName', e.target.value)}
                    className="input-field" placeholder="Enter tag name" />
                </Field>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          {node.type !== 'startNode' ? (
            <button
              onClick={onDelete}
              title="Delete node"
              aria-label="Delete node"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-red-600 transition-colors hover:bg-red-50"
            >
              <IoTrash />
            </button>
          ) : <div />}
          <button onClick={onClose} className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-gray-900/20 transition-all hover:bg-black active:scale-95">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-bold text-gray-700 mb-2">{label}</label>
      {children}
    </div>
  );
}

function getEditorMessageType(data = {}) {
  const explicit = String(data.messageType || '').toLowerCase();
  if (['image', 'video', 'document'].includes(explicit)) return explicit;

  const mimeType = String(data.mimeType || '').toLowerCase();
  const fileRef = String(data.filename || data.mediaUrl || '').toLowerCase();

  if (mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(fileRef)) return 'image';
  if (mimeType.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/.test(fileRef)) return 'video';
  if (data.mediaUrl) return 'document';
  return 'text';
}

function getAcceptValue(messageType) {
  if (messageType === 'image') return '.jpg,.jpeg,.png,.gif,.webp,.bmp';
  if (messageType === 'video') return '.mp4,.mov,.avi,.mkv,.webm';
  if (messageType === 'document') return '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv';
  return '';
}

function getMediaKind(mimeType = '', filename = '') {
  const lowerMime = String(mimeType || '').toLowerCase();
  const lowerFilename = String(filename || '').toLowerCase();

  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'].includes(lowerMime) || /\.(png|jpe?g|gif|webp|bmp)$/.test(lowerFilename)) return 'image';
  if (['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi', 'video/x-matroska', 'video/mkv', 'video/webm'].includes(lowerMime) || /\.(mp4|mov|avi|mkv|webm)$/.test(lowerFilename)) return 'video';
  if (lowerMime || lowerFilename) return 'document';
  return '';
}

function getMediaLabel(messageType) {
  if (messageType === 'image') return 'Image';
  if (messageType === 'video') return 'Video';
  if (messageType === 'document') return 'Document';
  return 'Attachment';
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

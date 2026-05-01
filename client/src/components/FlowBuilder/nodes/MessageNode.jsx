import { Handle, Position } from '@xyflow/react';
import { IoChatbubble, IoImage, IoDocument, IoVideocam } from 'react-icons/io5';

const typeIcons = { text: IoChatbubble, image: IoImage, document: IoDocument, video: IoVideocam };

export default function MessageNode({ data, selected }) {
  const mediaKind = inferMediaKind(data);
  const Icon = typeIcons[mediaKind] || IoChatbubble;
  const mediaLabel = data.filename || data.mediaUrl || 'No file uploaded';
  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top}
        className="!z-10 !h-5 !w-5 !bg-primary !border-[3px] !border-white !-top-2.5 !shadow-md transition-all group-hover:!scale-125" />
      <div className={`bg-white rounded-2xl shadow-md min-w-[220px] max-w-[280px] border-2 transition-all ${
        selected ? 'border-primary shadow-primary/25 shadow-xl scale-105' : 'border-gray-100 hover:shadow-lg hover:border-primary/30'
      }`}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary to-emerald-600 rounded-t-[14px]">
          <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
            <Icon className="text-white text-xs" />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">Send Message</span>
          {mediaKind && (
            <span className="ml-auto px-1.5 py-0.5 bg-white/20 rounded text-[9px] font-bold text-white uppercase">{mediaKind}</span>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <div className="bg-gray-50 rounded-xl px-3 py-2 min-h-[40px]">
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-4 whitespace-pre-wrap">
              {data.text || <span className="text-gray-400 italic">Click to edit message...</span>}
            </p>
          </div>

          {mediaKind && (
            <div className="mt-2 bg-primary-light rounded-xl p-3 flex items-center gap-2">
              {mediaKind === 'image' ? <IoImage className="text-emerald-500 text-lg flex-shrink-0" /> : null}
              {mediaKind === 'document' ? <IoDocument className="text-emerald-500 text-lg flex-shrink-0" /> : null}
              {mediaKind === 'video' ? <IoVideocam className="text-emerald-500 text-lg flex-shrink-0" /> : null}
              <div className="min-w-0">
                <p className="text-[10px] text-emerald-700 font-bold uppercase">{mediaKind}</p>
                <p className="text-xs text-gray-500 truncate">{mediaLabel}</p>
              </div>
            </div>
          )}

          {/* Buttons Preview */}
          {data.buttons?.length > 0 && (
            <div className="mt-2 space-y-1">
              {data.buttons.map((b, i) => (
                <div key={i} className="text-[10px] bg-primary-light text-emerald-700 rounded-lg px-3 py-1.5 text-center font-bold border border-primary/20">
                  {b.title || `Button ${i + 1}`}
                </div>
              ))}
            </div>
          )}

          {/* List items preview */}
          {data.listSections?.length > 0 && (
            <div className="mt-2 bg-primary-light rounded-lg px-3 py-2 border border-primary/20">
              <p className="text-[10px] text-emerald-700 font-bold">{data.listSections.length} list section(s)</p>
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom}
        className="!z-10 !h-5 !w-5 !bg-primary !border-[3px] !border-white !-bottom-2.5 !shadow-md transition-all group-hover:!scale-125" />
    </div>
  );
}

function inferMediaKind(data = {}) {
  const kind = String(data.mediaKind || data.messageType || '').toLowerCase();
  if (['image', 'video', 'document'].includes(kind)) return kind;

  const mimeType = String(data.mimeType || '').toLowerCase();
  const fileRef = String(data.filename || data.mediaUrl || '').toLowerCase();

  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'].includes(mimeType) || /\.(png|jpe?g|gif|webp|bmp)$/.test(fileRef)) return 'image';
  if (['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi', 'video/x-matroska', 'video/mkv', 'video/webm'].includes(mimeType) || /\.(mp4|mov|avi|mkv|webm)$/.test(fileRef)) return 'video';
  if (data.mediaUrl) return 'document';
  return '';
}

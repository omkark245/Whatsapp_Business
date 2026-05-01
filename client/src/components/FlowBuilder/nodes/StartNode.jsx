import { Handle, Position } from '@xyflow/react';
import { IoFlag, IoFlash } from 'react-icons/io5';

export default function StartNode({ data, selected }) {
  return (
    <div className="relative group">
      <div className={`w-[220px] bg-gradient-to-br from-emerald-500 to-green-600 text-white rounded-xl shadow-lg border-2 transition-all ${
        selected ? 'border-white shadow-emerald-500/40 shadow-xl scale-105' : 'border-emerald-400/30 shadow-emerald-500/25'
      }`}>
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
            <IoFlag className="text-sm" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[8px] font-bold uppercase tracking-[0.18em] opacity-80">Start Trigger</p>
            <p className="truncate text-xs font-semibold leading-snug">{data.label || 'When user messages'}</p>
          </div>
        </div>
        {data.triggerType && (
          <div className="px-3 pb-2">
            <div className="flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 backdrop-blur-sm">
              <IoFlash className="text-xs text-yellow-200" />
              <span className="text-[9px] font-medium text-white/90">
                {data.triggerType === 'keyword' ? `Keyword: ${data.triggerValue || '...'}` :
                 data.triggerType === 'all' ? 'All messages' : 'Manual trigger'}
              </span>
            </div>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom}
        className="!z-10 !h-5 !w-5 !bg-emerald-400 !border-[3px] !border-white !-bottom-2.5 !shadow-md transition-all group-hover:!scale-125" />
    </div>
  );
}

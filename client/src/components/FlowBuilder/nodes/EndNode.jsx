import { Handle, Position } from '@xyflow/react';
import { IoStop } from 'react-icons/io5';

export default function EndNode({ data, selected }) {
  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top}
        className="!z-10 !h-5 !w-5 !bg-red-400 !border-[3px] !border-white !-top-2.5 !shadow-md transition-all group-hover:!scale-125" />
      <div className={`bg-gradient-to-br from-red-500 to-rose-600 text-white rounded-2xl shadow-lg min-w-[170px] border-2 transition-all ${
        selected ? 'border-white shadow-red-500/40 shadow-xl scale-105' : 'border-red-400/30 shadow-red-500/25'
      }`}>
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <IoStop className="text-lg" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider opacity-80 font-bold">End Flow</p>
            <p className="text-sm font-semibold">{data.label || 'Conversation ends'}</p>
          </div>
        </div>
        {data.action && (
          <div className="px-4 pb-3">
            <div className="bg-white/15 rounded-lg px-2.5 py-1 backdrop-blur-sm">
              <span className="text-[10px] font-medium text-white/90">
                {data.action === 'assign' ? 'Assign to agent' : data.action === 'tag' ? `Add tag: ${data.tagName || '...'}` : 'End'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

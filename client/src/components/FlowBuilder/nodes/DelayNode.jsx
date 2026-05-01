import { Handle, Position } from '@xyflow/react';
import { IoTime } from 'react-icons/io5';

function formatDelay(seconds) {
  if (!seconds) return '0s';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s > 0 ? s + 's' : ''}`;
  return `${s}s`;
}

export default function DelayNode({ data, selected }) {
  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top}
        className="!z-10 !h-5 !w-5 !bg-purple-400 !border-[3px] !border-white !-top-2.5 !shadow-md transition-all group-hover:!scale-125" />
      <div className={`bg-white rounded-2xl shadow-md min-w-[180px] border-2 transition-all ${
        selected ? 'border-purple-500 shadow-purple-500/25 shadow-xl scale-105' : 'border-gray-100 hover:shadow-lg hover:border-purple-200'
      }`}>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-violet-600 rounded-t-[14px]">
          <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
            <IoTime className="text-white text-xs" />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">Wait / Delay</span>
        </div>
        <div className="px-4 py-4 text-center">
          <p className="text-2xl font-black text-purple-700 tracking-tight">{formatDelay(data.seconds)}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mt-1">pause before next step</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom}
        className="!z-10 !h-5 !w-5 !bg-purple-400 !border-[3px] !border-white !-bottom-2.5 !shadow-md transition-all group-hover:!scale-125" />
    </div>
  );
}

import { Handle, Position } from '@xyflow/react';
import { IoCloudUpload } from 'react-icons/io5';

const methodColors = {
  GET: 'bg-blue-100 text-blue-700',
  POST: 'bg-green-100 text-green-700',
  PUT: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
  PATCH: 'bg-purple-100 text-purple-700',
};

export default function ApiNode({ data, selected }) {
  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top}
        className="!z-10 !h-5 !w-5 !bg-cyan-400 !border-[3px] !border-white !-top-2.5 !shadow-md transition-all group-hover:!scale-125" />
      <div className={`bg-white rounded-2xl shadow-md min-w-[220px] max-w-[280px] border-2 transition-all ${
        selected ? 'border-cyan-500 shadow-cyan-500/25 shadow-xl scale-105' : 'border-gray-100 hover:shadow-lg hover:border-cyan-200'
      }`}>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-teal-600 rounded-t-[14px]">
          <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
            <IoCloudUpload className="text-white text-xs" />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">API Call</span>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${methodColors[data.method] || methodColors.GET}`}>
              {data.method || 'GET'}
            </span>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-600 truncate font-mono">{data.url || 'Click to set URL...'}</p>
          </div>
          {data.saveResponseAs && (
            <div className="mt-2 flex items-center gap-1">
              <span className="text-[10px] text-gray-400">Save as:</span>
              <span className="text-[10px] font-bold text-cyan-600">{data.saveResponseAs}</span>
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="success" style={{ left: '30%' }}
        className="!z-10 !h-5 !w-5 !bg-emerald-400 !border-[3px] !border-white !-bottom-2.5 !shadow-md" />
      <Handle type="source" position={Position.Bottom} id="error" style={{ left: '70%' }}
        className="!z-10 !h-5 !w-5 !bg-red-400 !border-[3px] !border-white !-bottom-2.5 !shadow-md" />
    </div>
  );
}

import { Handle, Position } from '@xyflow/react';
import { IoGitBranch } from 'react-icons/io5';

export default function ConditionNode({ data, selected }) {
  const hasCondition = data.value;
  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top}
        className="!z-10 !h-5 !w-5 !bg-amber-400 !border-[3px] !border-white !-top-2.5 !shadow-md transition-all group-hover:!scale-125" />
      <div className={`bg-white rounded-2xl shadow-md min-w-[220px] max-w-[280px] border-2 transition-all ${
        selected ? 'border-amber-500 shadow-amber-500/25 shadow-xl scale-105' : 'border-gray-100 hover:shadow-lg hover:border-amber-200'
      }`}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-t-[14px]">
          <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
            <IoGitBranch className="text-white text-xs" />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">Condition</span>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          {hasCondition ? (
            <div className="bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
              <p className="text-[10px] text-amber-600 font-bold uppercase mb-0.5">Check if message</p>
              <p className="text-xs font-semibold text-amber-800">
                {data.matchType === 'exact' ? 'equals' : 'contains'} "{data.value}"
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic text-center py-2">Click to set condition...</p>
          )}
        </div>

        {/* Yes/No footer */}
        <div className="flex border-t border-gray-100 rounded-b-[14px] overflow-hidden">
          <div className="flex-1 text-center py-2 text-[10px] font-bold text-emerald-600 bg-emerald-50/50 border-r border-gray-100">
            <span className="inline-block w-3 h-3 bg-emerald-400 rounded-full mr-1 align-middle" /> Yes
          </div>
          <div className="flex-1 text-center py-2 text-[10px] font-bold text-red-500 bg-red-50/50">
            <span className="inline-block w-3 h-3 bg-red-400 rounded-full mr-1 align-middle" /> No
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="yes" style={{ left: '30%' }}
        className="!z-10 !h-5 !w-5 !bg-emerald-400 !border-[3px] !border-white !-bottom-2.5 !shadow-md" />
      <Handle type="source" position={Position.Bottom} id="no" style={{ left: '70%' }}
        className="!z-10 !h-5 !w-5 !bg-red-400 !border-[3px] !border-white !-bottom-2.5 !shadow-md" />
    </div>
  );
}

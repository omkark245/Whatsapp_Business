import { IoChatbubble, IoDocument, IoGitBranch, IoImage, IoStop, IoTime, IoVideocam } from 'react-icons/io5';
import { DEFAULT_BUTTON_MESSAGE_TEXT, defaultData } from './flowBuilderDefaults';

const palette = [
  {
    type: 'messageNode', label: 'Text Message', icon: IoChatbubble,
    data: { ...defaultData.messageNode, messageType: 'text' },
    accent: 'bg-primary', bg: 'bg-white hover:bg-primary-light/60', text: 'text-slate-700', border: 'border-slate-200 hover:border-primary/40',
    desc: 'Send a simple text message',
  },
  {
    type: 'messageNode', label: 'Button Message', icon: IoChatbubble,
    data: {
      ...defaultData.messageNode,
      messageType: 'text',
      text: DEFAULT_BUTTON_MESSAGE_TEXT,
      buttons: [{ title: 'Yes', payload: '' }, { title: 'No', payload: '' }],
    },
    accent: 'bg-emerald-600', bg: 'bg-white hover:bg-primary-light/60', text: 'text-slate-700', border: 'border-slate-200 hover:border-primary/40',
    desc: 'Send quick reply buttons',
  },
  {
    type: 'messageNode', label: 'Image Message', icon: IoImage,
    data: { ...defaultData.messageNode, messageType: 'image' },
    accent: 'bg-sky-500', bg: 'bg-white hover:bg-sky-50', text: 'text-slate-700', border: 'border-slate-200 hover:border-sky-200',
    desc: 'Send image with caption',
  },
  {
    type: 'messageNode', label: 'Video Message', icon: IoVideocam,
    data: { ...defaultData.messageNode, messageType: 'video' },
    accent: 'bg-orange-500', bg: 'bg-white hover:bg-orange-50', text: 'text-slate-700', border: 'border-slate-200 hover:border-orange-200',
    desc: 'Send video with caption',
  },
  {
    type: 'messageNode', label: 'Document', icon: IoDocument,
    data: { ...defaultData.messageNode, messageType: 'document' },
    accent: 'bg-blue-600', bg: 'bg-white hover:bg-blue-50', text: 'text-slate-700', border: 'border-slate-200 hover:border-blue-200',
    desc: 'Send PDF or document',
  },
  {
    type: 'conditionNode', label: 'Condition', icon: IoGitBranch,
    data: defaultData.conditionNode,
    accent: 'bg-amber-500', bg: 'bg-white hover:bg-amber-50', text: 'text-slate-700', border: 'border-slate-200 hover:border-amber-200',
    desc: 'Split flow by reply',
  },
  {
    type: 'delayNode', label: 'Delay', icon: IoTime,
    data: defaultData.delayNode,
    accent: 'bg-slate-700', bg: 'bg-white hover:bg-slate-50', text: 'text-slate-700', border: 'border-slate-200 hover:border-slate-300',
    desc: 'Wait before next step',
  },
  {
    type: 'endNode', label: 'End Flow', icon: IoStop,
    data: defaultData.endNode,
    accent: 'bg-red-500', bg: 'bg-white hover:bg-red-50', text: 'text-slate-700', border: 'border-slate-200 hover:border-red-200',
    desc: 'End the conversation flow',
  },
];

export default function NodePalette({ onAddNode }) {
  const onDragStart = (e, item) => {
    e.dataTransfer.setData('application/reactflow', item.type);
    e.dataTransfer.setData('application/reactflow-data', JSON.stringify(item.data || defaultData[item.type] || {}));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div>
      <div className="mb-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary-light px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Flow Builder
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">Available Components</h3>
        <p className="mt-1 text-xs text-slate-500">Drag a block to the canvas or click to add it.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-1 2xl:grid-cols-2">
      {palette.map((item) => {
        const PaletteIcon = item.icon;

        return (
        <div key={item.label} className="relative group/item">
          <div
            draggable
            onDragStart={(e) => onDragStart(e, item)}
            onClick={() => onAddNode(item.type, item.data || defaultData[item.type])}
            className={`flex min-h-[58px] cursor-grab items-center gap-2 rounded-xl border px-2.5 py-2.5 shadow-sm transition-all hover:shadow-md active:scale-[0.98] active:cursor-grabbing sm:min-h-[64px] sm:gap-3 sm:px-3 sm:py-3 ${item.bg} ${item.text} ${item.border}`}
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm sm:h-10 sm:w-10 ${item.accent}`}>
              <PaletteIcon className="text-base sm:text-lg" />
            </div>
            <div className="min-w-0">
              <span className="block truncate text-xs font-semibold sm:text-sm">{item.label}</span>
              <span className="mt-0.5 hidden truncate text-[11px] text-slate-400 sm:block">{item.desc}</span>
            </div>
          </div>
          {/* Tooltip */}
          <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-1.5 text-[10px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/item:opacity-100 sm:block">
            {item.desc}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-900 rotate-45" />
          </div>
        </div>
      )})}
      </div>
    </div>
  );
}

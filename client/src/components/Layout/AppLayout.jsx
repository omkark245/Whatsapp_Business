import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { IoMenu } from 'react-icons/io5';
import { RiWhatsappFill } from 'react-icons/ri';
import Sidebar from './Sidebar';
import useSocket from '../../hooks/useSocket';

export default function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  useSocket();

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] min-w-0 overflow-hidden bg-background">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:ml-[260px]">
        <header className="flex min-w-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] shadow-sm lg:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
              <RiWhatsappFill className="text-xl" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-gray-800">Finlec Technologies WA Platform</h1>
              <p className="text-[11px] text-gray-500">Business Suite</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50"
            aria-label="Open navigation"
          >
            <IoMenu className="text-xl" />
          </button>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

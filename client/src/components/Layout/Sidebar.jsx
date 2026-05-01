import { NavLink } from 'react-router-dom';
import { IoChatbubbles, IoDocumentText, IoGitNetwork, IoMegaphone, IoPeople, IoSettings, IoLogOut, IoFlash, IoChatbox, IoStatsChart, IoWater, IoClose, IoReceipt } from 'react-icons/io5';
import { RiWhatsappFill } from 'react-icons/ri';
import useAuthStore from '../../store/authStore';
import useAccountStore from '../../store/accountStore';
import useConfirmDialog from '../../hooks/useConfirmDialog';

const navItems = [
  { path: '/chat', icon: IoChatbubbles, label: 'Chats', roles: ['admin', 'member'] },
  { path: '/contacts', icon: IoPeople, label: 'Contacts', roles: ['admin', 'member'] },
  { path: '/templates', icon: IoDocumentText, label: 'Templates', roles: ['admin'] },
  { path: '/quick-replies', icon: IoFlash, label: 'Quick Replies', roles: ['admin'] },
  { path: '/auto-replies', icon: IoChatbox, label: 'Auto Replies', roles: ['admin'] },
  { path: '/flows', icon: IoGitNetwork, label: 'Flows', roles: ['admin'] },
  { path: '/campaigns', icon: IoMegaphone, label: 'Campaigns', roles: ['admin', 'member'] },
  { path: '/drip-campaigns', icon: IoWater, label: 'Drip Campaigns', roles: ['admin'] },
  { path: '/teams', icon: IoPeople, label: 'Teams', roles: ['admin'] },
  { path: '/usage', icon: IoReceipt, label: 'Usage', roles: ['admin'] },
  { path: '/analytics', icon: IoStatsChart, label: 'Analytics', roles: ['admin'] },
  { path: '/settings', icon: IoSettings, label: 'Settings', roles: ['admin'] },
  
];

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { logout, user } = useAuthStore();
  const { activeAccount } = useAccountStore();
  const { confirm, confirmDialog } = useConfirmDialog();
  const visibleNavItems = navItems.filter((item) => item.roles.includes(user?.role || 'admin'));

  const handleLogout = async () => {
    const approved = await confirm({
      title: 'Logout',
      message: 'Are you sure you want to logout from the portal?',
      confirmLabel: 'Logout',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });

    if (!approved) return;
    onClose();
    await logout();
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-950/45 transition-opacity lg:hidden ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-[100dvh] min-h-[100dvh] w-[calc(100vw-0.75rem)] max-w-[320px] flex-col overflow-hidden bg-sidebar pt-[env(safe-area-inset-top)] text-white shadow-2xl transition-transform duration-300 lg:w-[260px] lg:translate-x-0 lg:pt-0 lg:shadow-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="border-b border-white/10 px-5 py-5">
          <div className="mb-4 flex items-center justify-between lg:mb-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
                <RiWhatsappFill className="text-xl text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold tracking-tight"> Finlec Technologies</h1>
                <p className="truncate text-[10px] font-medium uppercase tracking-wider text-gray-500"> Whatsapp Business Suite</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
              aria-label="Close navigation"
            >
              <IoClose className="text-lg" />
            </button>
          </div>
          {activeAccount && (
            <div className="mt-3 rounded-lg bg-white/5 px-3 py-2">
              <p className="truncate text-xs font-medium text-gray-300">
                {activeAccount.businessName || 'WhatsApp Account'}
              </p>
              <p className="truncate text-[11px] text-gray-500">{activeAccount.phoneNumber}</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {visibleNavItems.map((item) => {
            const NavIcon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-primary/20 text-primary shadow-sm'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <NavIcon className="flex-shrink-0 text-lg" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
            
        {/* User Section */}
        <div className="border-t border-white/10 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-sm font-bold text-white">
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-[11px] uppercase tracking-wide text-gray-500">
                {user?.role === 'member' ? 'Team Member' : 'Admin'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/5 hover:text-red-400"
              title="Logout"
            >
              <IoLogOut className="text-lg" />
            </button>
          </div>
        </div>
        {confirmDialog}
      </aside>
    </>
  );
}

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore';
import AppLayout from './components/Layout/AppLayout';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Chat from './pages/Chat';
import Templates from './pages/Templates';
import Flows from './pages/Flows';
import Campaigns from './pages/Campaigns';
import ContactGroups from './pages/ContactGroups';
import Settings from './pages/Settings';
import QuickReplies from './pages/QuickReplies';
import AutoReplies from './pages/AutoReplies';
import Analytics from './pages/Analytics';
import DripCampaigns from './pages/DripCampaigns';
import Usage from './pages/Usage';
import TeamManagement from './pages/TeamManagement';

function ProtectedRoute({ children }) {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (!user?.mustChangePassword && location.pathname === '/change-password') {
    return <Navigate to="/chat" replace />;
  }

  return children;
}

function RoleRoute({ children, allowMembers = false }) {
  const { user } = useAuthStore();

  if (user?.role === 'member' && !allowMembers) {
    return <Navigate to="/chat" replace />;
  }

  return children;
}

function AppRoutes() {
  const { isAuthenticated, user, checkAuth } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      checkAuth();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginRedirect = user?.mustChangePassword ? '/change-password' : '/chat';

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to={loginRedirect} replace /> : <Login />} />
      <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="chat" element={<RoleRoute allowMembers><Chat /></RoleRoute>} />
        <Route path="templates" element={<RoleRoute><Templates /></RoleRoute>} />
        <Route path="flows" element={<RoleRoute><Flows /></RoleRoute>} />
        <Route path="flows/new" element={<RoleRoute><Flows /></RoleRoute>} />
        <Route path="flows/:flowId/edit" element={<RoleRoute><Flows /></RoleRoute>} />
        <Route path="campaigns" element={<RoleRoute allowMembers><Campaigns /></RoleRoute>} />
        <Route path="teams" element={<RoleRoute><TeamManagement /></RoleRoute>} />
        <Route path="drip-campaigns" element={<RoleRoute><DripCampaigns /></RoleRoute>} />
        <Route path="contacts" element={<RoleRoute allowMembers><ContactGroups /></RoleRoute>} />
        <Route path="quick-replies" element={<RoleRoute><QuickReplies /></RoleRoute>} />
        <Route path="auto-replies" element={<RoleRoute><AutoReplies /></RoleRoute>} />
        <Route path="usage" element={<RoleRoute><Usage /></RoleRoute>} />
        <Route path="analytics" element={<RoleRoute><Analytics /></RoleRoute>} />
        <Route path="settings" element={<RoleRoute><Settings /></RoleRoute>} />
      </Route>
      <Route path="*" element={<Navigate to={loginRedirect} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
    </BrowserRouter>
  );
}

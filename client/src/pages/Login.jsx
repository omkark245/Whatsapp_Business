import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RiWhatsappFill } from 'react-icons/ri';
import { IoShieldCheckmark, IoChatbubbles, IoFlash, IoEye, IoEyeOff } from 'react-icons/io5';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { showApiError } from '../utils/apiError';

export default function Login() {
  const [mode, setMode] = useState('login');
  const isRegister = mode === 'register';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, register, loading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let user = null;
      if (isRegister) {
        user = await register(name.trim(), email, password);
        toast.success('Account created!');
      } else {
        user = await login(email, password);
        toast.success('Login successful!');
      }
      navigate(user?.mustChangePassword ? '/change-password' : '/chat');
    } catch (error) {
      showApiError(error, 'Something went wrong');
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-y-auto bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 lg:flex-row">
      {/* Left - Branding */}
      <div className="relative hidden flex-1 overflow-hidden px-16 lg:flex lg:flex-col lg:justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-emerald-900/30" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center">
              <RiWhatsappFill className="text-white text-3xl" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Finlec Technologies WA Platform</h1>
          </div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Manage your WhatsApp<br />Business in one place
          </h2>
          <p className="text-lg text-gray-400 mb-10 max-w-md">
            Send messages, manage templates, run campaigns, and automate flows — all from a single dashboard.
          </p>
          <div className="space-y-4">
            {[
              { icon: IoChatbubbles, text: 'Real-time chat with read receipts' },
              { icon: IoFlash, text: 'Automated chatbot flows & campaigns' },
              { icon: IoShieldCheckmark, text: 'Official WhatsApp Business API' },
            ].map((feature, i) => {
              const FeatureIcon = feature.icon;

              return (
              <div key={i} className="flex items-center gap-3 text-gray-300">
                <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                  <FeatureIcon className="text-primary text-sm" />
                </div>
                <span className="text-sm">{feature.text}</span>
              </div>
            )})}
          </div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex w-full flex-1 items-center justify-center px-3 py-4 sm:px-6 sm:py-8">
        <div className="w-full max-w-[348px] rounded-2xl bg-white p-4 shadow-2xl sm:max-w-md sm:p-8">
          <div className="mb-5 text-center sm:mb-8">
            <div className="mb-3 flex items-center justify-center gap-2 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                <RiWhatsappFill className="text-white text-2xl" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-800">Finlec Technologies WA Platform</p>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Business Suite</p>
              </div>
            </div>
            <h1 className="text-[2rem] font-bold leading-tight text-gray-800 sm:text-2xl">
              {isRegister ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {isRegister ? 'Start managing your WhatsApp Business' : 'Sign in to your dashboard'}
            </p>
          </div>

          <div className="mb-4 grid gap-1.5 lg:hidden sm:mb-5 sm:gap-2">
            {[
              { icon: IoChatbubbles, text: 'Real-time team chat' },
              { icon: IoFlash, text: 'Campaigns and flows' },
              { icon: IoShieldCheckmark, text: 'Official WhatsApp API' },
            ].map((feature) => {
              const FeatureIcon = feature.icon;

              return (
                <div key={feature.text} className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FeatureIcon className="text-xs" />
                  </div>
                  <span className="font-medium">{feature.text}</span>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {isRegister && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  placeholder="Enter your name" required
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                placeholder="Enter your email address" required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full pr-12 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  placeholder="Enter your password" required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <IoEyeOff /> : <IoEye />}
                </button>
              </div>
            </div>
            <button
              type="submit" disabled={loading}
              className="w-full rounded-xl bg-primary py-2.5 text-base font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? 'Please wait...' : (isRegister ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-500">
            {isRegister ? 'Already have an account?' : "Don’t have an account?"}{' '}
            <button
              type="button"
              onClick={() => setMode(isRegister ? 'login' : 'register')}
              className="font-semibold text-primary hover:text-primary-hover"
            >
              {isRegister ? 'Sign in' : 'Create one'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

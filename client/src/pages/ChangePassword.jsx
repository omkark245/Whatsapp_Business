import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { IoEye, IoEyeOff, IoLockClosed } from 'react-icons/io5';
import { RiWhatsappFill } from 'react-icons/ri';
import useAuthStore from '../store/authStore';
import { showApiError } from '../utils/apiError';

function PasswordField({ label, value, onChange, show, onToggle, placeholder }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 pr-12 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30"
          placeholder={placeholder}
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <IoEyeOff /> : <IoEye />}
        </button>
      </div>
    </div>
  );
}

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, changePassword, logout, loading } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (newPassword.length < 6) {
      toast.error('New password should be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Confirm password does not match.');
      return;
    }

    try {
      await changePassword(currentPassword, newPassword);
      toast.success('Password updated successfully.');
      navigate('/chat', { replace: true });
    } catch (error) {
      showApiError(error, 'Failed to update password.');
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-start justify-center overflow-y-auto bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4 py-6 sm:items-center sm:px-6 sm:py-8">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-8">
        <div className="mb-6 text-center sm:mb-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white">
            <RiWhatsappFill className="text-2xl" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Change Your Password</h1>
          <p className="mt-2 text-sm text-gray-500">
            {user?.name ? `Hi ${user.name}, ` : ''}
            update your temporary password before entering the inbox.
          </p>
        </div>

        <div className="mb-5 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-gray-700">
          <div className="mb-1 flex items-center gap-2 font-semibold text-gray-800">
            <IoLockClosed className="text-primary" />
            One-time security step
          </div>
          <p>Your admin gave you a temporary password. Set your own password now.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField
            label="Current Password"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrent}
            onToggle={() => setShowCurrent((prev) => !prev)}
            placeholder="Enter current password"
          />
          <PasswordField
            label="New Password"
            value={newPassword}
            onChange={setNewPassword}
            show={showNew}
            onToggle={() => setShowNew((prev) => !prev)}
            placeholder="Choose a strong password"
          />
          <PasswordField
            label="Confirm New Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showConfirm}
            onToggle={() => setShowConfirm((prev) => !prev)}
            placeholder="Re-enter the new password"
          />

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <button
              type="button"
              onClick={logout}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-3 font-semibold text-gray-600 transition-colors hover:bg-gray-50"
            >
              Logout
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-primary px-4 py-3 font-semibold text-white shadow-lg shadow-primary/25 transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {loading ? 'Saving...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

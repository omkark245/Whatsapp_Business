import { IoAlertCircle, IoClose } from 'react-icons/io5';
import { createPortal } from 'react-dom';

const toneStyles = {
  danger: {
    iconWrap: 'bg-red-50 text-red-500',
    confirm: 'bg-red-500 text-white hover:bg-red-600 shadow-sm shadow-red-500/20',
  },
  primary: {
    iconWrap: 'bg-primary/10 text-primary',
    confirm: 'bg-primary text-white hover:bg-primary-hover shadow-sm shadow-primary/20',
  },
};

export default function ConfirmDialog({
  open,
  title = 'Please confirm',
  message = 'Are you sure you want to continue?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const styles = toneStyles[tone] || toneStyles.danger;
  const dialog = (
    <div className="app-modal-overlay z-[100] bg-black/50" onClick={onCancel}>
      <div className="app-modal-panel max-w-[22rem] sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex justify-end sm:mb-5">
          <button onClick={onCancel} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 sm:h-9 sm:w-9">
            <IoClose />
          </button>
        </div>

        <div className="mb-6 flex flex-col items-center text-center sm:mb-7">
          <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${styles.iconWrap} sm:h-14 sm:w-14`}>
            <IoAlertCircle className="text-xl sm:text-2xl" />
          </div>
          <h2 className="text-lg font-bold text-gray-800 sm:text-xl">{title}</h2>
          <p className="mt-2 max-w-[18rem] text-sm leading-6 text-gray-500 sm:max-w-sm sm:leading-7">{message}</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button onClick={onCancel} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 sm:px-5">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors sm:px-5 ${styles.confirm}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}

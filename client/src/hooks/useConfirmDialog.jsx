import { useCallback, useRef, useState } from 'react';
import ConfirmDialog from '../components/ui/ConfirmDialog';

const defaultOptions = {
  title: 'Please confirm',
  message: 'Are you sure you want to continue?',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  tone: 'danger',
};

export default function useConfirmDialog() {
  const resolverRef = useRef(null);
  const [options, setOptions] = useState({ ...defaultOptions, open: false });

  const closeDialog = useCallback((value) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions((current) => ({ ...current, open: false }));
  }, []);

  const confirm = useCallback((nextOptions = {}) => (
    new Promise((resolve) => {
      resolverRef.current = resolve;
      setOptions({ ...defaultOptions, ...nextOptions, open: true });
    })
  ), []);

  return {
    confirm,
    confirmDialog: (
      <ConfirmDialog
        open={options.open}
        title={options.title}
        message={options.message}
        confirmLabel={options.confirmLabel}
        cancelLabel={options.cancelLabel}
        tone={options.tone}
        onConfirm={() => closeDialog(true)}
        onCancel={() => closeDialog(false)}
      />
    ),
  };
}

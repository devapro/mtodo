import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';

type ToastVariant = 'success' | 'danger' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastApi {
  notify: (message: string, variant?: ToastVariant) => void;
  error: (message: string) => void;
  success: (message: string) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

let counter = 0;

/** Non-blocking, auto-dismissing notifications for action feedback/errors. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++counter;
    setToasts((prev) => [...prev, { id, message, variant }]);
  }, []);

  const api: ToastApi = {
    notify,
    error: useCallback((m: string) => notify(m, 'danger'), [notify]),
    success: useCallback((m: string) => notify(m, 'success'), [notify]),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer position="bottom-end" className="p-3" style={{ zIndex: 1100 }}>
        {toasts.map((t) => (
          <Toast
            key={t.id}
            bg={t.variant}
            onClose={() => remove(t.id)}
            delay={t.variant === 'danger' ? 6000 : 3000}
            autohide
          >
            <Toast.Body className={t.variant === 'info' ? '' : 'text-white'}>
              {t.message}
            </Toast.Body>
          </Toast>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

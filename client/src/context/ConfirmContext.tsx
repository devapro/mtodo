import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use the danger styling for destructive actions (delete, leave, etc.). */
  variant?: 'danger' | 'primary';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

interface PendingState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Provides a promise-based `confirm()` that renders a themed Bootstrap modal,
 * replacing the browser's native (unstyled, blocking) confirm() dialog.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingState | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const settle = (value: boolean) => {
    if (pending) pending.resolve(value);
    setPending(null);
  };

  const variant = pending?.variant ?? 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal show={!!pending} onHide={() => settle(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{pending?.title ?? t('confirm.defaultTitle')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>{pending?.message}</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => settle(false)}>
            {pending?.cancelLabel ?? t('common.cancel')}
          </Button>
          <Button variant={variant} onClick={() => settle(true)} autoFocus>
            {pending?.confirmLabel ?? t('confirm.defaultConfirm')}
          </Button>
        </Modal.Footer>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

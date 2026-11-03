'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { IconClose } from './Icons';

export interface ToastInput {
  message: string;
  /** Usually "Undo". */
  action?: { label: string; onClick: () => void };
  tone?: 'default' | 'error';
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

/** Show a transient message at the bottom of the window, optionally with Undo. */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((t: ToastInput) => {
    if (timer.current) clearTimeout(timer.current);
    seq.current += 1;
    setToast({ ...t, id: seq.current });
    timer.current = setTimeout(() => setToast(null), t.action ? 6000 : 3500);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[9500] flex justify-center px-4"
      >
        {toast && (
          <div
            key={toast.id}
            role="status"
            className="rise-in pointer-events-auto flex items-center gap-3 rounded-lg border border-border-default bg-surface-1 py-2 pl-4 pr-2 text-body shadow-lg"
          >
            <span
              className={toast.tone === 'error' ? 'text-[var(--critical)]' : 'text-text-primary'}
            >
              {toast.message}
            </span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss();
                }}
                className="rounded-md px-2 py-0.5 text-body font-medium text-accent hover:bg-accent-subtle"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismiss}
              className="rounded-md p-1 text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
            >
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

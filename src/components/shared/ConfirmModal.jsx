import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * ConfirmContext — a Promise-based confirm() replacement that renders a
 * styled glass-panel modal instead of the OS-native confirm() dialog.
 *
 * Usage:
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: 'Delete Files',
 *     message: 'Permanently delete 12 files (~4.2 GB)?',
 *     confirmLabel: 'Delete',
 *     danger: true
 *   });
 *   if (!ok) return;
 *
 * Replaces the native window.confirm() calls in:
 *   - LargeFileFinder.jsx (delete files)
 *   - StartupManager.jsx (toggle startup app)
 *   - OneClickCare.jsx (restore-point failures, enable-restore)
 *   - Diagnostics.jsx (mock full report)
 */
const ConfirmContext = createContext(null);

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
};

export function ConfirmProvider({ children }) {
  const [modal, setModal] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setModal({
        title: opts.title || 'Confirm',
        message: opts.message || 'Are you sure?',
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
        danger: !!opts.danger,
        detail: opts.detail || null
      });
    });
  }, []);

  const close = useCallback((result) => {
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
    setModal(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {modal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => close(false)}
        >
          <div
            className="glass-panel border border-brand-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  modal.danger
                    ? 'bg-rose-500/15 text-rose-400'
                    : 'bg-amber-500/15 text-amber-400'
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-100">{modal.title}</h3>
                <p className="text-sm text-slate-400 mt-1 break-words">{modal.message}</p>
                {modal.detail && (
                  <div className="mt-3 text-xs text-slate-500 bg-slate-900/40 rounded-lg p-2 border border-brand-border">
                    {modal.detail}
                  </div>
                )}
              </div>
              <button
                onClick={() => close(false)}
                className="shrink-0 text-slate-500 hover:text-white text-lg leading-none"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => close(false)}
                className="px-4 py-2 text-xs font-bold rounded-lg border border-brand-border text-slate-300 hover:bg-slate-800/60 cursor-pointer"
              >
                {modal.cancelLabel}
              </button>
              <button
                onClick={() => close(true)}
                className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer ${
                  modal.danger
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-brand-violet hover:bg-brand-violet/80 text-white'
                }`}
              >
                {modal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { ToastMessage } from '../types';

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-3 left-auto max-w-[260px] sm:max-w-[290px] z-50 flex flex-col items-end gap-1.5 pointer-events-none">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';

        return (
          <div
            key={toast.id}
            className="pointer-events-auto w-full flex items-start gap-2 px-3 py-2 rounded-xl bg-white/65 backdrop-blur-md border border-white/50 shadow-md shadow-slate-900/5 transition-all duration-200 animate-in fade-in slide-in-from-top-2"
          >
            <div className="shrink-0 mt-0.5">
              {isSuccess && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              {isError && <AlertCircle className="w-3.5 h-3.5 text-rose-600" />}
              {isWarning && <AlertCircle className="w-3.5 h-3.5 text-amber-600" />}
              {!isSuccess && !isError && !isWarning && <Info className="w-3.5 h-3.5 text-indigo-600" />}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-slate-800 leading-snug">{toast.title}</h4>
              {toast.description && (
                <p className="text-[10.5px] text-slate-600/90 mt-0.5 leading-snug line-clamp-2">
                  {toast.description}
                </p>
              )}
            </div>

            {toast.action && (
              <button
                onClick={() => {
                  onDismiss(toast.id);
                  toast.action?.onClick();
                }}
                className="btn-gradient shrink-0 self-center px-2 py-0.5 rounded-md text-white text-[10px] font-bold"
              >
                {toast.action.label}
              </button>
            )}

            <button
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 p-0.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100/40 transition"
              aria-label="Close notification"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
};


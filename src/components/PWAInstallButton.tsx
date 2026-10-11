import React, { useState } from 'react';
import { Download, CheckCircle2, Share2, PlusSquare, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'primary' | 'subtle' | 'compact';
  label?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'primary',
  label = 'ইনস্টল করুন (Install App)',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // If already running inside an installed standalone PWA
  if (isInstalled) {
    if (variant === 'compact') return null;
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200/80 shadow-xs ${className}`}>
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>অ্যাপটি ইনস্টল রয়েছে (Installed)</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (isInstallable) {
      setIsInstalling(true);
      try {
        await install();
      } finally {
        setIsInstalling(false);
      }
    } else {
      // If the browser hasn't fired beforeinstallprompt yet or doesn't support it
      setShowInfoModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        disabled={isInstalling}
        title="স্মার্টফোনে বা কম্পিউটারে ১-ক্লিকে অ্যাপ হিসেবে ইনস্টল করুন"
        className={`group relative overflow-hidden transition-all duration-200 cursor-pointer active:scale-95 ${
          variant === 'primary'
            ? 'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white shadow-md shadow-indigo-500/25 bg-gradient-to-r from-indigo-600 via-sky-600 to-indigo-600 bg-[length:200%_auto] hover:bg-right hover:shadow-lg'
            : variant === 'subtle'
            ? 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white/70 hover:bg-white border border-slate-200/80 shadow-xs'
            : 'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200'
        } ${className}`}
      >
        <Download className="w-4 h-4 shrink-0 animate-bounce group-hover:scale-110 transition-transform" />
        <span>{label}</span>
      </button>

      {/* iOS Safari Guide Modal */}
      {showIOSModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-150 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  iPhone / iPad-এ অ্যাপ ইনস্টল
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Safari ব্রাউজারে ২-টি সহজ ধাপে অ্যাপটি আপনার হোম স্ক্রিনে যুক্ত করুন:
            </p>

            <ol className="space-y-2.5 text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                  ১
                </span>
                <span>
                  Safari ব্রাউজারের নিচের বারে <strong>Share</strong> (
                  <Share2 className="w-3.5 h-3.5 inline text-sky-600" />
                  ) বাটনে চাপ দিন।
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                  ২
                </span>
                <span>
                  তালিকায় নিচে স্ক্রল করে <strong>Add to Home Screen</strong> (
                  <PlusSquare className="w-3.5 h-3.5 inline text-indigo-600" />
                  ) নির্বাচন করুন।
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition"
            >
              ঠিক আছে (Got it)
            </button>
          </div>
        </div>
      )}

      {/* Chrome / Android / Desktop fallback instructions if prompt is not immediately ready */}
      {showInfoModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-150 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  হোম স্ক্রিনে ইনস্টল করুন
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              আপনার ব্রাউজারে অ্যাপ ইনস্টল করার জন্য:
            </p>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-xs text-slate-700 space-y-2">
              <p>
                <strong>Chrome / Android:</strong> ব্রাউজারের উপরে ডানদিকের ৩-ডট (⋮) মেনুতে ট্যাপ করে <strong>"Install App"</strong> অথবা <strong>"Add to Home screen"</strong> চাপুন।
              </p>
              <p>
                <strong>Desktop:</strong> ব্রাউজারের অ্যাড্রেস বারের ডানপাশে থাকা ইনস্টল আইকনে (Install icon) ক্লিক করুন।
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition"
            >
              বন্ধ করুন (Close)
            </button>
          </div>
        </div>
      )}
    </>
  );
};

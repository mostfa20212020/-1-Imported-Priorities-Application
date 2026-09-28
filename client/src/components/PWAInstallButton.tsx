import React, { useState } from "react";
import { Download, Share, X, CheckCircle, Smartphone } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = "" }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // If already running in standalone mode or installed, hide
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    setIsInstalling(true);
    try {
      await install();
    } finally {
      setIsInstalling(false);
    }
  };

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={handleInstallClick}
        disabled={isInstalling}
        type="button"
        className={`inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold shadow-sm transition-all duration-200 active:scale-95 ${className}`}
        title="تثبيت التطبيق على جهازك للعمل بدون إنترنت وبأداء سريع"
      >
        <Download size={14} className={isInstalling ? "animate-bounce" : ""} />
        <span>تثبيت التطبيق (PWA)</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          type="button"
          className={`inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white/90 text-slate-700 hover:bg-slate-100 px-3 py-1.5 text-xs font-medium shadow-sm transition-all ${className}`}
          title="تثبيت على أجهزة iPhone أو iPad"
        >
          <Smartphone size={14} />
          <span>تثبيت على iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-right">
              <div className="flex items-center justify-between mb-4 border-b pb-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="text-primary" size={20} />
                  <h3 className="text-base font-bold text-slate-900">تثبيت التطبيق على iPhone / iPad</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">1</span>
                  <p>اضغط على زر <strong>المشاركة (Share)</strong> <Share size={14} className="inline mx-1 text-blue-600" /> في شريط متصفح Safari السفلي.</p>
                </div>
                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">2</span>
                  <p>مرر للأسفل واختر <strong>إضافة إلى الصفحة الرئيسية (Add to Home Screen)</strong>.</p>
                </div>
                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">3</span>
                  <p>اضغط <strong>إضافة (Add)</strong> في الزاوية العلوية لاستخدامه كتطبيق مستقل بدون إنترنت.</p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
              >
                فهمت ذلك
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

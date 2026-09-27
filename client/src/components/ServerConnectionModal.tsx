import React, { useState, useEffect } from "react";
import { Server, Wifi, WifiOff, CheckCircle2, AlertTriangle, RefreshCw, X, Globe, Smartphone, Save } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_PRODUCTION_SERVER_URL,
  DEFAULT_DEV_SERVER_URL,
  getServerUrl,
  setCustomServerUrl,
  resetServerUrlToDefault,
  testServerConnection,
  isAndroidApk,
} from "../lib/serverConfig";

interface ServerConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ServerConnectionModal: React.FC<ServerConnectionModalProps> = ({ isOpen, onClose }) => {
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [inputUrl, setInputUrl] = useState<string>("");
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    dbConnected?: boolean;
    mode?: string;
  } | null>(null);

  const isApk = isAndroidApk();

  useEffect(() => {
    if (isOpen) {
      const active = getServerUrl();
      setCurrentUrl(active);
      setInputUrl(active);
      setTestResult(null);
      // Automatically test connection on open
      handleTest(active);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async (urlToTest?: string) => {
    setIsTesting(true);
    setTestResult(null);
    const target = urlToTest !== undefined ? urlToTest : inputUrl;
    const res = await testServerConnection(target);
    setTestResult(res);
    setIsTesting(false);
  };

  const handleSave = () => {
    const trimmed = inputUrl.trim();
    setCustomServerUrl(trimmed);
    setCurrentUrl(getServerUrl());
    toast.success("تم حفظ إعدادات ربط الخادم وقاعدة البيانات");
    // If running in APK or custom host, reload to apply across queries
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  const handleReset = () => {
    resetServerUrlToDefault();
    const def = getServerUrl();
    setInputUrl(def);
    setCurrentUrl(def);
    toast.info("تمت استعادة عنوان السيرفر الافتراضي");
    handleTest(def);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" dir="rtl">
      <div
        className="modal-card"
        style={{ maxWidth: "560px", width: "95%", borderRadius: "16px", padding: "24px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "rgba(22, 59, 80, 0.1)",
                color: "#163b50",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Server size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#163b50" }}>
                ربط التطبيق بالسيرفر وقاعدة البيانات
              </h2>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                إعداد الاتصال بين تطبيق الأندرويد (APK) وقاعدة البيانات السحابية
              </span>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} title="إغلاق">
            <X size={18} />
          </button>
        </div>

        {/* Environment Indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 14px",
            background: isApk ? "rgba(22, 101, 52, 0.08)" : "rgba(30, 64, 175, 0.06)",
            borderRadius: "10px",
            border: `1px solid ${isApk ? "#bbf7d0" : "#bfdbfe"}`,
            marginBottom: "16px",
            fontSize: "13px",
          }}
        >
          {isApk ? <Smartphone size={18} color="#166534" /> : <Globe size={18} color="#1e40af" />}
          <div>
            <strong>البيئة الحالية: </strong>
            <span>{isApk ? "تطبيق أندرويد مثبت (Android APK Package)" : "متصفح الويب (Web App)"}</span>
          </div>
        </div>

        {/* Test Connection Status Banner */}
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "10px",
            marginBottom: "16px",
            border: "1px solid",
            background: testResult
              ? testResult.success
                ? "#f0fdf4"
                : "#fef2f2"
              : "#f8fafc",
            borderColor: testResult
              ? testResult.success
                ? "#bbf7d0"
                : "#fecaca"
              : "#e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {isTesting ? (
              <RefreshCw size={20} className="spin" color="#64748b" />
            ) : testResult ? (
              testResult.success ? (
                <CheckCircle2 size={20} color="#16a34a" />
              ) : (
                <AlertTriangle size={20} color="#dc2626" />
              )
            ) : (
              <Wifi size={20} color="#64748b" />
            )}
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>
                {isTesting
                  ? "جارٍ فحص الاتصال بقاعدة البيانات..."
                  : testResult
                  ? testResult.message
                  : "اضغط على فحص للتحقق من الاتصال"}
              </div>
              {testResult?.mode && (
                <div style={{ fontSize: "11px", color: "#166534", marginTop: "2px" }}>
                  حالة قاعدة البيانات: <strong>{testResult.mode}</strong>
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            className="outline-button small"
            onClick={() => handleTest()}
            disabled={isTesting}
            style={{ fontSize: "12px", whiteSpace: "nowrap" }}
          >
            {isTesting ? "جارِ الفحص..." : "إعادة الفحص"}
          </button>
        </div>

        {/* URL Input */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
            عنوان خادم النيابة وقاعدة البيانات (Server Host URL):
          </label>
          <input
            type="url"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="https://ais-pre-t2wzhx55boaictgft557tx-50969848752.europe-west2.run.app"
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "13px",
              direction: "ltr",
              fontFamily: "monospace",
              background: "#fff",
              boxSizing: "border-box",
            }}
          />
          <span style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", display: "block" }}>
            يتصل تطبيق الـ APK بهذا العنوان لإرسال واسترجاع الأوليات والمصادقات والقضايا.
          </span>
        </div>

        {/* Quick Presets */}
        <div style={{ marginBottom: "20px" }}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "8px" }}>
            عناوين سريعة مقترحة:
          </span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="outline-button small"
              onClick={() => {
                setInputUrl(DEFAULT_PRODUCTION_SERVER_URL);
                handleTest(DEFAULT_PRODUCTION_SERVER_URL);
              }}
              style={{ fontSize: "11px" }}
            >
              السيرفر السحابي الأساسي (Production)
            </button>
            <button
              type="button"
              className="outline-button small"
              onClick={() => {
                setInputUrl(DEFAULT_DEV_SERVER_URL);
                handleTest(DEFAULT_DEV_SERVER_URL);
              }}
              style={{ fontSize: "11px" }}
            >
              سيرفر التطوير (Dev)
            </button>
            <button
              type="button"
              className="outline-button small"
              onClick={handleReset}
              style={{ fontSize: "11px", color: "#64748b" }}
            >
              استعادة الافتراضي
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button type="button" className="outline-button" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleSave}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Save size={16} />
            حفظ وتطبيق الاتصال
          </button>
        </div>
      </div>
    </div>
  );
};

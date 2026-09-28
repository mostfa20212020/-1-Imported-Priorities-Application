import React, { useState, useEffect } from "react";
import { Server, Wifi, WifiOff, CheckCircle2, AlertTriangle, RefreshCw, X, Globe, Smartphone, Save, Database, ShieldCheck, Key } from "lucide-react";
import { toast } from "sonner";
import { GoogleServicesConfigCard } from "./GoogleServicesConfigCard";
import {
  DEFAULT_PRODUCTION_SERVER_URL,
  DEFAULT_DEV_SERVER_URL,
  getServerUrl,
  setCustomServerUrl,
  resetServerUrlToDefault,
  testServerConnection,
  testFirebaseConnection,
  isAndroidApk,
} from "../lib/serverConfig";

interface ServerConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ServerConnectionModal: React.FC<ServerConnectionModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<"server" | "google_services">("server");
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [inputUrl, setInputUrl] = useState<string>("");
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    dbConnected?: boolean;
    mode?: string;
  } | null>(null);

  const [firebaseResult, setFirebaseResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isTestingFirebase, setIsTestingFirebase] = useState<boolean>(false);

  const isApk = isAndroidApk();

  useEffect(() => {
    if (isOpen) {
      const active = getServerUrl();
      setCurrentUrl(active);
      setInputUrl(active);
      setTestResult(null);
      setFirebaseResult(null);
      // Automatically test connections on open
      handleTest(active);
      handleTestFirebase();
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

  const handleTestFirebase = async () => {
    setIsTestingFirebase(true);
    const res = await testFirebaseConnection();
    setFirebaseResult(res);
    setIsTestingFirebase(false);
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
        style={{ maxWidth: "640px", width: "95%", borderRadius: "16px", padding: "24px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
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
                إعدادات الربط والتهيئة السحابية
              </h2>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                إعداد الاتصال بين التطبيق والسيرفر ومعايير google-services.json
              </span>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} title="إغلاق">
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>
          <button
            type="button"
            onClick={() => setActiveTab("server")}
            style={{
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: activeTab === "server" ? "#163b50" : "#f1f5f9",
              color: activeTab === "server" ? "#ffffff" : "#475569",
              border: "none",
              transition: "all 0.15s ease",
            }}
          >
            <Server size={14} />
            <span>ربط الخادم وقاعدة البيانات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("google_services")}
            style={{
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: activeTab === "google_services" ? "#163b50" : "#f1f5f9",
              color: activeTab === "google_services" ? "#ffffff" : "#475569",
              border: "none",
              transition: "all 0.15s ease",
            }}
          >
            <Key size={14} />
            <span>معايير google-services.json (مع قناع المفتاح)</span>
          </button>
        </div>

        {activeTab === "google_services" ? (
          <div>
            <GoogleServicesConfigCard />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
              <button type="button" className="outline-button" onClick={onClose}>
                إغلاق
              </button>
            </div>
          </div>
        ) : (
          <>
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

        {/* Firebase Firestore Status Banner */}
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "10px",
            marginBottom: "12px",
            border: "1px solid",
            background: firebaseResult
              ? firebaseResult.success
                ? "#f0fdf4"
                : "#fef2f2"
              : "#f8fafc",
            borderColor: firebaseResult
              ? firebaseResult.success
                ? "#bbf7d0"
                : "#fecaca"
              : "#e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Database size={20} color={firebaseResult?.success ? "#16a34a" : "#dc2626"} />
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>
                {isTestingFirebase
                  ? "جارٍ فحص الاتصال بقاعدة بيانات Google Firestore..."
                  : firebaseResult
                  ? firebaseResult.message
                  : "فحص الاتصال المباشر بقاعدة بيانات Firebase"}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                قاعدة البيانات السحابية: <strong>ai-studio-idaratalawliyat</strong> (قواعد الأمان مفعلة ومعتمدة)
              </div>
            </div>
          </div>
          <button
            type="button"
            className="outline-button small"
            onClick={handleTestFirebase}
            disabled={isTestingFirebase}
            style={{ fontSize: "12px", whiteSpace: "nowrap" }}
          >
            {isTestingFirebase ? "جارِ الفحص..." : "فحص Firebase"}
          </button>
        </div>

        {/* Server & Cloud SQL Connection Status Banner */}
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
                  ? "جارٍ فحص الاتصال بخادم النيابة العامة (API)..."
                  : testResult
                  ? testResult.message
                  : "اضغط على فحص للتحقق من الاتصال بالخادم"}
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
        </>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from "react";
import {
  Key,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Upload,
  Save,
  RefreshCw,
  Copy,
  Lock,
  Smartphone,
  FileCode,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { testFirebaseConnection } from "../lib/serverConfig";

interface GoogleServicesConfig {
  packageName: string;
  sha1: string;
  apiKey: string;
  projectId: string;
  appId?: string;
}

const STORAGE_KEY = "alawliyat_google_services_config";
const DEFAULT_PROJECT_ID = "ai-studio-idaratalawliyat-079a9967-1370-43d6-8add-07c07949ff1f";

export const GoogleServicesConfigCard: React.FC<{ className?: string }> = ({ className = "" }) => {
  const [config, setConfig] = useState<GoogleServicesConfig>({
    packageName: "com.idarat.alawliyat",
    sha1: "",
    apiKey: "",
    projectId: DEFAULT_PROJECT_ID,
    appId: "",
  });

  // Toggle state to mask/unmask API Key field
  const [isApiKeyVisible, setIsApiKeyVisible] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  // Validation results state
  const [validation, setValidation] = useState<{
    tested: boolean;
    packageValid: boolean;
    sha1Valid: boolean;
    apiKeyValid: boolean;
    errors: string[];
  }>({
    tested: false,
    packageValid: true,
    sha1Valid: true,
    apiKeyValid: true,
    errors: [],
  });

  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Load saved configuration from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setConfig((prev) => ({
          ...prev,
          ...parsed,
          projectId: parsed.projectId || DEFAULT_PROJECT_ID,
        }));
      }
    } catch {
      // ignore parse error
    }
  }, []);

  // Validate format of parameters
  const validateParams = (cfg: GoogleServicesConfig) => {
    const errors: string[] = [];

    // Package name validation (e.g. com.example.app)
    const packageRegex = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
    const packageValid = packageRegex.test(cfg.packageName.trim());
    if (!packageValid && cfg.packageName.trim()) {
      errors.push("اسم الحزمة (Package Name) غير صحيح، يجب أن يكون بصيغة مثل: com.idarat.alawliyat");
    }

    // SHA-1 validation (40 hex chars or 20 pairs with colons)
    const cleanSha1 = cfg.sha1.replace(/[: -]/g, "");
    const sha1Regex = /^[0-9a-fA-F]{40}$/;
    const sha1Valid = !cfg.sha1.trim() || sha1Regex.test(cleanSha1);
    if (!sha1Valid && cfg.sha1.trim()) {
      errors.push("بصمة SHA-1 غير صحيحة، يجب أن تتكون من 40 خانة بالنظام السداسي عشري (Hexadecimal)");
    }

    // API Key validation (typically starts with AIzaSy... and is at least 35 characters)
    const apiKeyValid =
      !cfg.apiKey.trim() ||
      (cfg.apiKey.trim().length >= 25 &&
        (cfg.apiKey.trim().startsWith("AIzaSy") || cfg.apiKey.trim().length >= 30));
    if (!apiKeyValid && cfg.apiKey.trim()) {
      errors.push("مفتاح API غير متطابق مع نسق Google Cloud / Firebase القياسي (يبدأ عادة بـ AIzaSy)");
    }

    return {
      packageValid: !cfg.packageName.trim() || packageValid,
      sha1Valid,
      apiKeyValid,
      errors,
    };
  };

  const handleValidate = () => {
    const result = validateParams(config);
    setValidation({
      tested: true,
      ...result,
    });

    if (result.errors.length === 0 && config.packageName.trim() && config.apiKey.trim()) {
      toast.success("جميع معايير google-services.json المدخلة صالحة ومطابقة للمعايير القياسية!");
    } else if (result.errors.length > 0) {
      toast.error(result.errors[0]);
    } else {
      toast.info("تم فحص التنسيق، يرجى إدخال اسم الحزمة ومفتاح الـ API للتحقق الكامل");
    }
  };

  const handleSave = () => {
    const result = validateParams(config);
    if (result.errors.length > 0) {
      toast.error(result.errors[0]);
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      toast.success("تم حفظ معايير google-services.json بنجاح في الإعدادات المحلية");
    } catch {
      toast.error("تعذر حفظ الإعدادات في الذاكرة المحلية");
    }
  };

  const handleCopyApiKey = () => {
    if (!config.apiKey) return;
    navigator.clipboard.writeText(config.apiKey);
    setCopiedKey(true);
    toast.success("تم نسخ مفتاح الـ API إلى الحافظة");
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Import from JSON file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const json = JSON.parse(text);

        const projectNumber = json.project_info?.project_number;
        const projectId = json.project_info?.project_id || DEFAULT_PROJECT_ID;
        const client = json.client?.[0];
        const packageName =
          client?.client_info?.android_client_info?.package_name || config.packageName;
        const apiKey = client?.api_key?.[0]?.current_key || config.apiKey;
        const sha1 =
          client?.client_info?.android_client_info?.certificate_hash?.[0]?.sha1_hash ||
          config.sha1;
        const appId = client?.client_info?.mobilesdk_app_id || config.appId;

        const newConfig = {
          packageName,
          sha1,
          apiKey,
          projectId,
          appId,
        };

        setConfig(newConfig);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
        toast.success("تم استيراد واستخراج معايير google-services.json بنجاح!");
      } catch (err: any) {
        toast.error("فشل قراءة الملف: تأكد من اختيار ملف google-services.json صحيح");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setConnectionTestResult(null);
    try {
      const res = await testFirebaseConnection();
      setConnectionTestResult(res);
      if (res.success) {
        toast.success("تم التحقق بنجاح من الاتصال بالسحابة وقاعدة بيانات Firestore");
      } else {
        toast.error("تعذر الاتصال بـ Firebase: " + res.message);
      }
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div
      className={`admin-settings-card ${className}`}
      style={{
        background: "#ffffff",
        border: "1px solid #d0e1db",
        borderRadius: "14px",
        padding: "22px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
      }}
      dir="rtl"
    >
      {/* Header */}
      <div
        className="admin-settings-card-head"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "18px",
          borderBottom: "1px solid #eef3f1",
          paddingBottom: "14px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            className="admin-settings-icon-box"
            style={{
              background: "#eff6ff",
              color: "#1d4ed8",
              width: "44px",
              height: "44px",
              borderRadius: "10px",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Smartphone size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#163b50" }}>
              معايير تكوين Google Services و Firebase (google-services.json)
            </h3>
            <span style={{ fontSize: "12px", color: "#627d78" }}>
              إدخال وتدقيق معايير الاتصال للتحقق من تكامل تطبيق الأندرويد والربط السحابي
            </span>
          </div>
        </div>

        {/* Import JSON button */}
        <label
          style={{
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#15803d",
            padding: "7px 14px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: 600,
            transition: "all 0.2s",
          }}
          title="تحميل ملف google-services.json واستخراج المعايير تلقائياً"
        >
          <Upload size={14} />
          <span>استيراد ملف google-services.json</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {/* Main Parameters Form */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        {/* 1. Package Name */}
        <div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "12px",
              fontWeight: 700,
              color: "#1e3a47",
              marginBottom: "6px",
            }}
          >
            <span>اسم الحزمة (Package Name)</span>
            {validation.tested && (
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  background: validation.packageValid ? "#dcfce7" : "#fee2e2",
                  color: validation.packageValid ? "#166534" : "#991b1b",
                }}
              >
                {validation.packageValid ? "صحيح" : "غير مطابق"}
              </span>
            )}
          </label>
          <input
            type="text"
            value={config.packageName}
            onChange={(e) => {
              setConfig({ ...config, packageName: e.target.value });
              setValidation((prev) => ({ ...prev, tested: false }));
            }}
            placeholder="مثال: com.idarat.alawliyat"
            style={{
              width: "100%",
              height: "38px",
              padding: "0 12px",
              borderRadius: "8px",
              border: `1px solid ${validation.tested && !validation.packageValid ? "#f87171" : "#c9d8d3"}`,
              fontSize: "12px",
              direction: "ltr",
              textAlign: "left",
              fontFamily: "monospace",
              background: "#fafcfb",
            }}
          />
          <span style={{ fontSize: "10px", color: "#698782", marginTop: "3px", display: "block" }}>
            المعرّف المسجل لتطبيق Android داخل Firebase Console
          </span>
        </div>

        {/* 2. SHA-1 Fingerprint */}
        <div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "12px",
              fontWeight: 700,
              color: "#1e3a47",
              marginBottom: "6px",
            }}
          >
            <span>بصمة الشهادة (SHA-1 Fingerprint)</span>
            {validation.tested && (
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  background: validation.sha1Valid ? "#dcfce7" : "#fee2e2",
                  color: validation.sha1Valid ? "#166534" : "#991b1b",
                }}
              >
                {validation.sha1Valid ? "صحيح" : "صيغة غير صحيحة"}
              </span>
            )}
          </label>
          <input
            type="text"
            value={config.sha1}
            onChange={(e) => {
              setConfig({ ...config, sha1: e.target.value });
              setValidation((prev) => ({ ...prev, tested: false }));
            }}
            placeholder="5E:8F:16:06:2E:A3:CD:2C:4A:0D:..."
            style={{
              width: "100%",
              height: "38px",
              padding: "0 12px",
              borderRadius: "8px",
              border: `1px solid ${validation.tested && !validation.sha1Valid ? "#f87171" : "#c9d8d3"}`,
              fontSize: "12px",
              direction: "ltr",
              textAlign: "left",
              fontFamily: "monospace",
              background: "#fafcfb",
            }}
          />
          <span style={{ fontSize: "10px", color: "#698782", marginTop: "3px", display: "block" }}>
            بصمة شهادة توقيع الـ Keystore لتأكيد الأمان والمصادقة
          </span>
        </div>

        {/* 3. API Key with Mask / Unmask Toggle (The core user request) */}
        <div style={{ gridColumn: "1 / -1" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "6px",
            }}
          >
            <label
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#1e3a47",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Key size={13} className="text-amber-600" />
              <span>مفتاح الواجهة البرمجية (API Key)</span>
            </label>

            {/* Mask/Unmask Status & Toggle Button */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "11px",
                  color: isApiKeyVisible ? "#b45309" : "#166534",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {isApiKeyVisible ? (
                  <>
                    <Eye size={12} />
                    <span>ظاهر على الشاشة</span>
                  </>
                ) : (
                  <>
                    <Lock size={12} />
                    <span>مخفي ومقنّع للأمان (Masked)</span>
                  </>
                )}
              </span>

              {/* Explicit Mask/Unmask Toggle Button */}
              <button
                type="button"
                onClick={() => setIsApiKeyVisible(!isApiKeyVisible)}
                style={{
                  background: isApiKeyVisible ? "#fef3c7" : "#f1f5f9",
                  border: `1px solid ${isApiKeyVisible ? "#fde68a" : "#cbd5e1"}`,
                  color: isApiKeyVisible ? "#92400e" : "#475569",
                  padding: "3px 10px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  transition: "all 0.15s ease",
                }}
                title={
                  isApiKeyVisible
                    ? "إخفاء مفتاح الـ API وقناعته لحماية الخصوصية"
                    : "إظهار وقراءة مفتاح الـ API بالكامل"
                }
              >
                {isApiKeyVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{isApiKeyVisible ? "إخفاء المفتاح (Mask)" : "إظهار المفتاح (Unmask)"}</span>
              </button>
            </div>
          </div>

          {/* Input with embedded toggle and copy buttons */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              type={isApiKeyVisible ? "text" : "password"}
              value={config.apiKey}
              onChange={(e) => {
                setConfig({ ...config, apiKey: e.target.value });
                setValidation((prev) => ({ ...prev, tested: false }));
              }}
              placeholder="AIzaSyA-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              autoComplete="off"
              spellCheck={false}
              style={{
                width: "100%",
                height: "40px",
                padding: "0 90px 0 14px",
                borderRadius: "8px",
                border: `1px solid ${validation.tested && !validation.apiKeyValid ? "#f87171" : "#c9d8d3"}`,
                fontSize: "13px",
                direction: "ltr",
                textAlign: "left",
                fontFamily: isApiKeyVisible ? "monospace" : "inherit",
                letterSpacing: isApiKeyVisible ? "normal" : "2px",
                background: isApiKeyVisible ? "#fffbeb" : "#fafcfb",
                color: "#0f172a",
                transition: "background-color 0.2s",
              }}
            />

            {/* Quick Action buttons inside the right of the input */}
            <div
              style={{
                position: "absolute",
                right: "6px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {/* Copy button */}
              {config.apiKey && (
                <button
                  type="button"
                  onClick={handleCopyApiKey}
                  style={{
                    background: "#f1f5f9",
                    border: "none",
                    borderRadius: "6px",
                    padding: "6px 8px",
                    cursor: "pointer",
                    color: copiedKey ? "#16a34a" : "#64748b",
                    display: "grid",
                    placeItems: "center",
                  }}
                  title="نسخ مفتاح الـ API"
                >
                  {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                </button>
              )}

              {/* Eye icon toggle inside input */}
              <button
                type="button"
                onClick={() => setIsApiKeyVisible(!isApiKeyVisible)}
                style={{
                  background: isApiKeyVisible ? "#fef3c7" : "#f1f5f9",
                  border: "none",
                  borderRadius: "6px",
                  padding: "6px 8px",
                  cursor: "pointer",
                  color: isApiKeyVisible ? "#b45309" : "#64748b",
                  display: "grid",
                  placeItems: "center",
                }}
                title={isApiKeyVisible ? "إخفاء المفتاح" : "إظهار المفتاح"}
              >
                {isApiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "4px",
              fontSize: "11px",
              color: "#64748b",
            }}
          >
            <span>
              مفتاح الـ API المستخدم لربط الواجهة الأمامية و SDK بمشروع Firebase الرسمي
            </span>
            <span style={{ fontSize: "10px", color: isApiKeyVisible ? "#b45309" : "#059669" }}>
              {isApiKeyVisible
                ? "تنبيه: المفتاح مكشوف حالياً على الشاشة"
                : "آمن: المفتاح مقنّع ومحمي من أعين المتطفلين"}
            </span>
          </div>
        </div>

        {/* 4. Project ID */}
        <div>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#1e3a47",
              marginBottom: "6px",
              display: "block",
            }}
          >
            معرف مشروع السحابة (Project ID)
          </label>
          <input
            type="text"
            value={config.projectId}
            onChange={(e) => setConfig({ ...config, projectId: e.target.value })}
            placeholder="ai-studio-idaratalawliyat-..."
            style={{
              width: "100%",
              height: "38px",
              padding: "0 12px",
              borderRadius: "8px",
              border: "1px solid #c9d8d3",
              fontSize: "12px",
              direction: "ltr",
              textAlign: "left",
              fontFamily: "monospace",
              background: "#fafcfb",
            }}
          />
        </div>

        {/* 5. Mobile App ID */}
        <div>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#1e3a47",
              marginBottom: "6px",
              display: "block",
            }}
          >
            معرف تطبيق الجوال (Mobile App ID)
          </label>
          <input
            type="text"
            value={config.appId || ""}
            onChange={(e) => setConfig({ ...config, appId: e.target.value })}
            placeholder="1:xxxxxxxxxx:android:xxxxxxxxxx"
            style={{
              width: "100%",
              height: "38px",
              padding: "0 12px",
              borderRadius: "8px",
              border: "1px solid #c9d8d3",
              fontSize: "12px",
              direction: "ltr",
              textAlign: "left",
              fontFamily: "monospace",
              background: "#fafcfb",
            }}
          />
        </div>
      </div>

      {/* Validation Result Banner */}
      {validation.tested && validation.errors.length > 0 && (
        <div
          style={{
            marginTop: "16px",
            padding: "12px 14px",
            borderRadius: "8px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: "12px",
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
          }}
        >
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            <strong>أخطاء في المعايير المدخلة:</strong>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              {validation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Connection Test Result */}
      {connectionTestResult && (
        <div
          style={{
            marginTop: "16px",
            padding: "12px 14px",
            borderRadius: "8px",
            background: connectionTestResult.success ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${connectionTestResult.success ? "#bbf7d0" : "#fecaca"}`,
            color: connectionTestResult.success ? "#166534" : "#991b1b",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {connectionTestResult.success ? (
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-red-600 shrink-0" />
          )}
          <span>{connectionTestResult.message}</span>
        </div>
      )}

      {/* Bottom Action Buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "20px",
          paddingTop: "14px",
          borderTop: "1px solid #eef3f1",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleValidate}
            style={{
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              color: "#0369a1",
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <ShieldCheck size={14} />
            <span>تدقيق وفحص المعايير</span>
          </button>

          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            style={{
              background: "#faf5ff",
              border: "1px solid #e9d5ff",
              color: "#7e22ce",
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <RefreshCw size={14} className={isTesting ? "animate-spin" : ""} />
            <span>{isTesting ? "جاري الاختبار..." : "اختبار الاتصال بـ Firebase"}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleSave}
          style={{
            background: "#163b50",
            border: "none",
            color: "#ffffff",
            padding: "8px 18px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 2px 6px rgba(22, 59, 80, 0.2)",
          }}
        >
          <Save size={14} />
          <span>حفظ معايير التكوين</span>
        </button>
      </div>
    </div>
  );
};

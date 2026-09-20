import React, { useState } from "react";
import { AlertTriangle, Trash2, X, Database } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface SystemResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SystemResetModal: React.FC<SystemResetModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [confirmText, setConfirmText] = useState("");
  const [understood, setUnderstood] = useState(false);
  const utils = trpc.useUtils();

  const clearDbMutation = trpc.files.clearDatabase.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
      utils.files.stats.invalidate();
      toast.success("تم تصفير كافة المجموعات والسجلات الحالية (الوارد والأوليات) بنجاح استعداداً للاستخدام الفعلي.");
      setConfirmText("");
      setUnderstood(false);
      onClose();
      if (onSuccess) onSuccess();
    },
    onError: (err: any) => {
      toast.error(`حدث خطأ أثناء تصفير قاعدة البيانات: ${err?.message || "خطأ غير معروف"}`);
    },
  });

  if (!isOpen) return null;

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmText.trim() !== "تصفير" || !understood) {
      toast.error("يرجى كتابة كلمة 'تصفير' بدقة وتأكيد فهمك بأن العملية نهائية.");
      return;
    }
    clearDbMutation.mutate();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
        direction: "rtl",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "480px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          border: "1px solid #fecaca",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#fef2f2",
            padding: "20px",
            borderBottom: "1px solid #fee2e2",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "#fee2e2",
                color: "#dc2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#991b1b" }}>
                تصفير كافة المجموعات والسجلات (الاستعداد للاستخدام الفعلي)
              </h3>
              <span style={{ fontSize: "12px", color: "#b91c1c" }}>عملية إدارية خطيرة لا يمكن التراجع عنها</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#7f1d1d",
              padding: "4px",
            }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleReset} style={{ padding: "24px" }}>
          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: "10px",
              padding: "14px",
              marginBottom: "20px",
              fontSize: "13px",
              color: "#92400e",
              lineHeight: 1.6,
            }}
          >
            <strong>تنبيه هام:</strong> ستؤدي هذه العملية إلى مسح كافة بيانات الوارد، وسجلات التاريخ، والإشعارات، وقاعدة بيانات الأوليات الحالية بالكامل في النظام استعداداً لبدء العمل والتشغيل الفعلي.
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
              للتأكيد، اكتب كلمة <span style={{ color: "#dc2626", fontFamily: "monospace" }}>"تصفير"</span> في الحقل أدناه:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="اكتب كلمة تصفير هنا"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                fontSize: "14px",
                outline: "none",
                textAlign: "center",
                fontWeight: 700,
              }}
            />
          </div>

          <div style={{ marginBottom: "24px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
            <input
              type="checkbox"
              id="understoodCheck"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              style={{ marginTop: "3px", cursor: "pointer", width: "16px", height: "16px" }}
            />
            <label htmlFor="understoodCheck" style={{ fontSize: "13px", color: "#4b5563", cursor: "pointer", userSelect: "none" }}>
              أقر بأنني أدرك تماماً أن جميع البيانات الحالية سيتم حذفها نهائياً.
            </label>
          </div>

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                background: "#f9fafb",
                color: "#374151",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={confirmText.trim() !== "تصفير" || !understood || clearDbMutation.isPending}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                border: "none",
                background: confirmText.trim() === "تصفير" && understood ? "#dc2626" : "#fca5a5",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 700,
                cursor: confirmText.trim() === "تصفير" && understood ? "pointer" : "not-allowed",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                transition: "background 0.2s",
              }}
            >
              <Trash2 size={16} />
              <span>{clearDbMutation.isPending ? "جارِ التصفير الشامل..." : "تصفير كافة السجلات نهائياً"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

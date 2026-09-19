import { Check, Sparkles, Tag } from "lucide-react";
import { useMemo } from "react";
import {
  classifySubject,
  FileType,
  ImportanceType,
} from "@/utils/autoClassification";

interface AutoClassificationBannerProps {
  subject: string;
  currentFileType: string;
  currentImportance?: string;
  onApply: (suggestedType: FileType, suggestedImportance?: ImportanceType) => void;
  showKeywordsDetails?: boolean;
}

const importanceLabels: Record<string, string> = {
  normal: "عادي",
  important: "مهم",
  urgent: "عاجل",
};

const importanceColors: Record<string, string> = {
  normal: "priority-normal",
  important: "priority-important",
  urgent: "priority-urgent",
};

export function AutoClassificationBanner({
  subject,
  currentFileType,
  currentImportance,
  onApply,
  showKeywordsDetails = true,
}: AutoClassificationBannerProps) {
  const suggestion = useMemo(() => classifySubject(subject), [subject]);

  if (!suggestion) {
    return null;
  }

  const isTypeApplied = currentFileType === suggestion.fileType;
  const isImportanceApplied =
    !suggestion.suggestedImportance ||
    !currentImportance ||
    currentImportance === suggestion.suggestedImportance;
  const isFullyApplied = isTypeApplied && isImportanceApplied;

  return (
    <div
      className={`auto-classification-card ${isFullyApplied ? "applied" : "pending"}`}
      style={{ width: "100%", gridColumn: "1 / -1" }}
    >
      <div className="auto-classification-header">
        <div className="auto-classification-title">
          <Sparkles size={16} color="#1c5563" />
          <strong style={{ fontSize: "12px", color: "#163f48" }}>التصنيف التلقائي المقترح:</strong>
          <span className="auto-classification-badge">{suggestion.fileType}</span>

          {suggestion.suggestedImportance && (
            <span
              className={`importance-tag ${importanceColors[suggestion.suggestedImportance]}`}
              style={{ fontSize: "11px", padding: "1px 8px" }}
            >
              أهمية: {importanceLabels[suggestion.suggestedImportance]}
            </span>
          )}
        </div>

        <div>
          {isFullyApplied ? (
            <span className="auto-classification-applied-badge">
              <Check size={14} /> تم تطبيق التصنيف المقترح
            </span>
          ) : (
            <button
              type="button"
              className="auto-classification-btn"
              onClick={() => onApply(suggestion.fileType, suggestion.suggestedImportance)}
            >
              <Tag size={13} /> اعتماد وتطبيق التصنيف المقترح
            </button>
          )}
        </div>
      </div>

      {showKeywordsDetails && (
        <div className="auto-classification-details">
          <span>{suggestion.reason}</span>
          {suggestion.matchedTypeKeywords.length > 0 && (
            <div className="auto-classification-keywords">
              {suggestion.matchedTypeKeywords.map((kw) => (
                <span key={kw} className="keyword-chip">
                  #{kw}
                </span>
              ))}
            </div>
          )}
          {suggestion.matchedImportanceKeywords &&
            suggestion.matchedImportanceKeywords.length > 0 && (
              <div className="auto-classification-keywords">
                {suggestion.matchedImportanceKeywords.map((kw) => (
                  <span key={kw} className="keyword-chip urgent">
                    #{kw}
                  </span>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  );
}

interface PreSaveClassificationReviewProps {
  subject: string;
  selectedFileType: string;
  selectedImportance: string;
  onApplySuggested: (suggestedType: FileType, suggestedImportance?: ImportanceType) => void;
}

export function PreSaveClassificationReview({
  subject,
  selectedFileType,
  selectedImportance,
  onApplySuggested,
}: PreSaveClassificationReviewProps) {
  const suggestion = useMemo(() => classifySubject(subject), [subject]);

  const isTypeMatched = !suggestion || selectedFileType === suggestion.fileType;
  const isImportanceMatched =
    !suggestion ||
    !suggestion.suggestedImportance ||
    selectedImportance === suggestion.suggestedImportance;
  const isFullyMatched = isTypeMatched && isImportanceMatched;

  return (
    <div className={`pre-save-classification-summary ${!isFullyMatched ? "has-mismatch" : ""}`}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <Tag size={15} color="#1c5563" />
        <span style={{ color: "#163f48" }}>
          <b>التصنيف المعتمد قبل الحفظ:</b>{" "}
          <span className="auto-classification-badge" style={{ verticalAlign: "middle" }}>
            {selectedFileType || "غير محدد"}
          </span>
        </span>
        <span style={{ color: "#375f58", fontSize: "11px" }}>
          <b>الأهمية:</b>{" "}
          <span className={`importance-tag ${importanceColors[selectedImportance]}`}>
            {importanceLabels[selectedImportance] || selectedImportance}
          </span>
        </span>
      </div>

      {suggestion && !isFullyMatched ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ color: "#92400e", fontSize: "11.5px" }}>
            مقترح الكلمات المفتاحية: <b>{suggestion.fileType}</b>
            {suggestion.suggestedImportance && (
              <> (أهمية: {importanceLabels[suggestion.suggestedImportance]})</>
            )}
          </span>
          <button
            type="button"
            className="auto-classification-btn"
            style={{ padding: "3px 10px", fontSize: "11px" }}
            onClick={() => onApplySuggested(suggestion.fileType, suggestion.suggestedImportance)}
          >
            اعتماد المقترح قبل الحفظ
          </button>
        </div>
      ) : suggestion ? (
        <span
          style={{
            color: "#166534",
            fontSize: "11px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontWeight: 600,
          }}
        >
          <Check size={14} /> مطابق للتصنيف التلقائي المقترح
        </span>
      ) : (
        <span style={{ color: "#61817c", fontSize: "11px" }}>
          جاهز للحفظ والترحيل للنائب العام
        </span>
      )}
    </div>
  );
}

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  PenTool,
  Check,
  X,
  RotateCcw,
  Trash2,
  Upload,
  Bookmark,
  Move,
  Maximize2,
  Stamp,
  ShieldCheck,
  FileText,
  CheckCircle2,
  ChevronRight,
  Info,
  Sliders,
  AlertCircle
} from "lucide-react";
import { trpc } from "../lib/trpc";
import type { IncomingFile } from "../../../drizzle/schema";

interface ManualSignatureModalProps {
  file: IncomingFile;
  currentUser?: {
    name?: string | null;
    role?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedFile: IncomingFile) => void;
}

const INK_COLORS = [
  { name: "أزرق نيابة عامة", value: "#0f3d64", label: "أزرق ملكي قضائي" },
  { name: "أزرق حبري كلاسيكي", value: "#002060", label: "حبر كلاسيكي داكن" },
  { name: "أسود رسمي", value: "#111827", label: "أسود رسمي كلاسيكي" },
  { name: "أخضر قضائي", value: "#14532d", label: "أخضر رسمي معتمد" },
];

const STROKE_WIDTHS = [
  { label: "رقيق", value: 2 },
  { label: "متوسط (معتمد)", value: 3.5 },
  { label: "عريض", value: 5.5 },
];

const PRESET_POSITIONS = [
  { label: "أسفل اليسار (المعتاد)", x: 10, y: 72, width: 28, height: 11 },
  { label: "أسفل اليمين", x: 62, y: 72, width: 28, height: 11 },
  { label: "أسفل الوسط", x: 36, y: 72, width: 28, height: 11 },
  { label: "أعلى اليسار", x: 10, y: 16, width: 26, height: 10 },
];

export const ManualSignatureModal: React.FC<ManualSignatureModalProps> = ({
  file,
  currentUser,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewSheetRef = useRef<HTMLDivElement | null>(null);

  // Workflow tabs: "draw" (رسم التوقيع) vs "paste" (معاينة ولصق الموضع على الـ PDF)
  const [activeStep, setActiveStep] = useState<"draw" | "paste">("draw");

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokeHistory, setStrokeHistory] = useState<ImageData[]>([]);
  const [selectedColor, setSelectedColor] = useState<string>("#0f3d64");
  const [selectedStrokeWidth, setSelectedStrokeWidth] = useState<number>(3.5);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>("");
  const [hasSavedPreset, setHasSavedPreset] = useState(false);

  // Placement state on PDF (percentages of page width and height)
  const [position, setPosition] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 10,
    y: 72,
    width: 28,
    height: 11,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Signature credentials
  const defaultName = currentUser?.name || (currentUser?.role === "director" ? "فضيلة النائب العام" : "عضو النيابة العامة");
  const defaultTitle = currentUser?.role === "director" ? "النائب العام للجمهورية" : "رئيس نيابة";
  const [signerName, setSignerName] = useState(defaultName);
  const [signerTitle, setSignerTitle] = useState(defaultTitle);
  const [instruction, setInstruction] = useState(file.directorInstruction || "");
  const [includeOfficialBadge, setIncludeOfficialBadge] = useState(true);

  // Sync with currentUser when loaded
  useEffect(() => {
    if (currentUser) {
      const name = currentUser.name || (currentUser.role === "director" ? "فضيلة النائب العام" : "عضو النيابة العامة");
      const title = currentUser.role === "director" ? "النائب العام للجمهورية" : "رئيس نيابة";
      setSignerName((prev) => (prev && prev !== "عضو النيابة العامة" ? prev : name));
      setSignerTitle((prev) => (prev && prev !== "رئيس نيابة" ? prev : title));
    }
  }, [currentUser]);

  // Workflow integration
  const isPendingAg = file.status === "PENDING_AG";
  const [advanceToEmployee, setAdvanceToEmployee] = useState(isPendingAg);
  const [assignedDepartment, setAssignedDepartment] = useState(file.assignedDepartment || "");
  const [assignedEmployee, setAssignedEmployee] = useState(file.assignedEmployee || "");
  const [dueDate, setDueDate] = useState(file.dueDate ? new Date(file.dueDate).toISOString().slice(0, 10) : "");

  const applyMutation = trpc.files.applyManualSignature.useMutation();

  // Check saved preset on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("alawliyat_user_signature");
      if (saved) setHasSavedPreset(true);
    } catch {}
  }, []);

  // Initialize canvas with high DPI
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = selectedStrokeWidth;
    }
  }, [selectedColor, selectedStrokeWidth]);

  useEffect(() => {
    if (isOpen && activeStep === "draw") {
      const timer = setTimeout(initCanvas, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeStep, initCanvas]);

  const saveStroke = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setStrokeHistory((prev) => [...prev.slice(-15), imageData]);
  };

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    saveStroke();
    setIsDrawing(true);
    setHasDrawn(true);

    const { x, y } = getCanvasCoords(e);
    ctx.strokeStyle = selectedColor;
    ctx.lineWidth = selectedStrokeWidth;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    }
    setIsDrawing(false);
    updateSignatureDataUrl();
  };

  const updateSignatureDataUrl = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Export transparent PNG
    const dataUrl = canvas.toDataURL("image/png");
    setSignatureDataUrl(dataUrl);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokeHistory([]);
    setHasDrawn(false);
    setSignatureDataUrl("");
  };

  const undoLastStroke = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokeHistory.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const newHistory = [...strokeHistory];
    const previous = newHistory.pop();
    setStrokeHistory(newHistory);

    if (newHistory.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
      setSignatureDataUrl("");
    } else {
      const last = newHistory[newHistory.length - 1];
      ctx.putImageData(last, 0, 0);
      updateSignatureDataUrl();
    }
  };

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        saveStroke();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Scale to fit canvas nicely while maintaining aspect ratio
        const scale = Math.min((canvas.width * 0.8) / img.width, (canvas.height * 0.8) / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const drawX = (canvas.width - drawWidth) / 2;
        const drawY = (canvas.height - drawHeight) / 2;

        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
        setHasDrawn(true);
        updateSignatureDataUrl();
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const saveSignaturePreset = () => {
    if (!signatureDataUrl) return;
    try {
      localStorage.setItem("alawliyat_user_signature", signatureDataUrl);
      setHasSavedPreset(true);
    } catch {}
  };

  const loadSignaturePreset = () => {
    try {
      const saved = localStorage.getItem("alawliyat_user_signature");
      if (!saved) return;
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        saveStroke();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setHasDrawn(true);
        setSignatureDataUrl(saved);
      };
      img.src = saved;
    } catch {}
  };

  const proceedToPlacement = () => {
    updateSignatureDataUrl();
    if (!signatureDataUrl && !hasDrawn) return;
    setActiveStep("paste");
  };

  // Dragging placement on PDF sheet
  const handleSheetPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const sheet = previewSheetRef.current;
    if (!sheet) return;
    const rect = sheet.getBoundingClientRect();
    const clickXPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const clickYPercent = ((e.clientY - rect.top) / rect.height) * 100;

    // Check if clicked inside signature box
    const insideX = clickXPercent >= position.x && clickXPercent <= position.x + position.width;
    const insideY = clickYPercent >= position.y && clickYPercent <= position.y + position.height;

    if (insideX && insideY) {
      setIsDragging(true);
      setDragOffset({
        x: clickXPercent - position.x,
        y: clickYPercent - position.y,
      });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } else {
      // Jump signature center to clicked position
      const newX = Math.max(2, Math.min(98 - position.width, clickXPercent - position.width / 2));
      const newY = Math.max(2, Math.min(98 - position.height, clickYPercent - position.height / 2));
      setPosition((prev) => ({ ...prev, x: Math.round(newX), y: Math.round(newY) }));
    }
  };

  const handleSheetPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const sheet = previewSheetRef.current;
    if (!sheet) return;
    const rect = sheet.getBoundingClientRect();

    const currentXPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const currentYPercent = ((e.clientY - rect.top) / rect.height) * 100;

    const rawX = currentXPercent - dragOffset.x;
    const rawY = currentYPercent - dragOffset.y;

    const clampedX = Math.max(2, Math.min(98 - position.width, rawX));
    const clampedY = Math.max(2, Math.min(98 - position.height, rawY));

    setPosition((prev) => ({
      ...prev,
      x: Math.round(clampedX),
      y: Math.round(clampedY),
    }));
  };

  const handleSheetPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setIsDragging(false);
    }
  };

  const handleApplySignature = async () => {
    if (!signatureDataUrl) {
      alert("يرجى رسم التوقيع أولاً");
      return;
    }

    const effectiveSignerName = signerName.trim() || defaultName || "فضيلة النائب العام";
    const effectiveSignerTitle = signerTitle.trim() || defaultTitle || "النائب العام للجمهورية";

    try {
      const updated = await applyMutation.mutateAsync({
        fileId: file.id,
        signaturePngBase64: signatureDataUrl,
        signerName: effectiveSignerName,
        signerTitle: effectiveSignerTitle,
        instruction: instruction?.trim() || undefined,
        positionPercent: {
          x: position.x,
          y: position.y,
          width: position.width,
          height: position.height,
        },
        includeOfficialBadge,
        advanceToEmployee: isPendingAg && advanceToEmployee,
        assignedDepartment: assignedDepartment?.trim() || undefined,
        assignedEmployee: assignedEmployee?.trim() || undefined,
        dueDate: dueDate || undefined,
      });

      if (updated) {
        onSuccess(updated);
      } else {
        onSuccess({ ...file, isSigned: true });
      }
      onClose();
    } catch (err: any) {
      alert(err?.message || "تعذر لصق التوقيع على ملف الـ PDF");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 130 }}>
      <div
        className="manual-sign-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1060px, 96vw)",
          maxHeight: "94vh",
          display: "flex",
          flexDirection: "column",
          background: "#fffefa",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 25px 60px rgba(15, 45, 55, 0.4)",
          border: "1px solid #c8dbd4",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            background: "#f3f8f5",
            borderBottom: "1px solid #dce8e2",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "#1c5563",
                color: "#ffffff",
                display: "grid",
                placeItems: "center",
              }}
            >
              <PenTool size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", color: "#183e47", fontWeight: 700 }}>
                أداة التوقيع اليدوي ولصقها مباشرة على ملف PDF
              </h3>
              <span style={{ fontSize: "11px", color: "#607e7b" }}>
                معاملة رقم: <strong>{file.fileNumber}</strong> | {file.subject}
              </span>
            </div>
          </div>

          {/* Steps Indicator */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "#e4efe9",
              borderRadius: "8px",
              padding: "3px",
              gap: "4px",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveStep("draw")}
              style={{
                border: "none",
                background: activeStep === "draw" ? "#ffffff" : "transparent",
                color: activeStep === "draw" ? "#1a5146" : "#4e6a67",
                fontWeight: activeStep === "draw" ? 700 : 500,
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "12px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: activeStep === "draw" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <PenTool size={13} />
              <span>١. رسم التوقيع اليدوي</span>
            </button>
            <ChevronRight size={13} style={{ color: "#8da5a0" }} />
            <button
              type="button"
              disabled={!hasDrawn && !signatureDataUrl}
              onClick={() => {
                if (hasDrawn || signatureDataUrl) proceedToPlacement();
              }}
              style={{
                border: "none",
                background: activeStep === "paste" ? "#ffffff" : "transparent",
                color: activeStep === "paste" ? "#1a5146" : (!hasDrawn && !signatureDataUrl ? "#a0b5b0" : "#4e6a67"),
                fontWeight: activeStep === "paste" ? 700 : 500,
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "12px",
                cursor: (!hasDrawn && !signatureDataUrl) ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: activeStep === "paste" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <Move size={13} />
              <span>٢. ضبط الموضع ولصق على PDF</span>
            </button>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="إغلاق"
            style={{ width: "32px", height: "32px" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {activeStep === "draw" ? (
            /* STEP 1: Drawing & Capturing Signature */
            <div style={{ display: "grid", gridTemplateColumns: "1fr 310px", gap: "20px", alignItems: "start" }}>
              {/* Left Canvas Panel */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#22474f", display: "flex", alignItems: "center", gap: "6px" }}>
                    <PenTool size={14} style={{ color: "#1c5563" }} />
                    لوحة التوقيع بالقلم الرقمي (الفأرة أو اللمس أو القلم الضوئي)
                  </label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      className="outline-button small"
                      onClick={undoLastStroke}
                      disabled={strokeHistory.length === 0}
                      title="تراجع عن آخر حركة"
                      style={{ fontSize: "11px", padding: "4px 9px", gap: "4px" }}
                    >
                      <RotateCcw size={12} />
                      تراجع
                    </button>
                    <button
                      type="button"
                      className="outline-button small"
                      onClick={clearCanvas}
                      disabled={!hasDrawn}
                      title="مسح اللوحة بالكامل"
                      style={{ fontSize: "11px", padding: "4px 9px", gap: "4px", color: "#b91c1c", borderColor: "#fecaca" }}
                    >
                      <Trash2 size={12} />
                      مسح
                    </button>
                  </div>
                </div>

                {/* The Canvas Frame */}
                <div
                  style={{
                    position: "relative",
                    background: "#ffffff",
                    border: "2px dashed #9bc0b5",
                    borderRadius: "12px",
                    height: "290px",
                    cursor: "crosshair",
                    overflow: "hidden",
                    touchAction: "none",
                    boxShadow: "inset 0 2px 8px rgba(0,0,0,0.03)",
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    onPointerDown={startDrawing}
                    onPointerMove={draw}
                    onPointerUp={stopDrawing}
                    onPointerLeave={stopDrawing}
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "block",
                    }}
                  />
                  {!hasDrawn && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                        color: "#8ca29e",
                        gap: "8px",
                      }}
                    >
                      <PenTool size={28} style={{ opacity: 0.4 }} />
                      <span style={{ fontSize: "13px", fontWeight: 600 }}>وقّع هنا باستخدام القلم أو الفأرة</span>
                      <span style={{ fontSize: "10px", color: "#9cb1ad" }}>خط سلس فائق النعومة جاهز للصق على الوثيقة</span>
                    </div>
                  )}
                  {/* Subtle baseline */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: "50px",
                      left: "30px",
                      right: "30px",
                      height: "1px",
                      borderBottom: "1px dotted #c5ded5",
                      pointerEvents: "none",
                    }}
                  />
                </div>

                {/* Tools bar under canvas */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    marginTop: "12px",
                    padding: "10px 14px",
                    background: "#f5f8f7",
                    borderRadius: "10px",
                    border: "1px solid #e1ebe7",
                  }}
                >
                  {/* Color Chooser */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", color: "#54716e", fontWeight: 600 }}>لون الحبر:</span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {INK_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setSelectedColor(c.value)}
                          title={c.label}
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            background: c.value,
                            border: selectedColor === c.value ? "3px solid #6cb6a5" : "2px solid #ffffff",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                            cursor: "pointer",
                            transform: selectedColor === c.value ? "scale(1.15)" : "scale(1)",
                            transition: "transform 0.15s ease",
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Stroke Width Chooser */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", color: "#54716e", fontWeight: 600 }}>سُمك القلم:</span>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {STROKE_WIDTHS.map((sw) => (
                        <button
                          key={sw.value}
                          type="button"
                          onClick={() => setSelectedStrokeWidth(sw.value)}
                          style={{
                            border: selectedStrokeWidth === sw.value ? "1px solid #1c5563" : "1px solid #d0e0da",
                            background: selectedStrokeWidth === sw.value ? "#1c5563" : "#ffffff",
                            color: selectedStrokeWidth === sw.value ? "#ffffff" : "#486663",
                            fontSize: "10px",
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: "6px",
                            cursor: "pointer",
                          }}
                        >
                          {sw.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Upload or Preset buttons */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleUploadImage}
                      style={{ display: "none" }}
                    />
                    <button
                      type="button"
                      className="outline-button small"
                      onClick={() => fileInputRef.current?.click()}
                      title="رفع صورة توقيع مسبقة (PNG/JPG)"
                      style={{ fontSize: "11px", padding: "4px 9px", gap: "5px" }}
                    >
                      <Upload size={12} />
                      رفع صورة
                    </button>

                    {hasDrawn && (
                      <button
                        type="button"
                        className="outline-button small"
                        onClick={saveSignaturePreset}
                        title="حفظ التوقيع الحالي في المتصفح للاستخدام المستمر بنقرة واحدة"
                        style={{ fontSize: "11px", padding: "4px 9px", gap: "5px" }}
                      >
                        <Bookmark size={12} />
                        حفظ التوقيع
                      </button>
                    )}

                    {hasSavedPreset && (
                      <button
                        type="button"
                        className="outline-button small"
                        onClick={loadSignaturePreset}
                        title="استرجاع توقيعك المحفوظ"
                        style={{ fontSize: "11px", padding: "4px 9px", gap: "5px", color: "#1c5563" }}
                      >
                        <Bookmark size={12} />
                        توقيعي المحفوظ
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Settings & Signer Info Panel */}
              <div
                style={{
                  background: "#f7faf9",
                  borderRadius: "12px",
                  padding: "16px",
                  border: "1px solid #dbe7e2",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#1c5563", fontSize: "13px", fontWeight: 700 }}>
                  <ShieldCheck size={16} />
                  بيانات الاعتماد والتوقيع
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#486663", marginBottom: "4px" }}>
                    اسم الموقّع المعتمد:
                  </label>
                  <input
                    type="text"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="مثال: فضيلة النائب العام"
                    style={{
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cce0d8",
                      fontSize: "12px",
                      background: "#ffffff",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#486663", marginBottom: "4px" }}>
                    الصفة الرسمية:
                  </label>
                  <input
                    type="text"
                    value={signerTitle}
                    onChange={(e) => setSignerTitle(e.target.value)}
                    placeholder="النائب العام للجمهورية"
                    style={{
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cce0d8",
                      fontSize: "12px",
                      background: "#ffffff",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#486663", marginBottom: "4px" }}>
                    توجيه أو قرار مصاحب (اختياري):
                  </label>
                  <textarea
                    rows={3}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="اكتب توجيه النائب العام أو ملاحظات الاعتماد إن وجدت..."
                    style={{
                      width: "100%",
                      padding: "7px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cce0d8",
                      fontSize: "11px",
                      background: "#ffffff",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div style={{ marginTop: "4px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "11px", color: "#375551", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={includeOfficialBadge}
                      onChange={(e) => setIncludeOfficialBadge(e.target.checked)}
                      style={{ cursor: "pointer" }}
                    />
                    <strong>إدراج إطار وختم الاعتماد الرسمي تحت التوقيع</strong>
                  </label>
                  <span style={{ fontSize: "10px", color: "#7b9490", display: "block", marginTop: "2px", marginRight: "20px" }}>
                    يضيف شريط توثيق قضائي يثبت اسم المسؤول وتاريخ التوقيع الإلكتروني.
                  </span>
                </div>

                {isPendingAg && (
                  <div style={{ background: "#edf7f3", padding: "10px", borderRadius: "8px", border: "1px solid #cbe4db", marginTop: "4px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "11px", color: "#1b5a4d", fontWeight: 700, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={advanceToEmployee}
                        onChange={(e) => setAdvanceToEmployee(e.target.checked)}
                        style={{ cursor: "pointer" }}
                      />
                      ترحيل المعاملة للمرحلة الثانية (PENDING_EMPLOYEE)
                    </label>
                    <span style={{ fontSize: "10px", color: "#4f756d", display: "block", marginTop: "4px", marginRight: "20px" }}>
                      اعتماد توجيه النائب العام وإحالة المعاملة للموظف للتفريغ والترحيل النهائي.
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  className="primary-button"
                  disabled={!hasDrawn && !signatureDataUrl}
                  onClick={proceedToPlacement}
                  style={{
                    width: "100%",
                    marginTop: "8px",
                    background: "#1c5563",
                    padding: "10px",
                    fontWeight: 700,
                    fontSize: "12px",
                    gap: "8px",
                  }}
                >
                  <Move size={15} />
                  الانتقال لمعاينة الموضع واللصق على PDF
                </button>
              </div>
            </div>
          ) : (
            /* STEP 2: Precise Placement & Stamping on PDF Document */
            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "20px", alignItems: "start" }}>
              {/* Visual PDF Page Frame with Drag-to-Position */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#22474f", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Move size={14} style={{ color: "#1c5563" }} />
                    اسحب مربع التوقيع وحدد موضعه بدقة على الصفحة
                  </label>
                  <span style={{ fontSize: "11px", color: "#6d8683", background: "#e8f2ee", padding: "3px 8px", borderRadius: "6px" }}>
                    الموضع: أفقي <strong>{position.x}%</strong> | رأسي <strong>{position.y}%</strong>
                  </span>
                </div>

                {/* Simulated A4 Document Page */}
                <div
                  ref={previewSheetRef}
                  onPointerDown={handleSheetPointerDown}
                  onPointerMove={handleSheetPointerMove}
                  onPointerUp={handleSheetPointerUp}
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "1 / 1.38",
                    maxHeight: "520px",
                    background: "#ffffff",
                    borderRadius: "8px",
                    boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
                    border: "1px solid #d4e2dc",
                    overflow: "hidden",
                    userSelect: "none",
                    cursor: isDragging ? "grabbing" : "crosshair",
                  }}
                >
                  {/* Document Content Skeleton (Watermark & Text hints) */}
                  <div style={{ padding: "24px 30px", opacity: 0.75, pointerEvents: "none", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    {/* Header */}
                    <div>
                      <div style={{ textAlign: "center", borderBottom: "2px double #1f5044", paddingBottom: "10px" }}>
                        <h4 style={{ margin: 0, fontSize: "13px", color: "#1f5044", fontWeight: 800 }}>الجمهورية اليمنية - النيابة العامة</h4>
                        <span style={{ fontSize: "10px", color: "#4f6863" }}>مكتب النائب العام للجمهورية | إدارة الأولويات والمتابعة</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", fontSize: "9px", color: "#607672" }}>
                        <span>رقم الوارد: <strong>{file.fileNumber}</strong></span>
                        <span>السنة: <strong>{file.year}</strong></span>
                        <span>تاريخ الورود: <strong>{file.arrivalDate ? (typeof file.arrivalDate === "string" ? file.arrivalDate : new Date(file.arrivalDate).toLocaleDateString("ar-EG")) : "2026/09"}</strong></span>
                      </div>
                    </div>

                    {/* Body Skeleton Lines */}
                    <div style={{ margin: "20px 0", display: "grid", gap: "10px" }}>
                      <div style={{ height: "12px", background: "#f0f5f3", borderRadius: "4px", width: "85%" }} />
                      <div style={{ height: "12px", background: "#f0f5f3", borderRadius: "4px", width: "95%" }} />
                      <div style={{ height: "12px", background: "#f0f5f3", borderRadius: "4px", width: "70%" }} />
                      <div style={{ height: "12px", background: "#f0f5f3", borderRadius: "4px", width: "90%" }} />
                      <div style={{ height: "12px", background: "#f0f5f3", borderRadius: "4px", width: "60%" }} />
                      {instruction && (
                        <div style={{ marginTop: "12px", padding: "10px", background: "#faf7ea", border: "1px solid #ebdcb5", borderRadius: "6px", fontSize: "10px", color: "#7a622a" }}>
                          <strong>توجيه النائب العام:</strong> {instruction}
                        </div>
                      )}
                    </div>

                    {/* Bottom verification footer */}
                    <div style={{ height: "26px", borderTop: "1px solid #dbe7e2", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "8px", color: "#8aa39e" }}>
                      <span>E-SIGNED | PUBLIC PROSECUTION</span>
                      <span>وثيقة وارد رسمية معتمدة</span>
                    </div>
                  </div>

                  {/* Overlaid Draggable Signature Stamp Box */}
                  <div
                    style={{
                      position: "absolute",
                      left: `${position.x}%`,
                      top: `${position.y}%`,
                      width: `${position.width}%`,
                      height: `${position.height}%`,
                      cursor: isDragging ? "grabbing" : "grab",
                      border: "2px solid #165b4c",
                      borderRadius: "6px",
                      background: includeOfficialBadge ? "rgba(242, 249, 246, 0.95)" : "rgba(255, 255, 255, 0.8)",
                      boxShadow: "0 4px 14px rgba(22, 91, 76, 0.25)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      padding: "4px 6px",
                      boxSizing: "border-box",
                      transition: isDragging ? "none" : "all 0.1s ease",
                      zIndex: 10,
                    }}
                  >
                    {/* Badge top tag */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "7px", fontWeight: 800, color: "#165b4c", whiteSpace: "nowrap" }}>
                        {signerName || "فضيلة النائب العام"}
                      </span>
                      <Move size={10} style={{ color: "#165b4c", opacity: 0.7 }} />
                    </div>

                    {/* The Signature Image preview */}
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      <img
                        src={signatureDataUrl}
                        alt="توقيع يدوي"
                        style={{
                          maxWidth: "100%",
                          maxHeight: "100%",
                          objectFit: "contain",
                          pointerEvents: "none",
                        }}
                      />
                    </div>

                    {/* Badge bottom date */}
                    {includeOfficialBadge && (
                      <div style={{ fontSize: "6.5px", color: "#376c61", borderTop: "1px dashed #a4c9be", paddingTop: "2px", whiteSpace: "nowrap" }}>
                        {signerTitle} | معتمد {new Date().toISOString().slice(0, 10)}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Placement Controls Sidebar */}
              <div
                style={{
                  background: "#f7faf9",
                  borderRadius: "12px",
                  padding: "16px",
                  border: "1px solid #dbe7e2",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#1c5563", fontSize: "13px", fontWeight: 700 }}>
                  <Sliders size={16} />
                  خيارات التموضع والحجم
                </div>

                {/* Preset Positions */}
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#486663", marginBottom: "6px" }}>
                    مواقع جاهزة بنقرة واحدة:
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    {PRESET_POSITIONS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setPosition({ ...p })}
                        style={{
                          border: "1px solid #cfded8",
                          background: "#ffffff",
                          color: "#2a4d47",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          fontSize: "10px",
                          fontWeight: 600,
                          cursor: "pointer",
                          textAlign: "center",
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Width / Size Slider */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: "#486663" }}>
                      حجم وعرض التوقيع:
                    </label>
                    <span style={{ fontSize: "10px", color: "#1c5563", fontWeight: 700 }}>
                      {position.width}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={16}
                    max={48}
                    step={2}
                    value={position.width}
                    onChange={(e) => {
                      const newW = parseInt(e.target.value, 10);
                      const newH = Math.round(newW * 0.4);
                      setPosition((prev) => ({
                        ...prev,
                        width: newW,
                        height: newH,
                        x: Math.min(prev.x, 100 - newW),
                        y: Math.min(prev.y, 100 - newH),
                      }));
                    }}
                    style={{ width: "100%", accentColor: "#1c5563" }}
                  />
                </div>

                {/* Summary Info Card */}
                <div style={{ background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #dce8e3", fontSize: "11px" }}>
                  <div style={{ color: "#1f4a43", fontWeight: 700, marginBottom: "6px", display: "flex", alignItems: "center", gap: "5px" }}>
                    <CheckCircle2 size={13} style={{ color: "#166534" }} />
                    ملخص اعتماد التوقيع:
                  </div>
                  <div style={{ display: "grid", gap: "4px", color: "#546e6b" }}>
                    <div>الموقّع: <strong>{signerName}</strong></div>
                    <div>الصفة: <strong>{signerTitle}</strong></div>
                    <div>الصفحة المستهدفة: <strong>الصفحة الأخيرة (المعتمدة)</strong></div>
                    {advanceToEmployee && <div style={{ color: "#166534" }}>الترحيل: <strong>إلى المرحلة الثانية تلقائياً</strong></div>}
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "auto" }}>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={applyMutation.isPending}
                    onClick={handleApplySignature}
                    style={{
                      width: "100%",
                      background: "#124f42",
                      padding: "11px",
                      fontWeight: 700,
                      fontSize: "13px",
                      gap: "8px",
                      boxShadow: "0 4px 14px rgba(18, 79, 66, 0.3)",
                    }}
                  >
                    {applyMutation.isPending ? (
                      <>
                        <div className="spin" style={{ width: "14px", height: "14px", border: "2px solid #ffffff", borderTopColor: "transparent", borderRadius: "50%" }} />
                        جاري لصق التوقيع وحفظ النسخة الموقعة...
                      </>
                    ) : (
                      <>
                        <Stamp size={16} />
                        تأكيد ولصق التوقيع على ملف PDF
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    className="outline-button"
                    onClick={() => setActiveStep("draw")}
                    style={{ width: "100%", fontSize: "11px" }}
                  >
                    الرجوع لإعادة رسم أو تعديل التوقيع
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

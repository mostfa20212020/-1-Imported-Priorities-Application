import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  StickyNote,
  Square,
  Circle,
  ArrowUpLeft,
  Minus,
  PenTool,
  Highlighter,
  Trash2,
  RotateCcw,
  Check,
  CheckCircle2,
  X,
  Eye,
  EyeOff,
  MessageSquare,
  Move,
  Lock,
  ChevronDown,
  ChevronUp,
  MapPin,
  Clock,
  User,
  ShieldCheck,
  Palette,
  Sliders,
  Filter,
} from "lucide-react";
import { trpc } from "../lib/trpc";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs, doc, setDoc } from "firebase/firestore";

export type AnnotationTool = "browse" | "sticky_note" | "rectangle" | "circle" | "arrow" | "line" | "freehand";

export interface StickyNoteData {
  id: string;
  type: "sticky_note";
  x: number; // Percentage 0 - 100
  y: number; // Percentage 0 - 100
  title: string;
  content: string;
  color: string;
  authorName: string;
  authorRole: string;
  isResolved: boolean;
  createdAt: string;
  isCollapsed?: boolean;
}

export interface ShapeData {
  id: string;
  type: "shape";
  shapeType: "rectangle" | "circle" | "arrow" | "line" | "freehand";
  x: number; // Percentage 0 - 100
  y: number; // Percentage 0 - 100
  width: number; // Percentage
  height: number; // Percentage
  endX?: number; // For line/arrow
  endY?: number;
  points?: Array<{ x: number; y: number }>; // For freehand
  color: string;
  strokeWidth: number;
  opacity: number;
  authorName: string;
  createdAt: string;
}

export type DocumentAnnotation = StickyNoteData | ShapeData;

interface PdfAnnotationLayerProps {
  fileId: number;
  fileNumber: string;
  docType?: "original" | "signed";
  currentUser?: {
    name?: string | null;
    role?: string;
  } | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom?: number;
}

const COLOR_PALETTE = [
  { name: "أحمر عاجل", hex: "#dc2626", bg: "#fef2f2", border: "#f87171" },
  { name: "أصفر تمييز", hex: "#ca8a04", bg: "#fef9c3", border: "#fde047" },
  { name: "أزرق نيابة", hex: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd" },
  { name: "أخضر معتمد", hex: "#15803d", bg: "#f0fdf4", border: "#86efac" },
  { name: "أرجواني توجيه", hex: "#7e22ce", bg: "#faf5ff", border: "#d8b4fe" },
  { name: "أسود رسمي", hex: "#1e293b", bg: "#f8fafc", border: "#94a3b8" },
];

const STICKY_COLORS = [
  { name: "أصفر كلاسيكي", bg: "#fef9c3", border: "#fde047", headerBg: "#fef08a", text: "#713f12" },
  { name: "وردي تنبيه", bg: "#fce7f3", border: "#f472b6", headerBg: "#fbcfe8", text: "#831843" },
  { name: "أزرق قضائي", bg: "#e0f2fe", border: "#38bdf8", headerBg: "#bae6fd", text: "#0c4a6e" },
  { name: "أخضر متابعة", bg: "#dcfce7", border: "#4ade80", headerBg: "#bbf7d0", text: "#14532d" },
  { name: "برتقالي هام", bg: "#ffedd5", border: "#fb923c", headerBg: "#fed7aa", text: "#7c2d12" },
];

export const PdfAnnotationLayer: React.FC<PdfAnnotationLayerProps> = ({
  fileId,
  fileNumber,
  docType = "original",
  currentUser,
  containerRef,
  zoom = 100,
}) => {
  const [activeTool, setActiveTool] = useState<AnnotationTool>("browse");
  const [selectedColor, setSelectedColor] = useState<string>("#dc2626");
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [isHighlighter, setIsHighlighter] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const [showNotesDrawer, setShowNotesDrawer] = useState<boolean>(false);
  const [notesFilter, setNotesFilter] = useState<"all" | "active" | "resolved">("all");
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  // Annotations state
  const [annotations, setAnnotations] = useState<DocumentAnnotation[]>([]);
  const [history, setHistory] = useState<DocumentAnnotation[][]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("idle");

  // Drawing in progress
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDraw, setCurrentDraw] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    points?: Array<{ x: number; y: number }>;
  } | null>(null);

  // Dragging sticky note
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const isAuthorized = Boolean(currentUser);
  const userDisplayName = currentUser?.name || (currentUser?.role === "director" ? "فضيلة النائب العام" : "عضو النيابة");
  const userRoleTitle =
    currentUser?.role === "director"
      ? "النائب العام للجمهورية"
      : currentUser?.role === "admin"
      ? "مدير النظام"
      : currentUser?.role === "input"
      ? "موظف الاستقبال والتسجيل"
      : "عضو النيابة العامة";

  // tRPC query and mutation
  const getAnnotationsQuery = trpc.files.getAnnotations.useQuery(
    { fileId, docType },
    { enabled: Boolean(fileId), refetchOnWindowFocus: false }
  );
  const saveAnnotationsMutation = trpc.files.saveAnnotations.useMutation();

  // Load annotations from server and Firestore
  useEffect(() => {
    if (getAnnotationsQuery.data && Array.isArray(getAnnotationsQuery.data)) {
      setAnnotations(getAnnotationsQuery.data as DocumentAnnotation[]);
    }
  }, [getAnnotationsQuery.data]);

  // Firestore sync backup listener
  useEffect(() => {
    let isMounted = true;
    async function loadFromFirestore() {
      try {
        const colRef = collection(db, "document_annotations");
        const q = query(colRef, where("fileId", "==", fileId));
        const snapshot = await getDocs(q);
        if (isMounted && !snapshot.empty) {
          const loaded: DocumentAnnotation[] = [];
          snapshot.forEach((d) => {
            loaded.push(d.data() as DocumentAnnotation);
          });
          if (loaded.length > 0 && (!getAnnotationsQuery.data || (getAnnotationsQuery.data as any[]).length === 0)) {
            setAnnotations(loaded);
          }
        }
      } catch {
        // Silently fallback to tRPC
      }
    }
    loadFromFirestore();
    return () => {
      isMounted = false;
    };
  }, [fileId]);

  // Save annotations helper
  const persistAnnotations = useCallback(
    async (updated: DocumentAnnotation[]) => {
      setSaveStatus("saving");
      setIsSyncing(true);
      try {
        await saveAnnotationsMutation.mutateAsync({
          fileId,
          docType,
          annotations: updated,
        });

        // Also sync to Firestore for real-time compliance
        try {
          const colRef = collection(db, "document_annotations");
          for (const item of updated) {
            await setDoc(doc(colRef, `${fileId}_${item.id}`), {
              ...item,
              fileId,
              docType,
              syncedAt: new Date().toISOString(),
            });
          }
        } catch {}

        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2500);
      } catch (err) {
        console.warn("Failed to persist annotations:", err);
        setSaveStatus("idle");
      } finally {
        setIsSyncing(false);
      }
    },
    [fileId, docType, saveAnnotationsMutation]
  );

  const updateAnnotations = useCallback(
    (newAnnotations: DocumentAnnotation[], pushToHistory = true) => {
      if (pushToHistory) {
        setHistory((prev) => [...prev.slice(-15), annotations]);
      }
      setAnnotations(newAnnotations);
      persistAnnotations(newAnnotations);
    },
    [annotations, persistAnnotations]
  );

  const undoLast = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setAnnotations(previous);
    persistAnnotations(previous);
  };

  const clearAllAnnotations = () => {
    if (annotations.length === 0) return;
    if (window.confirm("هل أنت متأكد من مسح جميع التأشيرات والملاحظات على هذا المستند؟")) {
      updateAnnotations([]);
    }
  };

  // Convert client pointer event to percentage coordinates
  const getCoordsPercentage = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));

    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  };

  // Handle pointer down on overlay
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // If browse mode or clicking inside an interactive card, do nothing
    if (activeTool === "browse") return;
    if (!isAuthorized) {
      alert("يجب تسجيل الدخول بصلاحية معتمدة لإضافة التأشيرات أو الملاحظات على المستند.");
      return;
    }

    const { x, y } = getCoordsPercentage(e);

    // Sticky Note creation on click
    if (activeTool === "sticky_note") {
      const newNote: StickyNoteData = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: "sticky_note",
        x: Math.min(75, Math.max(5, x)),
        y: Math.min(80, Math.max(5, y)),
        title: "ملاحظة قضائية",
        content: "",
        color: "#fef9c3",
        authorName: userDisplayName,
        authorRole: userRoleTitle,
        isResolved: false,
        createdAt: new Date().toISOString(),
        isCollapsed: false,
      };

      updateAnnotations([...annotations, newNote]);
      setSelectedAnnotationId(newNote.id);
      setActiveTool("browse");
      return;
    }

    // Shape drawing
    setIsDrawing(true);
    setDrawStart({ x, y });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    if (activeTool === "freehand") {
      setCurrentDraw({
        x,
        y,
        width: 0,
        height: 0,
        points: [{ x, y }],
      });
    } else {
      setCurrentDraw({
        x,
        y,
        width: 0,
        height: 0,
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart) return;
    const { x, y } = getCoordsPercentage(e);

    if (activeTool === "freehand") {
      setCurrentDraw((prev) => ({
        x: Math.min(drawStart.x, x),
        y: Math.min(drawStart.y, y),
        width: Math.abs(x - drawStart.x),
        height: Math.abs(y - drawStart.y),
        points: [...(prev?.points || []), { x, y }],
      }));
    } else {
      const minX = Math.min(drawStart.x, x);
      const minY = Math.min(drawStart.y, y);
      const w = Math.abs(x - drawStart.x);
      const h = Math.abs(y - drawStart.y);

      setCurrentDraw({
        x: minX,
        y: minY,
        width: w,
        height: h,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart || !currentDraw) {
      setIsDrawing(false);
      setDrawStart(null);
      setCurrentDraw(null);
      return;
    }

    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}

    const { x, y } = getCoordsPercentage(e);
    const minX = Math.min(drawStart.x, x);
    const minY = Math.min(drawStart.y, y);
    const w = Math.abs(x - drawStart.x);
    const h = Math.abs(y - drawStart.y);

    // Minimum size check to prevent accidental zero-size clicks
    if (activeTool !== "freehand" && w < 1.5 && h < 1.5) {
      setIsDrawing(false);
      setDrawStart(null);
      setCurrentDraw(null);
      return;
    }

    const newShape: ShapeData = {
      id: `shape_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: "shape",
      shapeType: activeTool as any,
      x: minX,
      y: minY,
      width: w,
      height: h,
      endX: x,
      endY: y,
      points: currentDraw.points,
      color: selectedColor,
      strokeWidth: strokeWidth,
      opacity: isHighlighter ? 0.35 : 0.9,
      authorName: userDisplayName,
      createdAt: new Date().toISOString(),
    };

    updateAnnotations([...annotations, newShape]);
    setIsDrawing(false);
    setDrawStart(null);
    setCurrentDraw(null);
  };

  // Sticky Note Actions
  const updateStickyNote = (id: string, updates: Partial<StickyNoteData>) => {
    const updated = annotations.map((ann) => (ann.id === id && ann.type === "sticky_note" ? { ...ann, ...updates } : ann));
    updateAnnotations(updated);
  };

  const deleteAnnotation = (id: string) => {
    const updated = annotations.filter((ann) => ann.id !== id);
    updateAnnotations(updated);
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
  };

  // Dragging a sticky note
  const startDragNote = (e: React.PointerEvent, note: StickyNoteData) => {
    e.stopPropagation();
    setDraggingNoteId(note.id);
    const { x, y } = getCoordsPercentage(e as any);
    setDragOffset({ x: x - note.x, y: y - note.y });
  };

  const onDragNote = (e: React.PointerEvent) => {
    if (!draggingNoteId) return;
    const { x, y } = getCoordsPercentage(e as any);
    const newX = Math.max(2, Math.min(85, x - dragOffset.x));
    const newY = Math.max(2, Math.min(88, y - dragOffset.y));

    setAnnotations((prev) =>
      prev.map((ann) => (ann.id === draggingNoteId && ann.type === "sticky_note" ? { ...ann, x: newX, y: newY } : ann))
    );
  };

  const stopDragNote = () => {
    if (draggingNoteId) {
      persistAnnotations(annotations);
      setDraggingNoteId(null);
    }
  };

  const stickyNotesList = useMemo(() => {
    return annotations.filter((ann): ann is StickyNoteData => ann.type === "sticky_note");
  }, [annotations]);

  const shapesList = useMemo(() => {
    return annotations.filter((ann): ann is ShapeData => ann.type === "shape");
  }, [annotations]);

  const filteredNotes = useMemo(() => {
    if (notesFilter === "active") return stickyNotesList.filter((n) => !n.isResolved);
    if (notesFilter === "resolved") return stickyNotesList.filter((n) => n.isResolved);
    return stickyNotesList;
  }, [stickyNotesList, notesFilter]);

  const activeNotesCount = stickyNotesList.filter((n) => !n.isResolved).length;

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. TOP FLOATING ANNOTATION TOOLBAR */}
      {/* ========================================================================= */}
      <div
        className="annotation-toolbar"
        style={{
          position: "absolute",
          top: "12px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 40,
          background: "rgba(255, 255, 255, 0.96)",
          backdropFilter: "blur(8px)",
          border: "1px solid #cce0d8",
          borderRadius: "12px",
          boxShadow: "0 10px 30px rgba(18, 52, 60, 0.18)",
          padding: "6px 10px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          maxWidth: "96%",
          flexWrap: "wrap",
        }}
      >
        {/* Tool Selector Group */}
        <div style={{ display: "inline-flex", background: "#f0f6f4", borderRadius: "8px", padding: "3px", gap: "2px" }}>
          <button
            type="button"
            onClick={() => setActiveTool("browse")}
            title="وضع التصفح وقراءة المستند (بدون رسم)"
            style={{
              border: "none",
              background: activeTool === "browse" ? "#ffffff" : "transparent",
              color: activeTool === "browse" ? "#185348" : "#557470",
              fontWeight: activeTool === "browse" ? 700 : 500,
              padding: "5px 10px",
              borderRadius: "6px",
              fontSize: "11px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              boxShadow: activeTool === "browse" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <Move size={13} />
            <span>تصفح</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool("sticky_note")}
            title="إضافة ملاحظة لاصقة على موضع محدد في المستند"
            style={{
              border: "none",
              background: activeTool === "sticky_note" ? "#ffffff" : "transparent",
              color: activeTool === "sticky_note" ? "#b45309" : "#557470",
              fontWeight: activeTool === "sticky_note" ? 700 : 500,
              padding: "5px 10px",
              borderRadius: "6px",
              fontSize: "11px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              boxShadow: activeTool === "sticky_note" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <StickyNote size={13} style={{ color: "#d97706" }} />
            <span>ملاحظة لاصقة</span>
            {stickyNotesList.length > 0 && (
              <span
                style={{
                  background: "#fbbf24",
                  color: "#78350f",
                  borderRadius: "10px",
                  fontSize: "9px",
                  padding: "1px 5px",
                  fontWeight: 800,
                }}
              >
                {stickyNotesList.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTool("rectangle")}
            title="رسم مستطيل لتأطير أو تمييز فقرة أو رقم"
            style={{
              border: "none",
              background: activeTool === "rectangle" ? "#ffffff" : "transparent",
              color: activeTool === "rectangle" ? "#185348" : "#557470",
              fontWeight: activeTool === "rectangle" ? 700 : 500,
              padding: "5px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              boxShadow: activeTool === "rectangle" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <Square size={13} />
            <span>مستطيل</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool("circle")}
            title="رسم دائرة أو تمييز بيضاوي"
            style={{
              border: "none",
              background: activeTool === "circle" ? "#ffffff" : "transparent",
              color: activeTool === "circle" ? "#185348" : "#557470",
              fontWeight: activeTool === "circle" ? 700 : 500,
              padding: "5px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              boxShadow: activeTool === "circle" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <Circle size={13} />
            <span>دائرة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool("arrow")}
            title="رسم سهم توجيه يشير لمكان محدد"
            style={{
              border: "none",
              background: activeTool === "arrow" ? "#ffffff" : "transparent",
              color: activeTool === "arrow" ? "#185348" : "#557470",
              fontWeight: activeTool === "arrow" ? 700 : 500,
              padding: "5px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              boxShadow: activeTool === "arrow" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <ArrowUpLeft size={13} />
            <span>سهم</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool("line")}
            title="رسم خط مستقيم تحت الكلمات"
            style={{
              border: "none",
              background: activeTool === "line" ? "#ffffff" : "transparent",
              color: activeTool === "line" ? "#185348" : "#557470",
              fontWeight: activeTool === "line" ? 700 : 500,
              padding: "5px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              boxShadow: activeTool === "line" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <Minus size={13} />
            <span>خط</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool("freehand")}
            title="قلم حر للتأشير والكتابة"
            style={{
              border: "none",
              background: activeTool === "freehand" ? "#ffffff" : "transparent",
              color: activeTool === "freehand" ? "#185348" : "#557470",
              fontWeight: activeTool === "freehand" ? 700 : 500,
              padding: "5px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              boxShadow: activeTool === "freehand" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <PenTool size={13} />
            <span>قلم حر</span>
          </button>
        </div>

        {/* Separator */}
        <div style={{ width: "1px", height: "20px", background: "#d4e2dc" }} />

        {/* Color Palette (When shapes/pen selected) */}
        {activeTool !== "browse" && activeTool !== "sticky_note" && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {COLOR_PALETTE.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setSelectedColor(c.hex)}
                title={c.name}
                style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: c.hex,
                  border: selectedColor === c.hex ? "2px solid #ffffff" : "1px solid rgba(0,0,0,0.15)",
                  boxShadow: selectedColor === c.hex ? "0 0 0 2px #185348" : "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}

            {/* Thickness selector */}
            <div style={{ display: "inline-flex", gap: "2px", marginRight: "6px" }}>
              {[2, 4, 6].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setStrokeWidth(w)}
                  title={`سُمك ${w}px`}
                  style={{
                    border: "1px solid #d0e0d9",
                    background: strokeWidth === w ? "#e2ece7" : "#ffffff",
                    borderRadius: "4px",
                    width: "22px",
                    height: "22px",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <span
                    style={{
                      width: `${w * 2}px`,
                      height: `${w}px`,
                      background: selectedColor,
                      borderRadius: "2px",
                    }}
                  />
                </button>
              ))}
            </div>

            {/* Highlighter mode toggle */}
            <button
              type="button"
              onClick={() => setIsHighlighter(!isHighlighter)}
              title="تفعيل/تعطيل التظليل الشفاف"
              style={{
                border: "1px solid #d0e0d9",
                background: isHighlighter ? "#fef08a" : "#ffffff",
                color: isHighlighter ? "#854d0e" : "#557470",
                borderRadius: "5px",
                padding: "3px 6px",
                fontSize: "10px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
              }}
            >
              <Highlighter size={12} />
              <span>تظليل</span>
            </button>
          </div>
        )}

        {/* Sticky Note Help Hint */}
        {activeTool === "sticky_note" && (
          <span style={{ fontSize: "11px", color: "#b45309", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
            <MapPin size={13} />
            انقر على أي موضع في الوثيقة لإسقاط ملاحظة لاصقة
          </span>
        )}

        {/* Separator */}
        <div style={{ width: "1px", height: "20px", background: "#d4e2dc" }} />

        {/* Action Controls: Undo, Clear, Visibility, Notes Drawer */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button
            type="button"
            onClick={undoLast}
            disabled={history.length === 0}
            title="تراجع عن آخر إجراء"
            style={{
              border: "none",
              background: "transparent",
              color: history.length === 0 ? "#b4c7c2" : "#3b5c56",
              cursor: history.length === 0 ? "not-allowed" : "pointer",
              padding: "4px",
              borderRadius: "4px",
              display: "grid",
              placeItems: "center",
            }}
          >
            <RotateCcw size={14} />
          </button>

          <button
            type="button"
            onClick={() => setIsVisible(!isVisible)}
            title={isVisible ? "إخفاء التأشيرات مؤقتاً" : "إظهار التأشيرات"}
            style={{
              border: "none",
              background: isVisible ? "transparent" : "#fee2e2",
              color: isVisible ? "#3b5c56" : "#dc2626",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "4px",
              display: "grid",
              placeItems: "center",
            }}
          >
            {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>

          {annotations.length > 0 && (
            <button
              type="button"
              onClick={clearAllAnnotations}
              title="مسح جميع التأشيرات"
              style={{
                border: "none",
                background: "transparent",
                color: "#dc2626",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "4px",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Trash2 size={14} />
            </button>
          )}

          {/* Sticky Notes Sidebar Toggle */}
          <button
            type="button"
            onClick={() => setShowNotesDrawer(!showNotesDrawer)}
            title="عرض سجل الملاحظات الجانبي"
            style={{
              border: "1px solid #c9ddd5",
              background: showNotesDrawer ? "#1c5563" : "#f4f8f6",
              color: showNotesDrawer ? "#ffffff" : "#1c5563",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <MessageSquare size={13} />
            <span>الملاحظات</span>
            {stickyNotesList.length > 0 && (
              <span
                style={{
                  background: showNotesDrawer ? "#ffffff" : "#1c5563",
                  color: showNotesDrawer ? "#1c5563" : "#ffffff",
                  borderRadius: "10px",
                  fontSize: "9px",
                  padding: "1px 5px",
                  fontWeight: 800,
                }}
              >
                {stickyNotesList.length}
              </span>
            )}
          </button>
        </div>

        {/* Auto-save status indicator */}
        <div style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: "4px", fontSize: "10px" }}>
          {saveStatus === "saving" && (
            <span style={{ color: "#d97706", display: "flex", alignItems: "center", gap: "3px" }}>
              <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "#f59e0b" }} />
              جاري الحفظ...
            </span>
          )}
          {saveStatus === "saved" && (
            <span style={{ color: "#16a34a", display: "flex", alignItems: "center", gap: "3px" }}>
              <Check size={11} />
              تم الحفظ
            </span>
          )}
          {!isAuthorized && (
            <span style={{ color: "#9ca3af", display: "flex", alignItems: "center", gap: "3px" }} title="وضع القراءة والمعاينة">
              <Lock size={11} />
              معاينة فقط
            </span>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. INTERACTIVE OVERLAY CANVAS ON TOP OF THE DOCUMENT */}
      {/* ========================================================================= */}
      {isVisible && (
        <div
          className="pdf-annotation-interactive-overlay"
          onPointerDown={handlePointerDown}
          onPointerMove={(e) => {
            handlePointerMove(e);
            onDragNote(e);
          }}
          onPointerUp={(e) => {
            handlePointerUp(e);
            stopDragNote();
          }}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: activeTool === "browse" ? 20 : 30,
            pointerEvents: activeTool === "browse" ? "none" : "auto",
            cursor:
              activeTool === "browse"
                ? "default"
                : activeTool === "sticky_note"
                ? "copy"
                : "crosshair",
            userSelect: "none",
            overflow: "hidden",
          }}
        >
          {/* Vector SVG Layer for Shapes */}
          <svg
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            <defs>
              {/* Arrow markers for each color */}
              {COLOR_PALETTE.map((c) => (
                <marker
                  key={c.hex}
                  id={`arrowhead-${c.hex.replace("#", "")}`}
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="4"
                  orient="auto"
                >
                  <polygon points="0 0, 8 4, 0 8" fill={c.hex} />
                </marker>
              ))}
            </defs>

            {/* Committed Shapes */}
            {shapesList.map((shape) => {
              if (shape.shapeType === "rectangle") {
                return (
                  <rect
                    key={shape.id}
                    x={`${shape.x}%`}
                    y={`${shape.y}%`}
                    width={`${shape.width}%`}
                    height={`${shape.height}%`}
                    fill={shape.opacity < 0.5 ? shape.color : "transparent"}
                    fillOpacity={shape.opacity < 0.5 ? shape.opacity : 0}
                    stroke={shape.color}
                    strokeWidth={shape.strokeWidth}
                    rx="4"
                    opacity={shape.opacity}
                  />
                );
              }
              if (shape.shapeType === "circle") {
                const cx = shape.x + shape.width / 2;
                const cy = shape.y + shape.height / 2;
                const rx = shape.width / 2;
                const ry = shape.height / 2;
                return (
                  <ellipse
                    key={shape.id}
                    cx={`${cx}%`}
                    cy={`${cy}%`}
                    rx={`${rx}%`}
                    ry={`${ry}%`}
                    fill={shape.opacity < 0.5 ? shape.color : "transparent"}
                    fillOpacity={shape.opacity < 0.5 ? shape.opacity : 0}
                    stroke={shape.color}
                    strokeWidth={shape.strokeWidth}
                    opacity={shape.opacity}
                  />
                );
              }
              if (shape.shapeType === "line") {
                return (
                  <line
                    key={shape.id}
                    x1={`${shape.x}%`}
                    y1={`${shape.y}%`}
                    x2={`${shape.endX ?? shape.x + shape.width}%`}
                    y2={`${shape.endY ?? shape.y + shape.height}%`}
                    stroke={shape.color}
                    strokeWidth={shape.strokeWidth}
                    strokeLinecap="round"
                    opacity={shape.opacity}
                  />
                );
              }
              if (shape.shapeType === "arrow") {
                const markerId = `url(#arrowhead-${shape.color.replace("#", "")})`;
                return (
                  <line
                    key={shape.id}
                    x1={`${shape.x}%`}
                    y1={`${shape.y}%`}
                    x2={`${shape.endX ?? shape.x + shape.width}%`}
                    y2={`${shape.endY ?? shape.y + shape.height}%`}
                    stroke={shape.color}
                    strokeWidth={shape.strokeWidth}
                    strokeLinecap="round"
                    markerEnd={markerId}
                    opacity={shape.opacity}
                  />
                );
              }
              if (shape.shapeType === "freehand" && shape.points && shape.points.length > 1) {
                const pathData = shape.points
                  .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x}% ${p.y}%`)
                  .join(" ");
                return (
                  <path
                    key={shape.id}
                    d={pathData}
                    fill="none"
                    stroke={shape.color}
                    strokeWidth={shape.strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={shape.opacity}
                  />
                );
              }
              return null;
            })}

            {/* Currently Drawing Shape Preview */}
            {isDrawing && currentDraw && (
              <>
                {activeTool === "rectangle" && (
                  <rect
                    x={`${currentDraw.x}%`}
                    y={`${currentDraw.y}%`}
                    width={`${currentDraw.width}%`}
                    height={`${currentDraw.height}%`}
                    fill={isHighlighter ? selectedColor : "transparent"}
                    fillOpacity={isHighlighter ? 0.3 : 0}
                    stroke={selectedColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray="4 2"
                    rx="4"
                  />
                )}
                {activeTool === "circle" && (
                  <ellipse
                    cx={`${currentDraw.x + currentDraw.width / 2}%`}
                    cy={`${currentDraw.y + currentDraw.height / 2}%`}
                    rx={`${currentDraw.width / 2}%`}
                    ry={`${currentDraw.height / 2}%`}
                    fill={isHighlighter ? selectedColor : "transparent"}
                    fillOpacity={isHighlighter ? 0.3 : 0}
                    stroke={selectedColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray="4 2"
                  />
                )}
                {activeTool === "line" && drawStart && (
                  <line
                    x1={`${drawStart.x}%`}
                    y1={`${drawStart.y}%`}
                    x2={`${currentDraw.x + currentDraw.width}%`}
                    y2={`${currentDraw.y + currentDraw.height}%`}
                    stroke={selectedColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray="4 2"
                  />
                )}
                {activeTool === "arrow" && drawStart && (
                  <line
                    x1={`${drawStart.x}%`}
                    y1={`${drawStart.y}%`}
                    x2={`${currentDraw.x + currentDraw.width}%`}
                    y2={`${currentDraw.y + currentDraw.height}%`}
                    stroke={selectedColor}
                    strokeWidth={strokeWidth}
                    markerEnd={`url(#arrowhead-${selectedColor.replace("#", "")})`}
                  />
                )}
                {activeTool === "freehand" && currentDraw.points && (
                  <path
                    d={currentDraw.points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x}% ${p.y}%`).join(" ")}
                    fill="none"
                    stroke={selectedColor}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={isHighlighter ? 0.4 : 0.9}
                  />
                )}
              </>
            )}
          </svg>

          {/* ========================================================================= */}
          {/* 3. STICKY NOTES LAYER (CARDS & PINS AT COORDINATES) */}
          {/* ========================================================================= */}
          {stickyNotesList.map((note, index) => {
            const isSelected = selectedAnnotationId === note.id;
            const isCollapsed = note.isCollapsed ?? true;
            const colorScheme = STICKY_COLORS.find((c) => c.bg === note.color) || STICKY_COLORS[0];

            return (
              <div
                key={note.id}
                style={{
                  position: "absolute",
                  left: `${note.x}%`,
                  top: `${note.y}%`,
                  transform: isCollapsed ? "translate(-50%, -50%)" : "translate(-20px, -20px)",
                  zIndex: isSelected ? 45 : 35,
                  pointerEvents: "auto",
                }}
              >
                {/* 3.A COLLAPSED PIN BADGE */}
                {isCollapsed ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateStickyNote(note.id, { isCollapsed: false });
                      setSelectedAnnotationId(note.id);
                    }}
                    onPointerDown={(e) => isAuthorized && startDragNote(e, note)}
                    title={`ملاحظة: ${note.title || "ملاحظة قضائية"} (${note.authorName})\nانقر للفتح`}
                    style={{
                      border: `2px solid ${note.isResolved ? "#16a34a" : colorScheme.border}`,
                      background: note.isResolved ? "#dcfce7" : colorScheme.bg,
                      color: note.isResolved ? "#14532d" : colorScheme.text,
                      padding: "4px 8px",
                      borderRadius: "20px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      fontSize: "11px",
                      fontWeight: 800,
                      transition: "transform 0.15s ease",
                      userSelect: "none",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    {note.isResolved ? (
                      <CheckCircle2 size={13} style={{ color: "#16a34a" }} />
                    ) : (
                      <StickyNote size={13} style={{ color: colorScheme.border }} />
                    )}
                    <span>#{index + 1}</span>
                    <span style={{ fontSize: "9px", maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {note.content || note.title}
                    </span>
                  </button>
                ) : (
                  /* 3.B EXPANDED STICKY NOTE CARD */
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAnnotationId(note.id);
                    }}
                    style={{
                      width: "280px",
                      background: colorScheme.bg,
                      border: `1.5px solid ${colorScheme.border}`,
                      borderRadius: "12px",
                      boxShadow: "0 12px 30px rgba(0,0,0,0.22)",
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                      transition: "box-shadow 0.15s ease",
                    }}
                  >
                    {/* Sticky Note Header (Draggable) */}
                    <div
                      onPointerDown={(e) => isAuthorized && startDragNote(e, note)}
                      style={{
                        background: colorScheme.headerBg,
                        padding: "8px 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "grab",
                        borderBottom: `1px solid ${colorScheme.border}`,
                        userSelect: "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Move size={12} style={{ opacity: 0.6 }} />
                        <span style={{ fontSize: "11px", fontWeight: 800, color: colorScheme.text }}>
                          #{index + 1} ملاحظة موضعية
                        </span>
                        <span style={{ fontSize: "9px", opacity: 0.7 }}>
                          ({note.x.toFixed(0)}%, {note.y.toFixed(0)}%)
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateStickyNote(note.id, { isCollapsed: true });
                          }}
                          title="تصغير الملاحظة إلى دبوس"
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            padding: "2px",
                            color: colorScheme.text,
                          }}
                        >
                          <ChevronUp size={14} />
                        </button>
                        {isAuthorized && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteAnnotation(note.id);
                            }}
                            title="حذف هذه الملاحظة"
                            style={{
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              padding: "2px",
                              color: "#dc2626",
                            }}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Author & Timestamp Tag */}
                    <div
                      style={{
                        padding: "6px 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "10px",
                        color: "#4b5563",
                        borderBottom: "1px dashed rgba(0,0,0,0.08)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <User size={11} />
                        <strong>{note.authorName}</strong>
                        {note.authorRole && (
                          <span style={{ fontSize: "8.5px", background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: "4px" }}>
                            {note.authorRole}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "9px", color: "#6b7280" }}>
                        <Clock size={10} />
                        <span>{new Date(note.createdAt).toLocaleDateString("ar-EG")}</span>
                      </div>
                    </div>

                    {/* Note Content Area */}
                    <div style={{ padding: "8px 10px" }}>
                      <textarea
                        rows={3}
                        value={note.content}
                        disabled={!isAuthorized}
                        onChange={(e) => updateStickyNote(note.id, { content: e.target.value })}
                        placeholder="اكتب التوجيه أو الملاحظة الخاصة بهذا الموضع..."
                        style={{
                          width: "100%",
                          border: "1px solid rgba(0,0,0,0.1)",
                          borderRadius: "6px",
                          background: "#ffffff",
                          padding: "6px 8px",
                          fontSize: "11px",
                          fontFamily: "inherit",
                          color: "#1f2937",
                          resize: "vertical",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>

                    {/* Note Footer: Color Pickers and Resolution Toggle */}
                    <div
                      style={{
                        padding: "6px 10px 8px 10px",
                        background: "rgba(255,255,255,0.5)",
                        borderTop: "1px solid rgba(0,0,0,0.06)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      {/* Color Palette for this note */}
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {STICKY_COLORS.map((c) => (
                          <button
                            key={c.bg}
                            type="button"
                            onClick={() => updateStickyNote(note.id, { color: c.bg })}
                            title={c.name}
                            style={{
                              width: "13px",
                              height: "13px",
                              borderRadius: "50%",
                              background: c.bg,
                              border: `1.5px solid ${c.border}`,
                              cursor: "pointer",
                              padding: 0,
                            }}
                          />
                        ))}
                      </div>

                      {/* Resolution Checkbox */}
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "10px",
                          fontWeight: 600,
                          color: note.isResolved ? "#16a34a" : "#4b5563",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={note.isResolved}
                          disabled={!isAuthorized}
                          onChange={(e) => updateStickyNote(note.id, { isResolved: e.target.checked })}
                          style={{ cursor: "pointer" }}
                        />
                        <span>{note.isResolved ? "تم الإجراء" : "قيد المتابعة"}</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SLIDE-OUT STICKY NOTES DRAWER (SIDEBAR) */}
      {/* ========================================================================= */}
      {showNotesDrawer && (
        <div
          className="sticky-notes-drawer"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            right: 0,
            width: "320px",
            maxWidth: "85%",
            zIndex: 50,
            background: "#ffffff",
            boxShadow: "-8px 0 25px rgba(0,0,0,0.15)",
            borderLeft: "1px solid #d0e0d9",
            display: "flex",
            flexDirection: "column",
            animation: "slideInRight 0.2s ease-out",
          }}
        >
          {/* Drawer Header */}
          <div
            style={{
              padding: "14px 16px",
              background: "#f4f8f6",
              borderBottom: "1px solid #dce8e2",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <MessageSquare size={16} style={{ color: "#1c5563" }} />
              <div>
                <h4 style={{ margin: 0, fontSize: "13px", color: "#183e47", fontWeight: 700 }}>
                  سجل الملاحظات والتأشيرات
                </h4>
                <span style={{ fontSize: "10px", color: "#607e7b" }}>
                  وارد رقم: <strong>{fileNumber}</strong>
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowNotesDrawer(false)}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: "4px",
                color: "#6b7280",
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Filter Bar */}
          <div
            style={{
              padding: "8px 14px",
              background: "#fafdfb",
              borderBottom: "1px solid #e5efeb",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "inline-flex", background: "#e8f2ee", borderRadius: "6px", padding: "2px", gap: "2px" }}>
              <button
                type="button"
                onClick={() => setNotesFilter("all")}
                style={{
                  border: "none",
                  background: notesFilter === "all" ? "#ffffff" : "transparent",
                  color: notesFilter === "all" ? "#1a5146" : "#4e6a67",
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                الكل ({stickyNotesList.length})
              </button>
              <button
                type="button"
                onClick={() => setNotesFilter("active")}
                style={{
                  border: "none",
                  background: notesFilter === "active" ? "#ffffff" : "transparent",
                  color: notesFilter === "active" ? "#b45309" : "#4e6a67",
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                قيد الإجراء ({activeNotesCount})
              </button>
              <button
                type="button"
                onClick={() => setNotesFilter("resolved")}
                style={{
                  border: "none",
                  background: notesFilter === "resolved" ? "#ffffff" : "transparent",
                  color: notesFilter === "resolved" ? "#15803d" : "#4e6a67",
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                مكتملة ({stickyNotesList.length - activeNotesCount})
              </button>
            </div>

            {isAuthorized && (
              <button
                type="button"
                onClick={() => {
                  setActiveTool("sticky_note");
                  setShowNotesDrawer(false);
                }}
                style={{
                  border: "none",
                  background: "#1c5563",
                  color: "#ffffff",
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>+ ملاحظة</span>
              </button>
            )}
          </div>

          {/* Notes List Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {filteredNotes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 10px", color: "#8da5a0" }}>
                <StickyNote size={32} style={{ margin: "0 auto 8px auto", opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: "12px", fontWeight: 600 }}>لا توجد ملاحظات لاصقة حتى الآن</p>
                <span style={{ fontSize: "10px" }}>اختر أداة "ملاحظة لاصقة" من الشريط العلوي وانقر على موضع في المستند</span>
              </div>
            ) : (
              filteredNotes.map((note, idx) => {
                const colorScheme = STICKY_COLORS.find((c) => c.bg === note.color) || STICKY_COLORS[0];
                return (
                  <div
                    key={note.id}
                    onClick={() => {
                      updateStickyNote(note.id, { isCollapsed: false });
                      setSelectedAnnotationId(note.id);
                    }}
                    style={{
                      background: colorScheme.bg,
                      border: `1px solid ${colorScheme.border}`,
                      borderRadius: "8px",
                      padding: "10px",
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      transition: "transform 0.1s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <MapPin size={12} style={{ color: colorScheme.text }} />
                        <span style={{ fontSize: "11px", fontWeight: 800, color: colorScheme.text }}>
                          ملاحظة #{idx + 1}
                        </span>
                        <span style={{ fontSize: "9px", color: "#6b7280" }}>
                          (س: {note.x.toFixed(0)}% ، ص: {note.y.toFixed(0)}%)
                        </span>
                      </div>
                      {note.isResolved && (
                        <span style={{ fontSize: "9px", color: "#16a34a", fontWeight: 700, display: "flex", alignItems: "center", gap: "2px" }}>
                          <CheckCircle2 size={11} />
                          معالجة
                        </span>
                      )}
                    </div>

                    <p style={{ margin: 0, fontSize: "11px", color: "#1f2937", lineHeight: 1.4 }}>
                      {note.content || "ملاحظة فارغة..."}
                    </p>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "9.5px", color: "#6b7280", borderTop: "1px dashed rgba(0,0,0,0.1)", paddingTop: "4px" }}>
                      <span>{note.authorName} ({note.authorRole})</span>
                      <span>{new Date(note.createdAt).toLocaleDateString("ar-EG")}</span>
                    </div>
                  </div>
                );
              })
            )}

            {/* Shapes summary */}
            {shapesList.length > 0 && (
              <div style={{ marginTop: "12px", borderTop: "1px solid #e5efeb", paddingTop: "10px" }}>
                <span style={{ fontSize: "10px", color: "#607e7b", fontWeight: 700 }}>
                  الأشكال والرسومات على الصفحة ({shapesList.length}):
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                  {shapesList.map((shape, i) => (
                    <span
                      key={shape.id}
                      style={{
                        fontSize: "9px",
                        background: "#f0f6f4",
                        border: "1px solid #d4e4dd",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        color: "#22474f",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: shape.color }} />
                      {shape.shapeType === "rectangle" ? "مستطيل" : shape.shapeType === "circle" ? "دائرة" : shape.shapeType === "arrow" ? "سهم" : "رسم"} #{i + 1}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

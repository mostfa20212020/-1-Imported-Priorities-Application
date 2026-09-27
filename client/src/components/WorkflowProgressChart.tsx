import React, { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import {
  CheckCircle2,
  Clock,
  Clock3,
  FileCheck,
  FileInput,
  FilePenLine,
  HelpCircle,
  Info,
  Layers,
  Send,
  ShieldCheck,
  Signature,
  Sparkles,
  UserCheck,
} from "lucide-react";

export interface WorkflowStage {
  id: string;
  stepNumber: number;
  arabicNum: string;
  title: string;
  subtitle: string;
  description: string;
  responsible: string;
  status: "completed" | "current" | "upcoming";
  statusText: string;
  timestamp?: string | null;
  details?: string;
  actionItems?: string[];
  iconType: "entry" | "signature" | "dispatch" | "completed";
}

interface WorkflowProgressChartProps {
  file: any;
  history?: any[];
  className?: string;
}

export function WorkflowProgressChart({ file, history = [], className = "" }: WorkflowProgressChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(760);

  // Formatting date helper
  const formatTime = (d?: any) => {
    if (!d) return null;
    try {
      const date = new Date(d);
      if (isNaN(date.getTime())) return null;
      return date.toLocaleDateString("ar-EG", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  };

  // Determine current lifecycle index (0 to 3)
  // 0: مسودة / قيد التسجيل (new)
  // 1: بانتظار توقيع النائب العام (PENDING_AG / awaiting_direction)
  // 2: بانتظار تفريغ التوجيه والترحيل (PENDING_EMPLOYEE / in_progress)
  // 3: مكتملة ومرحّلة نهائياً (COMPLETED / completed / directed)
  const currentStepIndex = useMemo(() => {
    if (!file) return 0;
    const s = String(file.status || "").toUpperCase();
    if (s === "COMPLETED" || s === "DIRECTED") return 3;
    if (s === "PENDING_EMPLOYEE" || (file.isSigned && s !== "PENDING_AG")) return 2;
    if (s === "PENDING_AG" || s === "AWAITING_DIRECTION") return 1;
    if (s === "NEW") return 0;
    return file.isSigned ? 2 : 1;
  }, [file]);

  // Construct stages data
  const stages: WorkflowStage[] = useMemo(() => {
    const isStage0Done = currentStepIndex > 0;
    const isStage1Done = currentStepIndex > 1 || file.isSigned;
    const isStage2Done = currentStepIndex > 2;
    const isStage3Done = currentStepIndex >= 3;

    // Search history for stage action logs
    const registrationLog = history.find((h) => h.actionType?.includes("تسجيل") || h.actionType?.includes("إدخال"));
    const signLog = history.find((h) => h.actionType?.includes("توقيع") || h.actionType?.includes("اعتماد"));
    const dispatchLog = history.find((h) => h.actionType?.includes("توجيه") || h.actionType?.includes("إحالة") || h.actionType?.includes("تفريغ"));
    const completeLog = history.find((h) => h.actionType?.includes("اكتمال") || h.actionType?.includes("حفظ") || h.actionType?.includes("ترحيل"));

    return [
      {
        id: "stage-entry",
        stepNumber: 1,
        arabicNum: "١",
        title: "تسجيل وقيد الوارد",
        subtitle: "المرحلة الأولى: الاستقبال والقيد",
        description: "تسجيل بيانات الوارد الأساسية، توليد الرقم الآلي، وأرشفة المستند الأصلي PDF.",
        responsible: file.registeredBy || registrationLog?.actorName || "موظف الاستقبال والتسجيل",
        status: isStage0Done ? "completed" : currentStepIndex === 0 ? "current" : "upcoming",
        statusText: isStage0Done ? "تم القيد والأرشفة" : currentStepIndex === 0 ? "قيد الإدخال حالياً" : "بانتظار البدء",
        timestamp: formatTime(registrationLog?.createdAt || file.arrivalDate || file.createdAt),
        details: `رقم الوارد: ${file.fileNumber} | الجهة: ${file.sourceEntity} | النوع: ${file.fileType}`,
        actionItems: [
          "توليد الرقم المرجعي الآلي",
          "فحص وتدقيق نوع المعاملة ومستوى الأهمية",
          "رفع وثيقة الوارد الرسمية الأصلية (PDF)",
          "الترحيل الآلي للوحة النائب العام (PENDING_AG)",
        ],
        iconType: "entry",
      },
      {
        id: "stage-signature",
        stepNumber: 2,
        arabicNum: "٢",
        title: "مراجعة واعتماد النائب العام",
        subtitle: "المرحلة الثانية: التوجيه والتوقيع الإلكتروني",
        description: "اطلاع فضيلة النائب العام، تدوين التوجيه القضائي، واعتماد التوقيع الرقمي والختم الرسمي على الصفحة الأولى.",
        responsible: file.signatureTitle || "فضيلة القاضي / رئيس النيابة العامة",
        status: isStage1Done ? "completed" : currentStepIndex === 1 ? "current" : "upcoming",
        statusText: isStage1Done ? "تم التوقيع والاعتماد" : currentStepIndex === 1 ? "قيد نظر النائب العام" : "قادمة",
        timestamp: formatTime(file.signedAt || signLog?.createdAt),
        details: file.signedInstruction || file.directorInstruction || (isStage1Done ? "تم التوقيع والاعتماد رسمياً" : "المعاملة بانتظار توقيع النائب العام"),
        actionItems: [
          "المراجعة القضائية للوارد ومرفقاته",
          "صياغة التوجيه والتعليمات القضائية",
          "تثبيت التوقيع الرقمي والختم الرسمي على PDF",
          "الترحيل للمرحلة التالية (PENDING_EMPLOYEE)",
        ],
        iconType: "signature",
      },
      {
        id: "stage-dispatch",
        stepNumber: 3,
        arabicNum: "٣",
        title: "تفريغ التوجيه والإحالة",
        subtitle: "المرحلة الثالثة: التفريغ وتحديد المكلف",
        description: "استلام الموظف للمعاملة الموقعة، تفريغ نص التوجيه، وإحالتها للشعبة أو العضو المختص.",
        responsible: file.assignedEmployee ? `${file.assignedEmployee} - ${file.assignedDepartment || "الجهة المختصة"}` : (file.currentResponsible || "الموظف المختص بالتفريغ"),
        status: isStage2Done ? "completed" : currentStepIndex === 2 ? "current" : "upcoming",
        statusText: isStage2Done ? "تم التفريغ والإحالة" : currentStepIndex === 2 ? "بانتظار تفريغ التوجيه" : "قادمة",
        timestamp: formatTime(dispatchLog?.createdAt || file.directedAt),
        details: file.assignedDepartment ? `الشعبة المحال إليها: ${file.assignedDepartment} ${file.assignedEmployee ? `| العضو: ${file.assignedEmployee}` : ""}` : (file.directorInstruction ? `التوجيه: ${file.directorInstruction}` : "بانتظار تحديد القسم والعضو"),
        actionItems: [
          "مطابقة توجيه النائب العام المدون بالملف",
          "تحديد الدائرة أو النيابة الجزئية أو الشعبة",
          "تعيين عضو النيابة المكلف بالمتابعة",
          "تحديد مهلة الإنجاز القانونية والتنبيهات",
        ],
        iconType: "dispatch",
      },
      {
        id: "stage-completed",
        stepNumber: 4,
        arabicNum: "٤",
        title: "الترحيل النهائي والأرشفة",
        subtitle: "المرحلة الرابعة: اكتمال المعاملة والتثبيت",
        description: "اكتمال كافة متطلبات المعاملة والتثبيت النهائي في قاعدة بيانات السجلات القضائية العامة (COMPLETED).",
        responsible: "المحفوظات العامة وسجلات القيد القضائي",
        status: isStage3Done ? "completed" : currentStepIndex === 3 ? "current" : "upcoming",
        statusText: isStage3Done ? "مكتملة ومرحّلة نهائياً" : "بانتظار الإنجاز النهائي",
        timestamp: formatTime(file.completedAt || completeLog?.createdAt || (isStage3Done ? file.updatedAt : null)),
        details: isStage3Done ? "المعاملة منجزة ومحفوظة رسمياً في سجلات النيابة العامة" : "سيتم الإغلاق والأرشفة بعد استيفاء الإحالة والتنفيذ",
        actionItems: [
          "تأكيد استلام الإفادات والمذكرات الجوابية",
          "حفظ النسخة الأصلية والموقعة في الأرشيف الدائم",
          "إغلاق المعاملة وتسجيل الحالة (COMPLETED)",
          "تحديث التقارير والإحصائيات القضائية العامة",
        ],
        iconType: "completed",
      },
    ];
  }, [file, currentStepIndex, history]);

  // Set default selected stage to current active stage
  useEffect(() => {
    if (!selectedStageId) {
      const activeStage = stages[Math.min(currentStepIndex, stages.length - 1)];
      if (activeStage) setSelectedStageId(activeStage.id);
    }
  }, [currentStepIndex, stages, selectedStageId]);

  // ResizeObserver to make SVG chart 100% responsive
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(Math.max(340, Math.floor(entry.contentRect.width)));
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute overall percentage
  const progressPercent = useMemo(() => {
    if (currentStepIndex >= 3) return 100;
    if (currentStepIndex === 2) return 75;
    if (currentStepIndex === 1) return 40;
    return 15;
  }, [currentStepIndex]);

  // Selected stage object
  const activeSelectedStage = useMemo(() => {
    return stages.find((s) => s.id === selectedStageId) || stages[Math.min(currentStepIndex, stages.length - 1)];
  }, [stages, selectedStageId, currentStepIndex]);

  // --------------------------------------------------------------------------
  // D3 Rendering Effect
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    const width = containerWidth;
    const height = 140;
    const margin = { top: 25, right: 55, bottom: 45, left: 55 };
    const chartWidth = width - margin.right - margin.left;

    svg.attr("viewBox", `0 0 ${width} ${height}`);

    // Definitions: Gradients, Filters, Markers
    const defs = svg.append("defs");

    // Drop shadow filter for nodes
    const filter = defs
      .append("filter")
      .attr("id", "d3-node-shadow")
      .attr("x", "-30%")
      .attr("y", "-30%")
      .attr("width", "160%")
      .attr("height", "160%");
    filter
      .append("feDropShadow")
      .attr("dx", "0")
      .attr("dy", "3")
      .attr("stdDeviation", "4")
      .attr("flood-color", "#0f3d64")
      .attr("flood-opacity", "0.22");

    // Glow filter for current node
    const glowFilter = defs
      .append("filter")
      .attr("id", "d3-node-glow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");
    glowFilter
      .append("feGaussianBlur")
      .attr("stdDeviation", "5")
      .attr("result", "coloredBlur");
    const feMerge = glowFilter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Completed track gradient (Emerald green to Teal)
    const completedGrad = defs
      .append("linearGradient")
      .attr("id", "d3-completed-gradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", chartWidth)
      .attr("y1", 0)
      .attr("x2", 0)
      .attr("y2", 0);
    completedGrad.append("stop").attr("offset", "0%").attr("stop-color", "#10b981");
    completedGrad.append("stop").attr("offset", "100%").attr("stop-color", "#0f766e");

    // Active track gradient (Teal to Navy)
    const activeGrad = defs
      .append("linearGradient")
      .attr("id", "d3-active-gradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", chartWidth)
      .attr("y1", 0)
      .attr("x2", 0)
      .attr("y2", 0);
    activeGrad.append("stop").attr("offset", "0%").attr("stop-color", "#10b981");
    activeGrad.append("stop").attr("offset", "70%").attr("stop-color", "#163b50");
    activeGrad.append("stop").attr("offset", "100%").attr("stop-color", "#0284c7");

    // Arrow markers for RTL flow (arrow points LEFT because Arabic workflow flows Right-to-Left)
    const marker = defs
      .append("marker")
      .attr("id", "d3-flow-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 0)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto-start-reverse");
    marker
      .append("path")
      .attr("d", "M10,-4L0,0L10,4")
      .attr("fill", "#94a3b8");

    const markerActive = defs
      .append("marker")
      .attr("id", "d3-flow-arrow-active")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 0)
      .attr("refY", 0)
      .attr("markerWidth", 7)
      .attr("markerHeight", 7)
      .attr("orient", "auto-start-reverse");
    markerActive
      .append("path")
      .attr("d", "M10,-4L0,0L10,4")
      .attr("fill", "#0f766e");

    const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

    // In RTL, Step 1 is at the RIGHT (chartWidth), and Step 4 is at the LEFT (0)
    // Scale for 4 stages: index 0 (Stage 1) -> chartWidth; index 3 (Stage 4) -> 0
    const stepCount = stages.length;
    const xScale = d3
      .scalePoint<number>()
      .domain(d3.range(stepCount))
      .range([chartWidth, 0])
      .padding(0);

    const centerY = 36;

    // 1. Background Connector Line (Entire Track)
    g.append("line")
      .attr("x1", xScale(0) ?? chartWidth)
      .attr("y1", centerY)
      .attr("x2", xScale(stepCount - 1) ?? 0)
      .attr("y2", centerY)
      .attr("stroke", "#e2e8f0")
      .attr("stroke-width", 5)
      .attr("stroke-linecap", "round");

    // Subtle dashed pattern on the background line to give an engineering/pipeline feel
    g.append("line")
      .attr("x1", xScale(0) ?? chartWidth)
      .attr("y1", centerY)
      .attr("x2", xScale(stepCount - 1) ?? 0)
      .attr("y2", centerY)
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,6")
      .attr("opacity", 0.7);

    // 2. Completed / In-Progress Connector Path with D3 Transition
    const targetX = xScale(Math.min(currentStepIndex, stepCount - 1)) ?? 0;
    const startX = xScale(0) ?? chartWidth;

    const progressLine = g
      .append("line")
      .attr("x1", startX)
      .attr("y1", centerY)
      .attr("x2", startX) // start at origin for animation
      .attr("y2", centerY)
      .attr("stroke", "url(#d3-active-gradient)")
      .attr("stroke-width", 5)
      .attr("stroke-linecap", "round");

    // Animate the line moving to target position
    progressLine
      .transition()
      .duration(800)
      .ease(d3.easeCubicOut)
      .attr("x2", targetX);

    // Flow particles along the path if in progress
    if (currentStepIndex < stepCount - 1) {
      const activeSegmentStart = xScale(currentStepIndex) ?? chartWidth;
      const activeSegmentEnd = xScale(currentStepIndex + 1) ?? 0;

      // Add a subtle animated flow dash between current step and next step
      const flowGuide = g
        .append("line")
        .attr("x1", activeSegmentStart)
        .attr("y1", centerY)
        .attr("x2", activeSegmentEnd)
        .attr("y2", centerY)
        .attr("stroke", "#0284c7")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5")
        .attr("opacity", 0.6);

      flowGuide
        .append("animate")
        .attr("attributeName", "stroke-dashoffset")
        .attr("values", "20;0")
        .attr("dur", "1.2s")
        .attr("repeatCount", "indefinite");
    }

    // 3. Render Each Milestone Step Node
    stages.forEach((stage, idx) => {
      const x = xScale(idx) ?? 0;
      const isCompleted = stage.status === "completed";
      const isCurrent = stage.status === "current";
      const isUpcoming = stage.status === "upcoming";
      const isSelected = stage.id === selectedStageId;

      const nodeGroup = g
        .append("g")
        .attr("class", `d3-step-node stage-${stage.id}`)
        .attr("transform", `translate(${x}, ${centerY})`)
        .style("cursor", "pointer")
        .on("click", () => {
          setSelectedStageId(stage.id);
        })
        .on("mouseenter", function () {
          d3.select(this)
            .select(".node-main-circle")
            .transition()
            .duration(180)
            .attr("transform", "scale(1.12)");
        })
        .on("mouseleave", function () {
          d3.select(this)
            .select(".node-main-circle")
            .transition()
            .duration(180)
            .attr("transform", "scale(1)");
        });

      // Pulse aura for CURRENT node
      if (isCurrent) {
        const aura = nodeGroup
          .append("circle")
          .attr("r", 26)
          .attr("fill", "none")
          .attr("stroke", "#0284c7")
          .attr("stroke-width", 2)
          .attr("opacity", 0.65);

        aura
          .append("animate")
          .attr("attributeName", "r")
          .attr("values", "20;29;20")
          .attr("dur", "2.2s")
          .attr("repeatCount", "indefinite");

        aura
          .append("animate")
          .attr("attributeName", "opacity")
          .attr("values", "0.7;0.1;0.7")
          .attr("dur", "2.2s")
          .attr("repeatCount", "indefinite");
      }

      // Selection halo indicator if clicked
      if (isSelected) {
        nodeGroup
          .append("circle")
          .attr("r", 25)
          .attr("fill", "none")
          .attr("stroke", isCompleted ? "#059669" : isCurrent ? "#0f3d64" : "#64748b")
          .attr("stroke-width", 2.5)
          .attr("stroke-dasharray", "3,3");
      }

      // Main Circle Container for scaling hover
      const circleContainer = nodeGroup
        .append("g")
        .attr("class", "node-main-circle");

      // Outer ring / fill color depending on status
      const circleFill = isCompleted
        ? "#059669" // Emerald green
        : isCurrent
        ? "#163b50" // Deep Navy / Primary
        : "#f8fafc"; // Soft slate

      const circleStroke = isCompleted
        ? "#10b981"
        : isCurrent
        ? "#0284c7"
        : "#cbd5e1";

      circleContainer
        .append("circle")
        .attr("r", 18)
        .attr("fill", circleFill)
        .attr("stroke", circleStroke)
        .attr("stroke-width", isCurrent ? 3 : 2)
        .attr("filter", "url(#d3-node-shadow)");

      // Center Icon or Glyphs
      if (isCompleted) {
        // SVG Checkmark icon
        circleContainer
          .append("path")
          .attr("d", "M-5,-0.5 L-1.5,3.5 L5,-4")
          .attr("fill", "none")
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 2.6)
          .attr("stroke-linecap", "round")
          .attr("stroke-linejoin", "round");
      } else if (isCurrent) {
        // Arabic Step Number with white bold text
        circleContainer
          .append("text")
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .attr("font-size", "14px")
          .attr("font-weight", "800")
          .attr("fill", "#ffffff")
          .text(stage.arabicNum);
      } else {
        // Upcoming step number with muted text
        circleContainer
          .append("text")
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .attr("font-size", "13px")
          .attr("font-weight", "700")
          .attr("fill", "#64748b")
          .text(stage.arabicNum);
      }

      // Label below node: Stage Title
      const textGroup = nodeGroup.append("g").attr("transform", `translate(0, 32)`);

      textGroup
        .append("text")
        .attr("text-anchor", "middle")
        .attr("font-size", width < 550 ? "10.5px" : "11.5px")
        .attr("font-weight", isSelected || isCurrent ? "700" : "600")
        .attr("fill", isSelected ? "#0f3d64" : isCompleted ? "#065f46" : isCurrent ? "#0f3d64" : "#64748b")
        .text(stage.title);

      // Status text indicator under title
      textGroup
        .append("text")
        .attr("y", 16)
        .attr("text-anchor", "middle")
        .attr("font-size", "9.5px")
        .attr("font-weight", isCurrent ? "700" : "500")
        .attr("fill", isCompleted ? "#059669" : isCurrent ? "#0284c7" : "#94a3b8")
        .text(stage.statusText);
    });
  }, [containerWidth, stages, selectedStageId, currentStepIndex]);

  return (
    <div className={`workflow-d3-container ${className}`} ref={containerRef}>
      {/* Header with Title and Overall Completion Progress */}
      <div className="workflow-d3-header">
        <div className="workflow-d3-title-block">
          <div className="workflow-d3-icon-badge">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="workflow-d3-title-row">
              <h3>مخطط مسار العمل التفاعلي (D3 Workflow Engine)</h3>
              <span className="workflow-d3-stage-badge">
                المرحلة {stages[Math.min(currentStepIndex, stages.length - 1)]?.arabicNum} من ٤
              </span>
            </div>
            <span className="workflow-d3-subtitle">
              تتبع دقيق ومباشر لدورة حياة المعاملة من نقطة الورود وحتى الأرشفة والترحيل النهائي
            </span>
          </div>
        </div>

        <div className="workflow-d3-progress-gauge">
          <div className="workflow-d3-progress-info">
            <span className="gauge-label">نسبة الإنجاز الكلي:</span>
            <strong className="gauge-percent">{progressPercent}%</strong>
          </div>
          <div className="workflow-d3-meter-bar">
            <div
              className="workflow-d3-meter-fill"
              style={{
                width: `${progressPercent}%`,
                background:
                  progressPercent === 100
                    ? "linear-gradient(90deg, #10b981, #059669)"
                    : "linear-gradient(90deg, #163b50, #0284c7)",
              }}
            />
          </div>
        </div>
      </div>

      {/* D3 Interactive SVG Canvas */}
      <div className="workflow-d3-svg-wrapper">
        <svg ref={svgRef} className="workflow-d3-svg" width="100%" height="140" />
      </div>

      {/* Interactive Step Switcher Tabs */}
      <div className="workflow-d3-tabs" role="tablist">
        {stages.map((stg) => {
          const isSelected = stg.id === activeSelectedStage.id;
          const isDone = stg.status === "completed";
          const isCurr = stg.status === "current";

          return (
            <button
              key={stg.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`workflow-d3-tab-btn ${isSelected ? "selected" : ""} ${stg.status}`}
              onClick={() => setSelectedStageId(stg.id)}
            >
              <div className="tab-btn-number">{stg.arabicNum}</div>
              <div className="tab-btn-content">
                <strong>{stg.title}</strong>
                <span>{stg.statusText}</span>
              </div>
              {isDone && <CheckCircle2 size={14} className="tab-check-icon" />}
              {isCurr && <span className="tab-curr-pulse" />}
            </button>
          );
        })}
      </div>

      {/* Detailed Inspection Card for the Selected Stage */}
      {activeSelectedStage && (
        <div className="workflow-d3-detail-card">
          <div className="workflow-d3-detail-top">
            <div className="detail-top-title">
              <div
                className={`stage-detail-symbol ${
                  activeSelectedStage.status === "completed"
                    ? "symbol-completed"
                    : activeSelectedStage.status === "current"
                    ? "symbol-current"
                    : "symbol-upcoming"
                }`}
              >
                {activeSelectedStage.iconType === "entry" && <FileInput size={17} />}
                {activeSelectedStage.iconType === "signature" && <Signature size={17} />}
                {activeSelectedStage.iconType === "dispatch" && <FilePenLine size={17} />}
                {activeSelectedStage.iconType === "completed" && <ShieldCheck size={17} />}
              </div>
              <div>
                <h4>
                  {activeSelectedStage.arabicNum}. {activeSelectedStage.title}
                </h4>
                <span className="detail-top-subtitle">{activeSelectedStage.subtitle}</span>
              </div>
            </div>

            <div className="detail-top-meta">
              <span
                className={`stage-status-chip chip-${activeSelectedStage.status}`}
              >
                {activeSelectedStage.statusText}
              </span>
              {activeSelectedStage.timestamp && (
                <span className="stage-time-tag">
                  <Clock size={12} /> {activeSelectedStage.timestamp}
                </span>
              )}
            </div>
          </div>

          <p className="workflow-d3-detail-desc">{activeSelectedStage.description}</p>

          <div className="workflow-d3-detail-grid">
            <div className="workflow-d3-grid-item">
              <span className="grid-item-label">المسؤول عن تنفيذ المرحلة:</span>
              <div className="grid-item-value">
                <UserCheck size={14} className="text-teal-700" />
                <strong>{activeSelectedStage.responsible}</strong>
              </div>
            </div>

            <div className="workflow-d3-grid-item">
              <span className="grid-item-label">الملاحظات والتوجيهات المرفقة:</span>
              <div className="grid-item-value">
                <Info size={14} className="text-amber-700" />
                <span className="grid-item-text">
                  {activeSelectedStage.details || "لا توجد ملاحظات إضافية مسجلة"}
                </span>
              </div>
            </div>
          </div>

          {activeSelectedStage.actionItems && activeSelectedStage.actionItems.length > 0 && (
            <div className="workflow-d3-checklist-box">
              <div className="checklist-box-title">
                <Layers size={14} />
                <span>الإجراءات والمعايير المعتمدة لهذه المرحلة:</span>
              </div>
              <div className="checklist-items-grid">
                {activeSelectedStage.actionItems.map((item, idx) => (
                  <div key={idx} className="checklist-item">
                    <span className="checklist-bullet">✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

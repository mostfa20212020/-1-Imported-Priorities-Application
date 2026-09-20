import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileInput,
  FilePenLine,
  FileText,
  Filter,
  History,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  PenTool,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings2,
  ShieldCheck,
  Signature,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  UserRound,
  UserCog,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AutoClassificationBanner,
  PreSaveClassificationReview,
} from "@/components/AutoClassificationBanner";
import { ManualSignatureModal } from "@/components/ManualSignatureModal";
import { FirebaseStatusBadge } from "@/components/FirebaseStatusBadge";
import { SystemResetModal } from "@/components/SystemResetModal";

const statusLabels: Record<string, string> = {
  new: "جديد",
  PENDING_AG: "بانتظار توجيه وتوقيع النائب العام",
  awaiting_direction: "بانتظار توجيه النائب العام",
  PENDING_EMPLOYEE: "بانتظار إدخال التوجيه والترحيل النهائي",
  directed: "موجّه ومحال",
  in_progress: "قيد التنفيذ",
  returned: "معاد للمتابعة",
  completed: "مكتمل",
  COMPLETED: "مرحّل نهائياً لقاعدة البيانات",
  archived: "مؤرشف",
};
const importanceLabels: Record<string, string> = { normal: "عادي", important: "مهم", urgent: "عاجل" };
const statusColors: Record<string, string> = {
  new: "status-blue",
  PENDING_AG: "status-amber",
  awaiting_direction: "status-amber",
  PENDING_EMPLOYEE: "status-purple",
  directed: "status-indigo",
  in_progress: "status-purple",
  returned: "status-orange",
  completed: "status-green",
  COMPLETED: "status-green",
  archived: "status-slate",
};
const importanceColors: Record<string, string> = { normal: "importance-normal", important: "importance-important", urgent: "importance-urgent" };

type ViewKey = "dashboard" | "register" | "receiving" | "followup" | "users" | "settings";

function formatDate(value?: Date | string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-YE", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}
function formatDateTime(value?: Date | string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function getInitials(name?: string | null) {
  return (name || "ر").trim().slice(0, 1);
}

function getRoleLabel(role?: string) {
  if (role === "admin") return "مدير النظام";
  if (role === "director") return "رئيس النيابة العامة";
  return "موظف الإدخال والاستقبال";
}

function getRoleHint(role?: string) {
  if (role === "admin") return "كامل الصلاحيات والإعدادات والتعديل";
  if (role === "director") return "الاطلاع والتوجيه والرفع والتوقيع";
  return "إدخال الوارد ورفعه ومتابعة حالته";
}

export default function Home() {
  const { user, loading, logout } = useAuth();
  const userRole = (user?.role || "input") as "admin" | "director" | "input";
  const isAdmin = userRole === "admin";
  const isDirector = userRole === "director";
  const isReception = userRole === "input";

  const canViewDashboard = isAdmin || isDirector;
  const canRegisterNew = isAdmin || isReception;
  const canDirectFiles = isAdmin || isDirector;
  const canSignFiles = isAdmin || isDirector;
  const canViewFollowup = isAdmin || isDirector;
  const canManageUsers = isAdmin;
  const canManageSettings = isAdmin;
  const canEditAnything = isAdmin;

  const [activeView, setActiveView] = useState<ViewKey>(() => {
    if (user?.role === "input") return "register";
    return "dashboard";
  });

  // Strict role boundaries: prevent unauthorized screen access
  useEffect(() => {
    if (isReception && activeView !== "register" && activeView !== "receiving") {
      setActiveView("register");
    } else if (isDirector && (activeView === "register" || activeView === "users" || activeView === "settings")) {
      setActiveView("dashboard");
    }
  }, [userRole, isReception, isDirector, activeView]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("alawliyat_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("alawliyat_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [importanceFilter, setImportanceFilter] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState("");
  const [sourceEntityFilter, setSourceEntityFilter] = useState("");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "priority">("date_desc");
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const filters = useMemo(() => ({ search: search || undefined, status: statusFilter || undefined, importance: importanceFilter || undefined, fileType: fileTypeFilter || undefined, sourceEntity: sourceEntityFilter || undefined }), [search, statusFilter, importanceFilter, fileTypeFilter, sourceEntityFilter]);
  const filesQuery = trpc.files.list.useQuery(filters, { enabled: Boolean(user) });
  const statsQuery = trpc.files.stats.useQuery(undefined, { enabled: Boolean(user) });
  const notificationsQuery = trpc.notifications.list.useQuery(undefined, { enabled: canDirectFiles, refetchInterval: 30000 });
  const utils = trpc.useUtils();
  const clearDb = trpc.files.clearDatabase.useMutation({
    onSuccess: () => {
      utils.files.list.invalidate();
      utils.files.stats.invalidate();
      toast.success("تم تصفير قاعدة البيانات بنجاح. يمكنك الآن إدخال أول وارد للتجربة.");
      selectView("register");
    },
    onError: (err: any) => {
      toast.error(`خطأ في تصفير قاعدة البيانات: ${err.message}`);
    }
  });
  const selectedInput = useMemo(() => ({ id: selectedId || 0 }), [selectedId]);
  const selectedQuery = trpc.files.get.useQuery(selectedInput, { enabled: Boolean(selectedId) });
  const files = filesQuery.data || [];
  const sortedFiles = useMemo(() => [...files].sort((a, b) => sortBy === "priority" ? ({ urgent: 0, important: 1, normal: 2 }[a.importance] - { urgent: 0, important: 1, normal: 2 }[b.importance]) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() : sortBy === "date_asc" ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [files, sortBy]);

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen />;

  const stats = statsQuery.data || { total: 0, newFiles: 0, awaiting: 0, inProgress: 0, completed: 0, urgent: 0 };
  const unreadCount = (notificationsQuery.data || []).filter((item) => !item.readAt).length;
  const displayName = user.name || "مستخدم النظام";

  const selectView = (view: ViewKey) => {
    setActiveView(view);
    setMobileNav(false);
  };

  return (
    <div className="app-shell" dir="rtl">
      <aside className={`app-sidebar ${mobileNav ? "open" : ""} ${isSidebarCollapsed ? "collapsed" : ""}`}>
        <div className="brand-block">
          <div className="brand-mark" onClick={toggleSidebarCollapse} title={isSidebarCollapsed ? "توسيع القائمة" : "إدارة الأوليات"}>
            <ScaleMark />
          </div>
          <div className="brand-info">
            <div className="brand-name">إدارة الأوليات</div>
            <div className="brand-org">النيابة العامة</div>
          </div>
          <button
            className="sidebar-collapse-toggle"
            onClick={toggleSidebarCollapse}
            title={isSidebarCollapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"}
            aria-label={isSidebarCollapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <button className="sidebar-close" onClick={() => setMobileNav(false)} aria-label="إغلاق القائمة"><X size={18} /></button>
        </div>

        <div className="nav-section-label">مساحة العمل</div>
        <nav className="main-nav">
          {canViewDashboard && (
            <NavButton
              icon={<LayoutDashboard size={18} />}
              label={isAdmin ? "لوحة التحكم العامة" : "لوحة التوجيه والقرارات"}
              active={activeView === "dashboard"}
              onClick={() => selectView("dashboard")}
            />
          )}

          {canRegisterNew && (
            <NavButton
              icon={<FileInput size={18} />}
              label="تسجيل وارد جديد"
              active={activeView === "register"}
              onClick={() => selectView("register")}
              badge={isReception ? "إدخال ورفع" : undefined}
            />
          )}

          <NavButton
            icon={<Inbox size={18} />}
            label={isReception ? "متابعة حالة الوارد" : "صندوق الاستقبال (كل الوارد)"}
            active={activeView === "receiving"}
            onClick={() => selectView("receiving")}
            badge={isReception ? "متابعة" : undefined}
          />

          {canViewFollowup && (
            <NavButton
              icon={<Clock3 size={18} />}
              label="المتابعة والإنجاز"
              active={activeView === "followup"}
              onClick={() => selectView("followup")}
            />
          )}
        </nav>

        {isAdmin && (
          <>
            <div className="nav-section-label nav-section-spaced">إدارة النظام والتحكم</div>
            <nav className="main-nav">
              <NavButton
                icon={<UserCog size={18} />}
                label="المستخدمون والصلاحيات"
                active={activeView === "users"}
                onClick={() => selectView("users")}
              />
              <NavButton
                icon={<Settings2 size={18} />}
                label="إعدادات النظام"
                active={activeView === "settings"}
                onClick={() => selectView("settings")}
              />
              <NavButton
                icon={<Archive size={18} />}
                label="الأرشيف الإداري"
                onClick={() => {
                  setStatusFilter("archived");
                  selectView("receiving");
                }}
              />
            </nav>
          </>
        )}

        <div className="sidebar-bottom">
          <div className="security-note"><ShieldCheck size={17} /><span>بياناتك محفوظة ومشفّرة</span></div>
          <div className="profile-mini">
            <div className="avatar avatar-small">{getInitials(displayName)}</div>
            <div className="profile-copy">
              <strong>{displayName}</strong>
              <span className={`role-badge-pill badge-role-${userRole}`}>{getRoleLabel(user.role)}</span>
              <span className="role-hint-pill">{getRoleHint(user.role)}</span>
            </div>
            <button className="icon-button subtle" onClick={() => {
              try {
                localStorage.removeItem("alawliyat_token");
                sessionStorage.removeItem("alawliyat_token");
              } catch {}
              logout();
            }} aria-label="تسجيل الخروج"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      {mobileNav && <button className="mobile-overlay" onClick={() => setMobileNav(false)} aria-label="إغلاق القائمة" />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-start">
            <button className="mobile-menu icon-button" onClick={() => setMobileNav(true)} aria-label="فتح القائمة"><Menu size={20} /></button>
            <button
              className="desktop-collapse-toggle icon-button"
              onClick={toggleSidebarCollapse}
              title={isSidebarCollapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"}
              aria-label={isSidebarCollapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"}
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <div className="breadcrumb"><span>النيابة العامة</span><ChevronLeft size={15} /><strong>{viewTitle(activeView, userRole)}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className="quick-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث برقم الملف أو الموضوع..." /></div>
            {canDirectFiles && (
              <button
                className={`notification-button icon-button ${notificationsOpen ? "active" : ""}`}
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                aria-label="الإشعارات"
              >
                <Bell size={19} />
                {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
              </button>
            )}
            <div className="top-profile">
              <div className="avatar">{getInitials(displayName)}</div>
              <div className="top-profile-copy">
                <strong>{displayName}</strong>
                <span className={`role-badge-pill badge-role-${userRole}`}>{getRoleLabel(user.role)}</span>
              </div>
            </div>
          </div>
        </header>

        {notificationsOpen && <NotificationsPanel notifications={notificationsQuery.data || []} onClose={() => setNotificationsOpen(false)} onOpenFile={(id) => { setSelectedId(id); setNotificationsOpen(false); }} />}

        <div className="page-content">
          {activeView === "dashboard" && canViewDashboard && (
            <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", background: "#ffffff", padding: "12px 18px", borderRadius: "12px", border: "1px solid #e1ebe7", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#183e47" }}>حالة الاتصال والربط السحابي</h2>
                <span style={{ fontSize: "11px", color: "#607e7b" }}>مشروع Firebase: elated-pagoda-tc9s2 | قاعدة بيانات Firestore النشطة</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(true)}
                  style={{
                    background: "#fee2e2",
                    color: "#991b1b",
                    border: "1px solid #fca5a5",
                    borderRadius: "8px",
                    padding: "6px 12px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Trash2 size={13} />
                  <span>تصفير كافة المجموعات والسجلات (استعداداً للاستخدام الفعلي)</span>
                </button>
                <FirebaseStatusBadge />
              </div>
            </div>
          )}

          <SystemResetModal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} onSuccess={() => selectView("register")} />

          {canViewDashboard && (
            <DirectorQuickFilters
              files={sortedFiles}
              search={search}
              status={statusFilter}
              importance={importanceFilter}
              fileType={fileTypeFilter}
              sourceEntity={sourceEntityFilter}
              sortBy={sortBy}
              setSearch={setSearch}
              setStatus={setStatusFilter}
              setImportance={setImportanceFilter}
              setFileType={setFileTypeFilter}
              setSourceEntity={setSourceEntityFilter}
              setSortBy={setSortBy}
              clear={() => {
                setSearch("");
                setStatusFilter("");
                setImportanceFilter("");
                setFileTypeFilter("");
                setSourceEntityFilter("");
              }}
            />
          )}

          {activeView === "dashboard" && canViewDashboard && (
            <DashboardView
              stats={stats}
              files={sortedFiles}
              onOpen={(id) => setSelectedId(id)}
              onRefresh={() => {
                filesQuery.refetch();
                statsQuery.refetch();
              }}
              isAdmin={isAdmin}
            />
          )}

          {activeView === "register" && canRegisterNew && (
            <RegisterView
              inline
              files={sortedFiles}
              onOpen={(id) => setSelectedId(id)}
              onSaved={() => {
                filesQuery.refetch();
                statsQuery.refetch();
              }}
            />
          )}

          {activeView === "receiving" && (
            <FileInboxView
              files={sortedFiles}
              loading={filesQuery.isLoading}
              onOpen={(id) => setSelectedId(id)}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              importanceFilter={importanceFilter}
              setImportanceFilter={setImportanceFilter}
              fileTypeFilter={fileTypeFilter}
              setFileTypeFilter={setFileTypeFilter}
              onClear={() => {
                setStatusFilter("");
                setImportanceFilter("");
                setFileTypeFilter("");
                setSearch("");
              }}
              isReception={isReception}
              isAdmin={isAdmin}
            />
          )}

          {activeView === "followup" && canViewFollowup && (
            <FollowupView
              files={sortedFiles.filter((file) => ["directed", "in_progress", "returned"].includes(file.status))}
              onOpen={(id) => setSelectedId(id)}
            />
          )}

          {activeView === "users" && isAdmin && <UsersView />}

          {activeView === "settings" && isAdmin && (
            <AdminSettingsView stats={stats} />
          )}
        </div>
      </main>

      {selectedId && (
        <FileDetailsModal
          role={userRole}
          fileData={selectedQuery.data}
          loading={selectedQuery.isLoading}
          onClose={() => setSelectedId(null)}
          onChanged={() => {
            selectedQuery.refetch();
            filesQuery.refetch();
            statsQuery.refetch();
            if (canDirectFiles) notificationsQuery.refetch();
          }}
        />
      )}
    </div>
  );
}

function viewTitle(view: ViewKey, role?: string) {
  if (view === "dashboard") return role === "admin" ? "لوحة التحكم العامة" : "لوحة التوجيه والقرارات";
  if (view === "register") return "تسجيل وارد جديد";
  if (view === "receiving") return role === "input" ? "متابعة حالة الوارد" : "صندوق الاستقبال (كل الوارد)";
  if (view === "followup") return "المتابعة والإنجاز";
  if (view === "users") return "المستخدمون والصلاحيات";
  if (view === "settings") return "إعدادات النظام";
  return "إدارة الأوليات";
}

function NavButton({ icon, label, active, badge, onClick }: { icon: React.ReactNode; label: string; active?: boolean; badge?: string; onClick: () => void }) {
  return (
    <button
      className={`nav-button ${active ? "active" : ""}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <span className="nav-button-icon">{icon}</span>
      <span className="nav-button-text">{label}</span>
      {badge && <em>{badge}</em>}
    </button>
  );
}

function DirectorQuickFilters({ files, search, status, importance, fileType, sourceEntity, sortBy, setSearch, setStatus, setImportance, setFileType, setSourceEntity, setSortBy, clear }: { files: any[]; search: string; status: string; importance: string; fileType: string; sourceEntity: string; sortBy: string; setSearch: (value: string) => void; setStatus: (value: string) => void; setImportance: (value: string) => void; setFileType: (value: string) => void; setSourceEntity: (value: string) => void; setSortBy: (value: "date_desc" | "date_asc" | "priority") => void; clear: () => void }) {
  const rows = files.map((file) => [file.fileNumber, file.year, formatDate(file.arrivalDate), file.sourceEntity, file.subject, importanceLabels[file.importance], statusLabels[file.status], file.currentResponsible || ""]);
  const exportExcel = () => { const header = ["رقم الملف", "السنة", "تاريخ الإضافة", "جهة الورود", "الموضوع", "الأولوية", "الحالة", "المسؤول"]; const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob(["\ufeff" + csv], { type: "application/vnd.ms-excel;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "ملفات-رئيس-النيابة.xls"; link.click(); URL.revokeObjectURL(link.href); toast.success("تم تصدير القائمة بصيغة Excel"); };
  const exportPdf = () => { const printable = window.open("", "_blank", "noopener,noreferrer"); if (!printable) { toast.error("اسمح بالنوافذ المنبثقة لتصدير PDF"); return; } const serial = `PP-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`; const issueDate = new Intl.DateTimeFormat("ar-YE", { dateStyle: "full", timeStyle: "short" }).format(new Date()); const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char] || char)); printable.document.write(`<html dir="rtl"><head><title>ملفات النيابة العامة - ${serial}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#173f4d}h1{font-size:22px;margin-bottom:8px}.meta{font-size:12px;color:#56716f;margin-bottom:18px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #b8c9c6;padding:7px;text-align:right}th{background:#e5f1ed}.signature{margin-top:45px;border-top:1px solid #8ca8a2;padding-top:18px;display:flex;justify-content:space-between;min-height:105px;font-size:12px}.signature-box{width:42%;text-align:center}.line{border-bottom:1px solid #557773;height:42px;margin:0 18px 8px}.stamp{border:1px dashed #7c9c96;border-radius:50%;width:78px;height:50px;margin:-3px auto 0;padding-top:24px;color:#6c8c85;font-size:10px}</style></head><body><h1>قائمة ملفات النيابة العامة</h1><div class="meta">الرقم التسلسلي: <strong>${serial}</strong> &nbsp; | &nbsp; تاريخ الإصدار: ${escapeHtml(issueDate)} &nbsp; | &nbsp; عدد النتائج: ${files.length}</div><table><thead><tr><th>رقم الملف</th><th>التاريخ</th><th>جهة الورود</th><th>الموضوع</th><th>الأولوية</th><th>الحالة</th></tr></thead><tbody>${files.map((file) => `<tr><td>${escapeHtml(file.fileNumber)}</td><td>${escapeHtml(formatDate(file.createdAt))}</td><td>${escapeHtml(file.sourceEntity)}</td><td>${escapeHtml(file.subject)}</td><td>${escapeHtml(importanceLabels[file.importance])}</td><td>${escapeHtml(statusLabels[file.status])}</td></tr>`).join("")}</tbody></table><div class="signature"><div class="signature-box"><div>توقيع رئيس النيابة العامة</div><div class="line"></div><div>الاسم: ____________________</div></div><div class="signature-box"><div>الختم الرسمي</div><div class="stamp">ختم النيابة العامة</div></div></div><script>window.onload=()=>window.print()</script></body></html>`); printable.document.close(); };
  return <div className="director-filter-bar"><div className="director-filter-title"><SlidersHorizontal size={16} /><strong>بحث وفرز ملفات التوجيه</strong></div><div className="director-filter-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="رقم الوارد، الموضوع، الجهة أو المسؤول..." /></div><select className="sort-select type-filter" value={fileType} onChange={(event) => setFileType(event.target.value)}><option value="">كل أنواع الوارد</option><option value="وارد عام">وارد عام</option><option value="وارد مكاتبات">وارد مكاتبات</option><option value="وارد شكاوي">وارد شكاوي</option><option value="وارد رئاسي">وارد رئاسي</option><option value="وارد خاص">وارد خاص</option></select><input className="source-filter" value={sourceEntity} onChange={(event) => setSourceEntity(event.target.value)} placeholder="جهة الورود" /><button className={`filter-chip ${status === "awaiting_direction" ? "selected" : ""}`} onClick={() => setStatus(status === "awaiting_direction" ? "" : "awaiting_direction")}><Clock3 size={13} /> تحتاج توجيه</button><button className={`filter-chip ${importance === "urgent" ? "selected urgent" : ""}`} onClick={() => setImportance(importance === "urgent" ? "" : "urgent")}><Sparkles size={13} /> عاجل</button><button className={`filter-chip ${status === "in_progress" ? "selected" : ""}`} onClick={() => setStatus(status === "in_progress" ? "" : "in_progress")}><History size={13} /> قيد المتابعة</button><select className="sort-select" value={sortBy} onChange={(event) => setSortBy(event.target.value as "date_desc" | "date_asc" | "priority")}><option value="date_desc">الأحدث أولًا</option><option value="date_asc">الأقدم أولًا</option><option value="priority">الأولوية أولًا</option></select><button className="filter-chip export-chip" onClick={exportExcel}><Download size={13} /> Excel</button><button className="filter-chip export-chip" onClick={exportPdf}><Printer size={13} /> PDF</button>{(search || status || importance || fileType || sourceEntity) && <button className="filter-clear" onClick={clear}><X size={14} /> مسح</button>}</div>;
}

function ScaleMark() {
  return <div className="scale-logo" aria-label="ميزان العدل"><div className="scale-post" /><div className="scale-beam"><span /><span /></div><div className="scale-pan pan-right" /><div className="scale-pan pan-left" /><div className="scale-base" /></div>;
}

function LoadingScreen() {
  return <div className="loading-screen" dir="rtl"><div className="brand-mark"><ScaleMark /></div><div className="loading-copy"><strong>إدارة الأوليات</strong><span>جاري تجهيز مساحة العمل...</span></div><div className="loading-bar"><span /></div></div>;
}

function LoginScreen() {
  const utils = trpc.useUtils();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: ({ user, token }: any) => {
      setLoginError("");
      if (token) {
        try {
          localStorage.setItem("alawliyat_token", token);
          sessionStorage.setItem("alawliyat_token", token);
        } catch {}
      }
      utils.auth.me.setData(undefined, user);
      toast.success(user.role === "input" ? "مرحبًا بك في واجهة الإدخال والاستقبال" : "مرحبًا بك في واجهة رئيس النيابة العامة");
    },
    onError: (err) => {
      setLoginError(err.message || "اسم المستخدم أو كلمة المرور غير صحيحة. راجع البيانات وحاول مرة أخرى.");
      toast.error(err.message || "تعذر تسجيل الدخول: تحقق من اسم المستخدم وكلمة المرور");
    },
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError("");
    if (!username.trim() && !password) { setLoginError("أدخل اسم المستخدم وكلمة المرور أولًا."); toast.error("أدخل اسم المستخدم وكلمة المرور"); return; }
    if (!username.trim()) { setLoginError("اكتب اسم المستخدم في الحقل الأول."); toast.error("اسم المستخدم مطلوب"); return; }
    if (!password) { setLoginError("اكتب كلمة المرور في الحقل الثاني."); toast.error("كلمة المرور مطلوبة"); return; }
    loginMutation.mutate({ username, password });
  };
  return <div className="login-screen" dir="rtl"><div className="login-decor decor-one" /><div className="login-decor decor-two" /><form className="login-card" onSubmit={submit}><div className="brand-mark login-mark"><ScaleMark /></div><div className="eyebrow">بوابة المستخدمين المعتمدين</div><h1>إدارة الأوليات</h1><p>سجّل الدخول للوصول إلى الواجهة المخصصة لصلاحياتك.</p><div className="login-divider"><span>النيابة العامة</span></div><label className="login-field"><span>اسم المستخدم</span><div className={`login-input ${loginError && !username ? "invalid" : ""}`}><UserRound size={16} /><input value={username} onChange={(event) => { setUsername(event.target.value); setLoginError(""); }} autoComplete="username" placeholder="اكتب اسم المستخدم" /></div></label><label className="login-field"><span>كلمة المرور</span><div className={`login-input ${loginError && !password ? "invalid" : ""}`}><ShieldCheck size={16} /><input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setLoginError(""); }} autoComplete="current-password" placeholder="اكتب كلمة المرور" /></div></label>{loginError && <div className="login-error" role="alert"><X size={16} /><span>{loginError}</span></div>}<button className="primary-button login-button" type="submit" disabled={loginMutation.isPending}>{loginMutation.isPending ? <><RefreshCw size={17} className="spin" /> جارٍ التحقق...</> : <><UserRound size={18} /> دخول آمن</>}</button><div style={{ marginTop: "12px", padding: "10px", background: "rgba(22, 59, 80, 0.05)", borderRadius: "8px", border: "1px dashed #b8c9c6", textAlign: "right" }}><div style={{ fontSize: "12px", color: "#365363", fontWeight: 600, marginBottom: "8px" }}>حسابات تجريبية سريعة (كلمة المرور: 12345678):</div><div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}><button type="button" className="outline-button small" onClick={() => { setUsername("director"); setPassword("12345678"); }}>رئيس النيابة (director)</button><button type="button" className="outline-button small" onClick={() => { setUsername("reception"); setPassword("12345678"); }}>موظف الاستقبال (reception)</button><button type="button" className="outline-button small" onClick={() => { setUsername("admin"); setPassword("12345678"); }}>مدير النظام (admin)</button></div></div><small>سيتم فتح واجهة الإدخال والاستقبال أو واجهة رئيس النيابة حسب الحساب.</small></form><div className="login-footer">الجمهورية اليمنية · النيابة العامة</div></div>;
}

interface PriorityModalConfig {
  level: "urgent" | "important" | "normal";
  title: string;
  subtitle: string;
}

function PriorityDetailsModal({
  config,
  files,
  onClose,
  onOpenFile,
}: {
  config: PriorityModalConfig;
  files: any[];
  onClose: () => void;
  onOpenFile: (id: number) => void;
}) {
  const filteredFiles = useMemo(() => {
    return files.filter((f) => f.importance === config.level);
  }, [files, config.level]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card priority-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="priority-modal-header">
          <div className="priority-modal-title-group">
            <div className={`priority-modal-badge ${config.level}`}>
              {config.level === "urgent" && <AlertTriangle size={22} />}
              {config.level === "important" && <FilePenLine size={22} />}
              {config.level === "normal" && <FileText size={22} />}
            </div>
            <div>
              <h2>{config.title}</h2>
              <span>{config.subtitle}</span>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} title="إغلاق النافذة">
            <X size={19} />
          </button>
        </div>

        <div className="priority-modal-body">
          <div className="priority-filter-indicator">
            <span>
              عرض الملفات الواردة المصنفة بمستوى: <strong>{importanceLabels[config.level]}</strong>
            </span>
            <span>
              إجمالي النتائج: <strong>{filteredFiles.length.toLocaleString("ar-YE")} ملف</strong>
            </span>
          </div>

          {filteredFiles.length === 0 ? (
            <div className="priority-empty-state">
              <div className="priority-empty-icon">
                <Check size={26} />
              </div>
              <strong>لا توجد ملفات واردة بهذا المستوى حالياً</strong>
              <span>جميع المعاملات مصنفة وموزعة على المستويات الأخرى.</span>
            </div>
          ) : (
            <div className="priority-files-list">
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  className="priority-file-item"
                  onClick={() => {
                    onClose();
                    onOpenFile(file.id);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      onClose();
                      onOpenFile(file.id);
                    }
                  }}
                >
                  <div className="priority-file-info">
                    <span className="priority-file-num-tag">{file.fileNumber}</span>
                    <div className="priority-file-texts">
                      <strong>{file.subject}</strong>
                      <div className="priority-file-meta">
                        <span>
                          <b>الجهة:</b> {file.sourceEntity}
                        </span>
                        <span>•</span>
                        <span>
                          <b>النوع:</b> {file.fileType}
                        </span>
                        <span>•</span>
                        <span>
                          <b>تاريخ الورود:</b> {formatDate(file.arrivalDate)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="priority-file-end">
                    <span className={`status-badge ${statusColors[file.status]}`}>
                      {statusLabels[file.status] || file.status}
                    </span>
                    <ChevronLeft size={18} className="priority-file-arrow" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DatabasePrioritiesStatusWidget({ stats, files, onOpen }: { stats: any; files: any[]; onOpen: (id: number) => void }) {
  const [selectedPriority, setSelectedPriority] = useState<PriorityModalConfig | null>(null);

  const urgentCount = stats?.urgent ?? files.filter((f) => f.importance === "urgent").length;
  const importantCount = files.filter((f) => f.importance === "important").length;
  const normalCount = files.filter((f) => f.importance === "normal").length;

  const dbEngine = stats?.dbEngine || "MySQL / Drizzle ORM";
  const sourceName = stats?.source || "قاعدة بيانات علائقية متصلة";
  const isConnected = stats?.isConnectedToExternalDb ?? true;

  return (
    <>
      <section className="db-status-widget" id="db-status-widget" aria-label="حالة قاعدة البيانات وموجز أولويات الوارد">
        <div className="db-status-header">
          <div className="db-status-title-group">
            <div className="db-status-icon-box">
              <Database size={20} />
            </div>
            <div>
              <h2>حالة الربط وموجز أولويات الوارد (Database Overview)</h2>
              <div className="db-status-meta">
                <span className="db-badge-connected">
                  <span className="db-badge-pulse" />
                  {isConnected ? "متصل بقاعدة البيانات" : "نمط التخزين النشط"}
                </span>
                <span>•</span>
                <span><strong>المحرك:</strong> {dbEngine}</span>
                <span>•</span>
                <span>{sourceName}</span>
              </div>
            </div>
          </div>
          <div className="db-status-actions">
            <span className="db-sync-time">
              اضغط على أي أولوية لعرض قائمة المعاملات المرتبطة بها
            </span>
          </div>
        </div>

        <div className="db-priorities-grid">
          <button
            type="button"
            className="db-priority-card urgent"
            id="priority-card-urgent"
            onClick={() =>
              setSelectedPriority({
                level: "urgent",
                title: "معاملات الأولوية العاجلة جدًا",
                subtitle: "قائمة الملفات والطلبات التي تتطلب بتًا وتوجيهًا عاجلًا وفوريًا",
              })
            }
            title="انقر لعرض الملفات العاجلة"
          >
            <div className="db-priority-info">
              <div className="db-priority-icon">
                <AlertTriangle size={18} />
              </div>
              <div>
                <strong>أولوية عاجلة جدًا</strong>
                <span>تتطلب بت وتوجيه فوري من رئيس النيابة</span>
              </div>
            </div>
            <div className="db-priority-side">
              <div className="db-priority-count">{urgentCount.toLocaleString("ar-YE")}</div>
              <ChevronLeft size={16} className="db-priority-arrow" />
            </div>
          </button>

          <button
            type="button"
            className="db-priority-card important"
            id="priority-card-important"
            onClick={() =>
              setSelectedPriority({
                level: "important",
                title: "معاملات الأولوية الهامة",
                subtitle: "مراسلات وقضايا ذات مسار متابعة وأهمية خاصة",
              })
            }
            title="انقر لعرض الملفات الهامة"
          >
            <div className="db-priority-info">
              <div className="db-priority-icon">
                <FilePenLine size={18} />
              </div>
              <div>
                <strong>أولوية هامة</strong>
                <span>مراسلات وقضايا ذات مسار متابعة</span>
              </div>
            </div>
            <div className="db-priority-side">
              <div className="db-priority-count">{importantCount.toLocaleString("ar-YE")}</div>
              <ChevronLeft size={16} className="db-priority-arrow" />
            </div>
          </button>

          <button
            type="button"
            className="db-priority-card normal"
            id="priority-card-normal"
            onClick={() =>
              setSelectedPriority({
                level: "normal",
                title: "معاملات الأولوية الاعتيادية",
                subtitle: "معاملات ومذكرات روتينية ومجدولة وفق الإجراءات القياسية",
              })
            }
            title="انقر لعرض الملفات الاعتيادية"
          >
            <div className="db-priority-info">
              <div className="db-priority-icon">
                <FileText size={18} />
              </div>
              <div>
                <strong>أولوية اعتيادية</strong>
                <span>معاملات ومذكرات روتينية ومجدولة</span>
              </div>
            </div>
            <div className="db-priority-side">
              <div className="db-priority-count">{normalCount.toLocaleString("ar-YE")}</div>
              <ChevronLeft size={16} className="db-priority-arrow" />
            </div>
          </button>
        </div>
      </section>

      {selectedPriority && (
        <PriorityDetailsModal
          config={selectedPriority}
          files={files}
          onClose={() => setSelectedPriority(null)}
          onOpenFile={(id) => onOpen(id)}
        />
      )}
    </>
  );
}

function DashboardView({ stats, files, onOpen, onRefresh, isAdmin }: { stats: any; files: any[]; onOpen: (id: number) => void; onRefresh: () => void; isAdmin?: boolean }) {
  const typeEntries = Object.entries(stats.byType || {}) as [string, number][];
  const maxTypeCount = Math.max(1, ...typeEntries.map(([, count]) => count));
  return <>
    <section className="welcome-row"><div><div className="eyebrow">الأحد، 14 سبتمبر 2026</div><h1>مرحبًا بك في لوحة العمل</h1><p>تابع حركة الأوليات واعرف ما يحتاج إلى قرارك الآن.</p></div><div className="welcome-actions"><button className="outline-button" onClick={onRefresh}><RefreshCw size={16} /> تحديث</button></div></section>
    {isAdmin && <DatabasePrioritiesStatusWidget stats={stats} files={files} onOpen={onOpen} />}
    <section className="stat-grid"><StatCard icon={<FileText />} label="إجمالي الملفات" value={stats.total} hint="كل السجلات" tone="navy" /><StatCard icon={<FilePenLine />} label="بانتظار توجيهك" value={stats.awaiting} hint="تحتاج إلى قرار" tone="amber" /><StatCard icon={<Clock3 />} label="قيد المتابعة" value={stats.inProgress} hint="ملفات موجّهة" tone="purple" /><StatCard icon={<Check />} label="مكتملة" value={stats.completed} hint="هذا الشهر" tone="green" /></section>
    <section className="panel type-chart-panel"><div className="panel-heading"><div><h2>حجم العمل حسب نوع الوارد</h2><span>إجمالي الملفات المسجلة لكل نوع وارد</span></div><BarChart3 size={20} className="heading-icon" /></div>{typeEntries.length === 0 ? <div className="chart-empty">لا توجد بيانات وارد حتى الآن</div> : <div className="type-chart">{typeEntries.map(([type, count]) => <div className="type-chart-row" key={type}><div className="type-chart-label"><strong>{type}</strong><span>{count.toLocaleString("ar-YE")} ملف</span></div><div className="type-chart-track"><span style={{ width: `${Math.max(8, (count / maxTypeCount) * 100)}%` }} /></div></div>)}</div>}</section>
    <section className="dashboard-grid"><div className="panel recent-panel"><div className="panel-heading"><div><h2>آخر الملفات الواردة</h2><span>تظهر هنا أحدث السجلات المضافة للنظام</span></div><button className="text-button" onClick={() => onOpen(files[0]?.id)}>عرض الكل <ChevronLeft size={15} /></button></div>{files.length === 0 ? <div className="empty-state"><div className="empty-icon"><Inbox size={26} /></div><strong>لا توجد ملفات مسجلة بعد</strong><span>ستظهر الملفات الجديدة هنا بعد تسجيلها من موظف الإدخال والاستقبال.</span></div> : <div className="file-list">{files.slice(0, 5).map((file) => <FileRow key={file.id} file={file} onOpen={onOpen} />)}</div>}</div><div className="panel attention-panel"><div className="panel-heading"><div><h2>يحتاج انتباهك</h2><span>ملفات ذات أولوية مرتفعة</span></div><Sparkles size={20} className="heading-icon" /></div>{stats.urgent === 0 ? <div className="attention-empty"><div className="soft-icon"><Check size={20} /></div><strong>لا توجد ملفات عاجلة</strong><span>كل شيء تحت السيطرة حاليًا</span></div> : files.filter((file) => file.importance === "urgent").slice(0, 3).map((file) => <button className="attention-item" key={file.id} onClick={() => onOpen(file.id)}><div className="attention-dot" /><div><strong>{file.fileNumber}</strong><span>{file.subject}</span></div><ChevronLeft size={16} /></button>)}</div></section>
  </>;
}

function StatCard({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: number; hint: string; tone: string }) {
  return <div className={`stat-card stat-${tone}`}><div className="stat-top"><div className="stat-icon">{icon}</div><span>{hint}</span></div><strong>{value.toLocaleString("ar-YE")}</strong><label>{label}</label></div>;
}

function EmptyFiles({ onRegister }: { onRegister: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><Inbox size={26} /></div><strong>لا توجد ملفات مسجلة بعد</strong><span>ابدأ بإضافة أول ملف وارد إلى النظام.</span><button className="outline-button small" onClick={onRegister}><Plus size={15} /> تسجيل أول ملف</button></div>;
}

function FileRow({ file, onOpen }: { file: any; onOpen: (id: number) => void }) { return <button className="file-row reception-file-card" onClick={() => onOpen(file.id)}><div className="file-row-main"><div className={`file-type-icon ${file.importance === "urgent" ? "urgent" : ""}`}><FileText size={20} /></div><div className="file-row-copy"><strong>وارد رقم {file.fileNumber} <span className={`importance-tag ${importanceColors[file.importance]}`}>{importanceLabels[file.importance]}</span></strong><span className="reception-subject">{file.subject}</span><small className="reception-meta"><b>جهة الورود:</b> {file.sourceEntity} <i>·</i> <b>التاريخ:</b> {formatDate(file.arrivalDate)}</small><small className="reception-type">{file.fileType}</small></div></div><div className="file-row-end"><span className={`status-badge ${statusColors[file.status]}`}>{statusLabels[file.status]}</span><ChevronLeft size={17} /></div></button>;
}

function RegisterView({
  inline,
  onSaved,
  files = [],
  onOpen,
}: {
  inline?: boolean;
  onSaved: () => void;
  files?: any[];
  onOpen?: (id: number) => void;
}) {
  const [activeStage, setActiveStage] = useState<"stage1" | "stage2">("stage1");
  const pendingEmployeeFiles = files.filter((f) => f.status === "PENDING_EMPLOYEE");

  return (
    <div className={inline ? "register-page" : ""}>
      <div className="section-heading">
        <div>
          <div className="eyebrow">تسجيل واستقبال</div>
          <h1>{activeStage === "stage1" ? "تسجيل وارد جديد" : "قائمة الوارد بعد التوجيه"}</h1>
          <p>
            {activeStage === "stage1"
              ? "أدخل بيانات الوارد وسيتم ترحيله مباشرة إلى لوحة النائب العام للتوجيه والاعتماد."
              : "قائمة المعاملات المعتمدة من النائب العام: اختر المعاملة لاستكمال الإجراءات والترحيل النهائي."}
          </p>
        </div>
      </div>

      {/* Stage Switcher Tabs */}
      <div className="workflow-stage-nav">
        <button
          type="button"
          className={`workflow-tab-btn ${activeStage === "stage1" ? "active" : ""}`}
          onClick={() => setActiveStage("stage1")}
        >
          <FileInput size={17} />
          <span>تسجيل وارد جديد وترحيله للنائب العام</span>
        </button>

        <button
          type="button"
          className={`workflow-tab-btn ${activeStage === "stage2" ? "active" : ""}`}
          onClick={() => setActiveStage("stage2")}
        >
          <CheckCircle2 size={17} />
          <span>قائمة بعد التوجيه (استكمال الإجراءات والترحيل)</span>
          {pendingEmployeeFiles.length > 0 ? (
            <span className="workflow-tab-badge highlight">
              {pendingEmployeeFiles.length} معاملة جاهزة
            </span>
          ) : (
            <span className="workflow-tab-badge">0</span>
          )}
        </button>
      </div>

      {activeStage === "stage1" ? (
        <RegisterForm
          onSaved={() => {
            onSaved();
            // Automatically switch to the "قائمة بعد التوجيه" after completing dispatch to the AG
            setActiveStage("stage2");
          }}
        />
      ) : (
        <PendingEmployeeStageView
          files={pendingEmployeeFiles}
          onSaved={onSaved}
          onOpen={onOpen}
          onNewRegister={() => setActiveStage("stage1")}
        />
      )}
    </div>
  );
}

function PendingEmployeeStageView({
  files,
  onSaved,
  onOpen,
  onNewRegister,
}: {
  files: any[];
  onSaved: () => void;
  onOpen?: (id: number) => void;
  onNewRegister?: () => void;
}) {
  const [selectedFileId, setSelectedFileId] = useState<number | null>(files[0]?.id || null);

  useEffect(() => {
    if (files.length > 0) {
      if (!selectedFileId || !files.some((f) => f.id === selectedFileId)) {
        setSelectedFileId(files[0].id);
      }
    } else {
      setSelectedFileId(null);
    }
  }, [files, selectedFileId]);

  if (files.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <CheckCircle2 size={28} color="#16a34a" />
        </div>
        <strong>لا توجد معاملات في قائمة بعد التوجيه حالياً</strong>
        <span style={{ maxWidth: "500px", margin: "0 auto" }}>
          عندما يقوم فضيلة النائب العام بتوجيه واعتماد أي معاملة واردة إلكترونياً، ستظهر هنا فوراً في قائمة بعد التوجيه ليتم اختيارها واستكمال إجراءات تفريغ التوجيه والترحيل النهائي إلى قاعدة البيانات (COMPLETED).
        </span>
        {onNewRegister && (
          <div style={{ marginTop: "16px" }}>
            <button
              type="button"
              className="primary-button small"
              onClick={onNewRegister}
            >
              <FileInput size={15} /> تسجيل وارد جديد آخر
            </button>
          </div>
        )}
      </div>
    );
  }

  const currentSelectedFile = files.find((f) => f.id === selectedFileId) || files[0];

  return (
    <div>
      {/* قائمة اختيار الوارد بعد التوجيه */}
      <div className="pending-selection-container">
        <div className="pending-selection-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FileText size={18} color="#1c5563" />
            <strong style={{ fontSize: "13.5px", color: "#163e46" }}>
              قائمة الوارد بعد التوجيه ({files.length} معاملة جاهزة لإكمال الإجراءات)
            </strong>
          </div>
          <span style={{ fontSize: "11.5px", color: "#54756f" }}>
            اختر أي وارد من القائمة لتفريغ التوجيه وإكمال الترحيل النهائي
          </span>
        </div>

        <div className="pending-selection-grid">
          {files.map((file) => {
            const isSelected = file.id === currentSelectedFile?.id;
            return (
              <button
                type="button"
                key={file.id}
                className={`pending-selection-item ${isSelected ? "active" : ""}`}
                onClick={() => setSelectedFileId(file.id)}
              >
                <div className="pending-item-top">
                  <span className="pending-item-number">وارد رقم {file.fileNumber} ({file.year})</span>
                  <span className={`status-badge ${statusColors[file.status]}`}>{statusLabels[file.status]}</span>
                </div>
                <div className="pending-item-subject" title={file.subject}>{file.subject}</div>
                <div className="pending-item-meta">
                  <span><b>الجهة:</b> {file.sourceEntity}</span>
                  {file.signedAt && (
                    <span><Clock3 size={11} style={{ display: "inline", verticalAlign: "middle", marginLeft: "3px" }} />{formatDate(file.signedAt)}</span>
                  )}
                </div>
                {isSelected ? (
                  <div className="pending-item-selected-tag">
                    <CheckCircle2 size={13} /> المعاملة المختارة حالياً
                  </div>
                ) : (
                  <div className="pending-item-action-tag">
                    <span>اضغط للاختيار وإكمال الإجراءات ←</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {currentSelectedFile && (
        <div style={{ marginTop: "16px" }}>
          <PendingEmployeeDispatchCard
            key={currentSelectedFile.id}
            file={currentSelectedFile}
            onSaved={onSaved}
            onOpen={onOpen}
          />
        </div>
      )}
    </div>
  );
}

function PendingEmployeeDispatchCard({
  file,
  onSaved,
  onOpen,
}: {
  file: any;
  onSaved: () => void;
  onOpen?: (id: number) => void;
}) {
  const [instruction, setInstruction] = useState(file.directorInstruction || file.signedInstruction || "");
  const [department, setDepartment] = useState(file.assignedDepartment || "");
  const [employee, setEmployee] = useState(file.assignedEmployee || "");
  const [notes, setNotes] = useState(file.notes || "");
  const [pdfPreviewType, setPdfPreviewType] = useState<"original" | "signed" | null>(null);

  const dispatchMutation = trpc.files.employeeFinalDispatch.useMutation({
    onSuccess: () => {
      toast.success(`تم ترحيل المعاملة رقم ${file.fileNumber} بشكل نهائي إلى قاعدة البيانات (COMPLETED)`);
      onSaved();
    },
    onError: (error) => toast.error(error.message || "تعذر ترحيل المعاملة"),
  });

  const handleFinalDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim()) {
      toast.error("يرجى تفريغ أو إدخال نص توجيه النائب العام قبل الترحيل النهائي");
      return;
    }
    dispatchMutation.mutate({
      fileId: file.id,
      finalInstruction: instruction,
      assignedDepartment: department || undefined,
      assignedEmployee: employee || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <div className="pending-dispatch-card">
      <div className="pending-dispatch-header">
        <div className="pending-dispatch-title">
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span className={`status-badge ${statusColors[file.status]}`}>{statusLabels[file.status]}</span>
            <span className={`importance-tag ${importanceColors[file.importance]}`}>{importanceLabels[file.importance]}</span>
            <span className="reception-type">{file.fileType}</span>
          </div>
          <strong>وارد رقم {file.fileNumber} ({file.year}) — {file.subject}</strong>
          <span>
            <b>جهة الورود:</b> {file.sourceEntity} <i>·</i> <b>تاريخ الوصول:</b> {formatDate(file.arrivalDate)}
          </span>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {onOpen && (
            <button
              type="button"
              className="outline-button small"
              onClick={() => onOpen(file.id)}
            >
              <Eye size={14} /> تفاصيل الملف
            </button>
          )}
          {file.isSigned && (
            <button
              type="button"
              className="outline-button small"
              style={{ color: "#1b5e4f", borderColor: "#9ec5b8" }}
              onClick={() => setPdfPreviewType("signed")}
            >
              <Signature size={14} /> معاينة الوثيقة الموقعة (PDF)
            </button>
          )}
        </div>
      </div>

      {/* Quote card of the director's instructions & electronic signature */}
      <div className="instruction-quote-card">
        <div className="instruction-quote-header">
          <strong>
            <Signature size={16} />
            توجيه واعتماد فضيلة النائب العام للجمهورية
          </strong>
          {file.signedAt && (
            <span style={{ fontSize: "11px", color: "#8c6e26" }}>
              <Clock3 size={12} style={{ display: "inline", verticalAlign: "middle", marginLeft: "4px" }} />
              بتاريخ: {formatDateTime(file.signedAt)}
            </span>
          )}
        </div>
        <div className="instruction-quote-text">
          {file.signedInstruction || file.directorInstruction || "لا يوجد نص توجيه مدون"}
        </div>
        <div className="instruction-quote-signer">
          الموقع إلكترونياً: {file.signatureName || "فضيلة النائب العام"} — {file.signatureTitle || "النائب العام للجمهورية"}
        </div>
      </div>

      {/* Form for employee final entry and dispatch */}
      <form className="final-dispatch-form" onSubmit={handleFinalDispatch}>
        <div style={{ marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
          <CheckCircle2 size={16} color="#1b5e4f" />
          <strong style={{ fontSize: "12px", color: "#194d42" }}>
            نموذج تفريغ توجيه النائب العام والترحيل النهائي لقاعدة البيانات
          </strong>
        </div>

        <div className="form-grid">
          <Field label="تفريغ نص توجيه النائب العام (للحفظ الدائم)" required wide>
            <textarea
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="اكتب أو أكد نص توجيه النائب العام المفرّغ من الوثيقة الموقعة..."
            />
          </Field>
          <Field label="القسم / الإدارة المحال إليها">
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="مثال: إدارة التفتيش القضائي، المكتب الفني..."
            />
          </Field>
          <Field label="الموظف / العضو المختص">
            <input
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              placeholder="اسم الموظف أو العضو المكلف..."
            />
          </Field>
          <Field label="ملاحظات الترحيل النهائي" wide>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات ختامية للوارد قبل الأرشفة الدائمة..."
            />
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px", flexWrap: "wrap", gap: "10px" }}>
          <span style={{ fontSize: "11px", color: "#63837b" }}>
            <ShieldCheck size={14} style={{ display: "inline", verticalAlign: "middle", marginLeft: "4px" }} />
            الضغط على الترحيل النهائي يغير حالة المعاملة إلى (COMPLETED) ويثبتها في السجل الرسمي لقاعدة البيانات
          </span>

          <button
            type="submit"
            className="final-dispatch-btn"
            disabled={dispatchMutation.isPending}
          >
            {dispatchMutation.isPending ? (
              <>
                <RefreshCw size={15} className="spin" />
                جاري الترحيل النهائي...
              </>
            ) : (
              <>
                <CheckCircle2 size={15} />
                ترحيل نهائي إلى قاعدة البيانات (COMPLETED)
              </>
            )}
          </button>
        </div>
      </form>

      {pdfPreviewType && (
        <PdfViewerModal
          file={file}
          initialType={pdfPreviewType}
          onClose={() => setPdfPreviewType(null)}
        />
      )}
    </div>
  );
}

function RegisterModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card register-modal">
        <div className="modal-heading">
          <div>
            <h2>تسجيل وارد جديد</h2>
            <span>سيتم حفظ الملف وترحيله مباشرة للنائب العام للتوجيه والتوقيع (PENDING_AG)</span>
          </div>
          <button className="icon-button" onClick={onClose}><X size={19} /></button>
        </div>
        <RegisterForm onSaved={onSaved} />
      </div>
    </div>
  );
}

function RegisterForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({
    fileNumber: "",
    year: "2026",
    arrivalDate: new Date().toISOString().slice(0, 10),
    sourceEntity: "",
    fileType: "وارد عام",
    subject: "",
    importance: "normal",
    notes: "",
  });
  const [pdf, setPdf] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const createMutation = trpc.files.create.useMutation({
    onSuccess: () => {
      toast.success("تم تسجيل الوارد وترحيله بنجاح إلى النائب العام للتوجيه والتوقيع (PENDING_AG)");
      setForm({
        fileNumber: "",
        year: "2026",
        arrivalDate: new Date().toISOString().slice(0, 10),
        sourceEntity: "",
        fileType: "وارد عام",
        subject: "",
        importance: "normal",
        notes: "",
      });
      setPdf(null);
      onSaved();
    },
    onError: (error) => toast.error(error.message || "تعذر حفظ الملف"),
  });
  const setField = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.fileNumber || !form.sourceEntity || !form.subject) {
      toast.error("أكمل رقم الملف والجهة والموضوع أولًا");
      return;
    }
    let pdfBase64: string | undefined;
    if (pdf) {
      if (pdf.size > 8 * 1024 * 1024) {
        toast.error("الحد الأقصى للمرفق 8 ميجابايت");
        return;
      }
      pdfBase64 = await readFileAsBase64(pdf);
    }
    createMutation.mutate({
      ...form,
      fileType: form.fileType as "وارد عام" | "وارد مكاتبات" | "وارد شكاوي" | "وارد رئاسي" | "وارد خاص",
      year: Number(form.year),
      importance: form.importance as "normal" | "important" | "urgent",
      pdfBase64,
      pdfName: pdf?.name,
      pdfMimeType: pdf?.type || "application/pdf",
    });
  };

  return (
    <form className="form-card" onSubmit={submit}>
      <div style={{ background: "#fdf8ee", border: "1px solid #f6e0b5", borderRadius: "8px", padding: "12px 14px", marginBottom: "18px", display: "flex", alignItems: "center", gap: "10px" }}>
        <Clock3 size={20} color="#b45309" />
        <div>
          <strong style={{ color: "#92400e", fontSize: "12.5px", display: "block" }}>
            المرحلة الأولى: تسجيل الوارد وترحيله إلى النائب العام
          </strong>
          <span style={{ color: "#78350f", fontSize: "11.5px" }}>
            بمجرد إدخال البيانات ورفع المرفق والضغط على حفظ، سيتم تسجيل المعاملة تلقائياً بحالة (PENDING_AG) وإحالتها إلى لوحة النائب العام للتوجيه والتوقيع.
          </span>
        </div>
      </div>

      <div className="form-section-title">
        <span className="number-chip">١</span>
        <div>
          <h3>بيانات الوارد الأساسية</h3>
          <span>المعلومات التي ستظهر للنائب العام أثناء المراجعة والتوجيه</span>
        </div>
      </div>
      <div className="form-grid">
        <Field label="رقم الوارد" required>
          <input value={form.fileNumber} onChange={(e) => setField("fileNumber", e.target.value)} placeholder="مثال: ١٢٣ / ٢٠٢٦" />
        </Field>
        <Field label="السنة" required>
          <input type="number" value={form.year} onChange={(e) => setField("year", e.target.value)} />
        </Field>
        <Field label="تاريخ الوصول" required>
          <input type="date" value={form.arrivalDate} onChange={(e) => setField("arrivalDate", e.target.value)} />
        </Field>
        <Field label="جهة الورود" required>
          <input value={form.sourceEntity} onChange={(e) => setField("sourceEntity", e.target.value)} placeholder="اسم الجهة أو المؤسسة" />
        </Field>
        <Field label="موضوع الوارد (العنوان)" required wide>
          <input
            value={form.subject}
            onChange={(e) => setField("subject", e.target.value)}
            placeholder="اكتب موضوع أو عنوان الوارد بوضوح (مثال: شكوى المواطن، مذكرة إيضاحية، كتاب دوري، طلب...)"
          />
        </Field>

        {/* عرض التصنيف المقترح تلقائياً بناءً على الكلمات المفتاحية في العنوان */}
        <AutoClassificationBanner
          subject={form.subject}
          currentFileType={form.fileType}
          currentImportance={form.importance}
          onApply={(suggestedType, suggestedImportance) => {
            setForm((prev) => ({
              ...prev,
              fileType: suggestedType,
              ...(suggestedImportance ? { importance: suggestedImportance } : {}),
            }));
            toast.success(`تم تطبيق التصنيف المقترح: ${suggestedType}`);
          }}
        />

        <Field label="نوع الوارد" required wide>
          <select value={form.fileType} onChange={(e) => setField("fileType", e.target.value)}>
            <option value="">اختر نوع الوارد</option>
            <option value="وارد عام">١ ـ وارد عام</option>
            <option value="وارد مكاتبات">٢ ـ وارد مكاتبات</option>
            <option value="وارد شكاوي">٣ ـ وارد شكاوي</option>
            <option value="وارد رئاسي">٤ ـ وارد رئاسي</option>
            <option value="وارد خاص">٥ ـ وارد خاص</option>
          </select>
        </Field>
      </div>
      <div className="form-section-title form-section-second">
        <span className="number-chip">٢</span>
        <div>
          <h3>الأهمية والمرفقات</h3>
          <span>المستند الأصلي لتمكين النائب العام من المراجعة والتوقيع الإلكتروني</span>
        </div>
      </div>
      <div className="form-grid">
        <Field label="مستوى الأهمية" wide>
          <div className="importance-picker">
            {Object.entries(importanceLabels).map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={`importance-option ${form.importance === key ? "selected" : ""} ${importanceColors[key]}`}
                onClick={() => setField("importance", key)}
              >
                <span className="importance-radio" />
                <strong>{label}</strong>
                <small>{key === "urgent" ? "يتطلب إجراءً سريعًا" : key === "important" ? "أولوية متابعة" : "معالجة اعتيادية"}</small>
              </button>
            ))}
          </div>
        </Field>
        <Field label="الملف الأصلي PDF (المرفق)" wide>
          <div className={`upload-box ${pdf ? "has-file" : ""}`} onClick={() => inputRef.current?.click()}>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => setPdf(e.target.files?.[0] || null)} />
            {pdf ? (
              <>
                <div className="upload-file-icon"><FileCheck2 size={20} /></div>
                <div>
                  <strong>{pdf.name}</strong>
                  <span>{(pdf.size / 1024 / 1024).toFixed(2)} ميجابايت · جاهز للرفع والترحيل</span>
                </div>
                <button type="button" className="remove-file" onClick={(e) => { e.stopPropagation(); setPdf(null); }}>
                  <X size={15} />
                </button>
              </>
            ) : (
              <>
                <div className="upload-icon"><ArrowDownToLine size={20} /></div>
                <div>
                  <strong>اسحب ملف PDF هنا أو اضغط للاختيار</strong>
                  <span>يتم حفظ النسخة الأصلية للنائب العام ليقوم بالتوجيه والتوقيع عليها</span>
                </div>
              </>
            )}
          </div>
        </Field>
        <Field label="ملاحظات أولية للموظف" wide>
          <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={3} placeholder="أي ملاحظات تفيد النائب العام عند المراجعة..." />
        </Field>
      </div>

      {/* مراجعة وعرض التصنيف المقترح للمستخدم قبل الحفظ والترحيل */}
      <PreSaveClassificationReview
        subject={form.subject}
        selectedFileType={form.fileType}
        selectedImportance={form.importance}
        onApplySuggested={(suggestedType, suggestedImportance) => {
          setForm((prev) => ({
            ...prev,
            fileType: suggestedType,
            ...(suggestedImportance ? { importance: suggestedImportance } : {}),
          }));
          toast.success(`تم اعتماد التصنيف المقترح: ${suggestedType}`);
        }}
      />

      <div className="form-actions">
        <span className="form-hint"><ShieldCheck size={16} /> ترحيل مباشر إلى لوحة النائب العام بحالة PENDING_AG</span>
        <button type="submit" className="primary-button" disabled={createMutation.isPending}>
          {createMutation.isPending ? (
            <><RefreshCw size={16} className="spin" /> جاري الحفظ والترحيل...</>
          ) : (
            <><Send size={16} /> حفظ وترحيل إلى النائب العام (PENDING_AG)</>
          )}
        </button>
      </div>
    </form>
  );
}

function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) { return <label className={`field ${wide ? "wide" : ""}`}><span>{label}{required && <b>*</b>}</span>{children}</label>; }

function FileInboxView({
  files,
  loading,
  onOpen,
  statusFilter,
  setStatusFilter,
  importanceFilter,
  setImportanceFilter,
  fileTypeFilter,
  setFileTypeFilter,
  onClear,
  isReception,
  isAdmin,
}: {
  files: any[];
  loading: boolean;
  onOpen: (id: number) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  importanceFilter: string;
  setImportanceFilter: (v: string) => void;
  fileTypeFilter: string;
  setFileTypeFilter: (v: string) => void;
  onClear: () => void;
  isReception?: boolean;
  isAdmin?: boolean;
}) {
  const exportCsv = () => {
    const header = ["رقم الملف", "السنة", "تاريخ الوصول", "جهة الورود", "الموضوع", "الأهمية", "الحالة", "المسؤول"];
    const rows = files.map((file) => [
      file.fileNumber,
      file.year,
      formatDate(file.arrivalDate),
      file.sourceEntity,
      file.subject,
      importanceLabels[file.importance],
      statusLabels[file.status],
      file.currentResponsible || "",
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "سجل-الأوليات.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success("تم تجهيز ملف التصدير");
  };

  const awaitingCount = files.filter((f) => f.status === "awaiting_direction" || f.status === "new").length;
  const directedCount = files.filter((f) => f.status === "directed" || f.status === "in_progress").length;
  const completedCount = files.filter((f) => f.status === "completed").length;

  return (
    <>
      <div className="section-heading">
        <div>
          <div className="eyebrow">{isReception ? "متابعة مسار المعاملات" : "سجل مركزي موحد"}</div>
          <h1>{isReception ? "متابعة حالة الوارد" : "صندوق الاستقبال"}</h1>
          <p>
            {isReception
              ? "تابع حالة المعاملات المسجلة لمعرفة ما تم بشأنها من قرارات وتوجيهات لحظة بلحظة."
              : "ابحث وراجع الوارد، التعليمات، المرفقات، وسجل الحركة من مكان واحد."}
          </p>
        </div>
        <div className="heading-actions">
          <button className="outline-button" onClick={() => window.print()}>
            <Printer size={16} /> طباعة
          </button>
          {!isReception && (
            <button className="outline-button" onClick={exportCsv}>
              <Download size={16} /> تصدير
            </button>
          )}
        </div>
      </div>

      {isReception && (
        <div className="reception-kpi-row">
          <div
            className={`reception-kpi-card ${!statusFilter ? "active" : ""}`}
            onClick={() => setStatusFilter("")}
          >
            <div className="reception-kpi-info">
              <span>إجمالي المعاملات المسجلة</span>
              <strong>{files.length.toLocaleString("ar-YE")}</strong>
            </div>
            <Inbox size={22} color="#2b6cb0" />
          </div>
          <div
            className={`reception-kpi-card ${statusFilter === "awaiting_direction" ? "active" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "awaiting_direction" ? "" : "awaiting_direction")}
          >
            <div className="reception-kpi-info">
              <span>بانتظار توجيه رئيس النيابة</span>
              <strong>{awaitingCount.toLocaleString("ar-YE")}</strong>
            </div>
            <Clock3 size={22} color="#d97706" />
          </div>
          <div
            className={`reception-kpi-card ${statusFilter === "directed" ? "active" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "directed" ? "" : "directed")}
          >
            <div className="reception-kpi-info">
              <span>تم التوجيه والإحالة</span>
              <strong>{directedCount.toLocaleString("ar-YE")}</strong>
            </div>
            <Send size={22} color="#4f46e5" />
          </div>
          <div
            className={`reception-kpi-card ${statusFilter === "completed" ? "active" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "completed" ? "" : "completed")}
          >
            <div className="reception-kpi-info">
              <span>المعاملات المنجزة</span>
              <strong>{completedCount.toLocaleString("ar-YE")}</strong>
            </div>
            <CheckCircle2 size={22} color="#16a34a" />
          </div>
        </div>
      )}

      <div className="filter-bar">
        <div className="filter-label">
          <Filter size={16} /> تصفية النتائج
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">كل الحالات</option>
          {Object.entries(statusLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select value={importanceFilter} onChange={(e) => setImportanceFilter(e.target.value)}>
          <option value="">كل الأولويات</option>
          {Object.entries(importanceLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select value={fileTypeFilter} onChange={(e) => setFileTypeFilter(e.target.value)}>
          <option value="">كل أنواع الوارد</option>
          <option value="وارد عام">وارد عام</option>
          <option value="وارد مكاتبات">وارد مكاتبات</option>
          <option value="وارد شكاوي">وارد شكاوي</option>
          <option value="وارد رئاسي">وارد رئاسي</option>
          <option value="وارد خاص">وارد خاص</option>
        </select>
        {(statusFilter || importanceFilter || fileTypeFilter) && (
          <button className="clear-filter" onClick={onClear}>
            <X size={15} /> مسح التصفية
          </button>
        )}
        <span className="filter-results">{files.length.toLocaleString("ar-YE")} وارد</span>
      </div>

      <div className="panel inbox-panel">
        {loading ? (
          <div className="loading-inline">
            <RefreshCw className="spin" /> جاري تحميل الوارد...
          </div>
        ) : files.length === 0 ? (
          <EmptyFiles onRegister={() => toast.info("اختر تسجيل وارد جديد من القائمة")} />
        ) : (
          <div className="file-list large">
            {files.map((file) => (
              <FileRow key={file.id} file={file} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function FollowupView({ files, onOpen }: { files: any[]; onOpen: (id: number) => void }) {
  return <><div className="section-heading"><div><div className="eyebrow">مراقبة سير العمل</div><h1>المتابعة والإنجاز</h1><p>اعرف أين وصلت الملفات الموجّهة ومن المسؤول عن الخطوة التالية.</p></div><div className="followup-summary"><Clock3 size={17} /><strong>{files.length}</strong><span>ملف قيد المتابعة</span></div></div><div className="followup-grid">{["directed", "in_progress", "returned"].map((status) => <div className="panel followup-column" key={status}><div className="column-heading"><span className={`status-dot ${statusColors[status]}`} /><div><h2>{statusLabels[status]}</h2><span>{files.filter((file) => file.status === status).length} ملفات</span></div></div>{files.filter((file) => file.status === status).map((file) => <button className="followup-card" key={file.id} onClick={() => onOpen(file.id)}><div className="followup-card-top"><strong>{file.fileNumber}</strong><span className={`importance-tag ${importanceColors[file.importance]}`}>{importanceLabels[file.importance]}</span></div><p>{file.subject}</p><div className="followup-card-meta"><span><UserRound size={13} /> {file.currentResponsible || "غير محدد"}</span><span>{formatDate(file.updatedAt)}</span></div></button>)}{files.filter((file) => file.status === status).length === 0 && <div className="column-empty">لا توجد ملفات هنا</div>}</div>)}</div></>;
}

function NotificationsPanel({ notifications, onClose, onOpenFile }: { notifications: any[]; onClose: () => void; onOpenFile: (id: number) => void }) {
  const markRead = trpc.notifications.markRead.useMutation();
  return <div className="notifications-panel"><div className="notifications-head"><div><h3>الإشعارات</h3><span>{notifications.filter((item) => !item.readAt).length} غير مقروءة</span></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div>{notifications.length === 0 ? <div className="notification-empty"><Bell size={22} /><span>لا توجد إشعارات جديدة</span></div> : <div className="notifications-list">{notifications.slice(0, 8).map((item) => <button key={item.id} className={`notification-item ${!item.readAt ? "unread" : ""}`} onClick={() => { if (!item.readAt) markRead.mutate({ id: item.id }); if (item.fileId) onOpenFile(item.fileId); }}><div className={`notification-icon ${importanceColors[item.priority]}`}><Bell size={15} /></div><div><strong>{item.title}</strong><p>{item.body}</p><small>{formatDateTime(item.createdAt)}</small></div>{!item.readAt && <span className="unread-dot" />}</button>)}</div>}</div>;
}

function PdfViewerModal({ file: initialFile, initialType = "original", onClose }: { file: any; initialType?: "original" | "signed"; onClose: () => void }) {
  const [currentFile, setCurrentFile] = useState(initialFile);
  const [docType, setDocType] = useState<"original" | "signed">(initialFile.isSigned && initialType === "signed" ? "signed" : "original");
  const [zoom, setZoom] = useState<number>(100);
  const [manualSignOpen, setManualSignOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { user } = useAuth();
  const utils = trpc.useUtils();

  const token = typeof window !== "undefined"
    ? localStorage.getItem("alawliyat_token") || sessionStorage.getItem("alawliyat_token") || ""
    : "";

  const pdfUrl = useMemo(() => {
    const base = docType === "signed" ? `/api/files/${currentFile.id}/signed-pdf` : `/api/files/${currentFile.id}/pdf`;
    const full = token ? `${base}?token=${encodeURIComponent(token)}` : base;
    return `${full}${full.includes("?") ? "&" : "?"}v=${refreshKey}`;
  }, [currentFile.id, docType, token, refreshKey]);

  const fileName = docType === "signed"
    ? `وارد_موقّع_${currentFile.fileNumber.replace(/[\/\\]/g, "_")}.pdf`
    : (currentFile.originalFileName || `وارد_${currentFile.fileNumber.replace(/[\/\\]/g, "_")}.pdf`);

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 120 }}>
      <div className="pdf-viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pdf-viewer-header">
          <div className="pdf-viewer-title-group">
            <div className="pdf-viewer-icon">
              <FileText size={20} />
            </div>
            <div>
              <h3>معاينة الوثيقة: وارد رقم {currentFile.fileNumber}</h3>
              <span>{currentFile.subject}</span>
            </div>
          </div>

          <div className="pdf-version-tabs">
            <button
              type="button"
              className={`pdf-version-tab ${docType === "original" ? "active" : ""}`}
              onClick={() => setDocType("original")}
            >
              <FileText size={13} />
              المستند الأصلي
            </button>
            {currentFile.isSigned && (
              <button
                type="button"
                className={`pdf-version-tab ${docType === "signed" ? "active" : ""}`}
                onClick={() => setDocType("signed")}
              >
                <Signature size={13} />
                النسخة الموقّعة إلكترونياً
              </button>
            )}
          </div>

          <div className="pdf-viewer-actions">
            <button
              type="button"
              className="primary-button small"
              style={{
                background: "#1c5563",
                color: "#ffffff",
                padding: "0 12px",
                height: "30px",
                fontSize: "11px",
                fontWeight: 700,
                gap: "6px",
                display: "inline-flex",
                alignItems: "center",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
              }}
              onClick={() => setManualSignOpen(true)}
              title="أداة التوقيع اليدوي بالقلم الرقمي ولصقها مباشرة على ملف الـ PDF"
            >
              <PenTool size={14} />
              <span>توقيع يدوي ولصق على PDF</span>
            </button>
            <div style={{ display: "inline-flex", gap: "3px", background: "#e6efec", borderRadius: "6px", padding: "2px" }}>
              <button
                type="button"
                className="icon-button subtle"
                style={{ width: "28px", height: "28px" }}
                title="تكبير"
                onClick={() => setZoom((z) => Math.min(150, z + 15))}
              >
                <ZoomIn size={14} />
              </button>
              <button
                type="button"
                className="icon-button subtle"
                style={{ width: "28px", height: "28px" }}
                title="تصغير"
                onClick={() => setZoom((z) => Math.max(70, z - 15))}
              >
                <ZoomOut size={14} />
              </button>
            </div>
            <a
              href={pdfUrl}
              download={fileName}
              className="outline-button small"
              title="تحميل نسخة PDF"
            >
              <Download size={14} />
              تحميل
            </a>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="outline-button small"
              title="فتح في نافذة مستقلة"
            >
              <ExternalLink size={14} />
              نافذة جديدة
            </a>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="إغلاق المعاينة"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="pdf-frame-wrapper">
          <iframe
            key={`${pdfUrl}-${zoom}-${refreshKey}`}
            src={`${pdfUrl}#zoom=${zoom}`}
            className="pdf-iframe"
            title={`معاينة PDF - وارد ${currentFile.fileNumber}`}
          />
        </div>

        <div className="pdf-viewer-footer">
          <div className="pdf-fallback-strip">
            <ShieldCheck size={15} color="#35786b" />
            <span>
              {docType === "signed"
                ? "مستند رسمي معتمد وموقع إلكترونياً بختم وتوقيع النيابة العامة"
                : "وثيقة وارد أصلية معتمدة ومحفوظة في سجل الأوليات القضائية"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#8a9c98" }}>إذا لم يظهر المستند تلقائياً:</span>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#256d5e", fontWeight: 600, textDecoration: "underline" }}>
              اضغط هنا لفتح الملف مباشرة
            </a>
          </div>
        </div>
      </div>

      {manualSignOpen && (
        <ManualSignatureModal
          file={currentFile}
          currentUser={user}
          isOpen={manualSignOpen}
          onClose={() => setManualSignOpen(false)}
          onSuccess={(updated) => {
            setCurrentFile(updated);
            setDocType("signed");
            setRefreshKey((k) => k + 1);
            toast.success("تم لصق التوقيع اليدوي وحفظ النسخة الموقعة رسمياً بنجاح!");
            utils.files.list.invalidate();
            utils.files.get.invalidate({ id: currentFile.id });
            utils.files.stats.invalidate();
          }}
        />
      )}
    </div>
  );
}

/**
 * مكون مسار سير عمل المعاملة المرئي (Timeline)
 * يوضح المراحل الأربعة:
 * ١. مسودة / تسجيل الوارد
 * ٢. بانتظار توقيع النائب العام
 * ٣. بانتظار التوجيه وتفريغ المعاملة
 * ٤. مكتملة ومرحّلة نهائياً
 */
function TransactionWorkflowTimeline({ file }: { file: any }) {
  // Determine current step index (0 to 3) based on status and signature
  // Step 0: مسودة / قيد التسجيل
  // Step 1: بانتظار توقيع النائب العام (PENDING_AG / awaiting_direction)
  // Step 2: بانتظار التوجيه وتفريغ المعاملة (PENDING_EMPLOYEE)
  // Step 3: مكتملة ومرحّلة نهائياً (COMPLETED / completed)
  let currentStepIndex = 1;

  if (file.status === "new") {
    currentStepIndex = 0;
  } else if (file.status === "PENDING_AG" || file.status === "awaiting_direction") {
    currentStepIndex = 1;
  } else if (file.status === "PENDING_EMPLOYEE") {
    currentStepIndex = 2;
  } else if (file.status === "COMPLETED" || file.status === "completed" || file.status === "directed") {
    currentStepIndex = 3;
  }

  const steps = [
    {
      num: "١",
      title: "مسودة الوارد",
      desc: "تسجيل البيانات الأساسية للوارد ورفع المستند الأصلي المرفق",
      icon: <FileInput size={15} />,
      statusTag: currentStepIndex > 0 ? "مكتملة" : "قيد الإدخال",
      meta: file.arrivalDate ? `التسجيل: ${formatDate(file.arrivalDate)}` : undefined,
    },
    {
      num: "٢",
      title: "بانتظار توقيع النائب العام",
      desc: "مراجعة فضيلة النائب العام، صياغة التوجيه والختم بالتوقيع الإلكتروني",
      icon: <Signature size={15} />,
      statusTag: currentStepIndex > 1 ? "تم التوقيع" : currentStepIndex === 1 ? "المرحلة الحالية" : "قادمة",
      meta: file.isSigned && file.signedAt ? `تم التوقيع: ${formatDate(file.signedAt)}` : undefined,
    },
    {
      num: "٣",
      title: "بانتظار التوجيه",
      desc: "تفريغ توجيه النائب العام من قبل الموظف وتحديد جهة الإحالة والمكلف",
      icon: <FilePenLine size={15} />,
      statusTag: currentStepIndex > 2 ? "تم التفريغ" : currentStepIndex === 2 ? "المرحلة الحالية" : "قادمة",
      meta: file.directorInstruction || file.signedInstruction ? "التوجيه متوفر" : undefined,
    },
    {
      num: "٤",
      title: "مكتملة ومرحّلة",
      desc: "الترحيل النهائي والتثبيت في السجل القضائي لقاعدة البيانات (COMPLETED)",
      icon: <CheckCircle2 size={15} />,
      statusTag: currentStepIndex >= 3 ? "مكتملة نهائياً" : "بانتظار الترحيل",
      meta: currentStepIndex >= 3 ? (file.assignedDepartment ? `أحيلت: ${file.assignedDepartment}` : "محفوظة رسمياً") : undefined,
    },
  ];

  return (
    <div className="transaction-workflow-timeline-wrapper">
      <div className="transaction-workflow-header">
        <div className="transaction-workflow-header-title">
          <History size={17} color="#1c5563" />
          <strong>مسار سير عمل المعاملة (Workflow Timeline)</strong>
          <span>المراحل الإجرائية المتتابعة من الإدخال حتى الترحيل النهائي</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", color: "#61817c" }}>المرحلة الحالية:</span>
          <span className={`status-badge ${statusColors[file.status]}`}>
            {statusLabels[file.status] || file.status}
          </span>
        </div>
      </div>

      <div className="transaction-workflow-track">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentStepIndex;
          const isCurrent = idx === currentStepIndex;
          const isUpcoming = idx > currentStepIndex;
          const nodeClass = isCompleted ? "completed" : isCurrent ? "current" : "upcoming";

          return (
            <div key={step.title} className={`workflow-node-card ${nodeClass}`}>
              <div className="workflow-node-top">
                <div className="workflow-node-badge">
                  {isCompleted ? <Check size={14} /> : step.icon}
                </div>
                <span className="workflow-node-status-tag">{step.statusTag}</span>
              </div>
              <div className="workflow-node-title">
                {step.num}. {step.title}
              </div>
              <div className="workflow-node-desc">{step.desc}</div>
              {step.meta && (
                <div className="workflow-node-meta">
                  <Clock3 size={11} />
                  <span>{step.meta}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FileDetailsModal({
  fileData,
  loading,
  onClose,
  onChanged,
  role,
}: {
  fileData?: { file: any; history: any[] };
  loading: boolean;
  onClose: () => void;
  onChanged: () => void;
  role: "admin" | "director" | "input";
}) {
  const isAdmin = role === "admin";
  const isDirector = role === "director";
  const isReception = role === "input";
  const canDirect = isAdmin || isDirector;
  const { user } = useAuth();

  const [actionOpen, setActionOpen] = useState(false);
  const [adminEditOpen, setAdminEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);

  const [pdfPreviewType, setPdfPreviewType] = useState<"original" | "signed" | null>(null);
  const [manualSignOpen, setManualSignOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [department, setDepartment] = useState("");
  const [employee, setEmployee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const updateMutation = trpc.files.updateWorkflow.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ التوجيه وتحديث مسار الملف");
      setActionOpen(false);
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });

  const signMutation = trpc.files.sign.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ النسخة الموقعة مع الحفاظ على الأصل");
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });

  const confirmAndForwardMutation = trpc.files.directorConfirmAndForward.useMutation({
    onSuccess: () => {
      toast.success("تم اعتماد التوجيه والتوقيع الإلكتروني وإحالة المعاملة للموظف (المرحلة الثانية: PENDING_EMPLOYEE)");
      onChanged();
    },
    onError: (error) => toast.error(error.message || "تعذر اعتماد التوجيه"),
  });

  const employeeFinalDispatchMutation = trpc.files.employeeFinalDispatch.useMutation({
    onSuccess: () => {
      toast.success("تم تفريغ التوجيه وترحيل المعاملة بشكل نهائي إلى قاعدة البيانات (COMPLETED)");
      onChanged();
    },
    onError: (error) => toast.error(error.message || "تعذر ترحيل المعاملة"),
  });

  const adminUpdateMutation = trpc.files.adminUpdate.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ كافة التعديلات في النظام بنجاح");
      setAdminEditOpen(false);
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.files.adminDelete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الملف نهائياً من النظام");
      onClose();
      onChanged();
    },
    onError: (error: any) => toast.error(error.message),
  });

  if (loading || !fileData) {
    return (
      <div className="modal-backdrop">
        <div className="modal-card detail-modal loading-modal">
          <RefreshCw className="spin" size={26} />
          <span>جاري تحميل تفاصيل الملف...</span>
        </div>
      </div>
    );
  }

  const { file, history } = fileData;
  const token = typeof window !== "undefined" ? localStorage.getItem("alawliyat_token") || sessionStorage.getItem("alawliyat_token") || "" : "";

  const saveDirection = (status: "directed" | "in_progress" | "returned" | "completed") =>
    updateMutation.mutate({
      fileId: file.id,
      status,
      assignedDepartment: department || undefined,
      assignedEmployee: employee || undefined,
      directorInstruction: instruction || undefined,
      notes: notes || undefined,
      dueDate: dueDate || undefined,
      actionLabel: status === "directed" ? "توجيه الملف" : status === "completed" ? "اعتماد اكتمال الملف" : "تحديث حالة الملف",
    });

  return (
    <>
      <div className="modal-backdrop">
        <div className="modal-card detail-modal">
          <div className="modal-heading">
            <div>
              <div className="detail-overline">
                <span className={`status-badge ${statusColors[file.status]}`}>{statusLabels[file.status]}</span>
                <span className={`importance-tag ${importanceColors[file.importance]}`}>{importanceLabels[file.importance]}</span>
                <span className={`role-badge-pill badge-role-${role}`}>{getRoleLabel(role)}</span>
              </div>
              <h2>وارد رقم {file.fileNumber}</h2>
              <span className="detail-subject">{file.subject}</span>
            </div>
            <button className="icon-button" onClick={onClose}>
              <X size={19} />
            </button>
          </div>

          <div className="detail-scroll">
            {/* Admin Full Edit / Delete Drawer */}
            {isAdmin && (
              <div className="admin-edit-drawer">
                <div className="admin-drawer-title">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <ShieldCheck size={18} color="#991b1b" />
                    <strong>صلاحيات مدير النظام (التحكم الكامل والتعديل على أي شيء)</strong>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      className={`outline-button small ${adminEditOpen ? "active" : ""}`}
                      onClick={() => {
                        if (!adminEditOpen) {
                          setEditForm({
                            fileNumber: file.fileNumber,
                            year: file.year,
                            arrivalDate: file.arrivalDate ? new Date(file.arrivalDate).toISOString().slice(0, 10) : "",
                            sourceEntity: file.sourceEntity,
                            fileType: file.fileType,
                            subject: file.subject,
                            importance: file.importance,
                            status: file.status,
                            currentResponsible: file.currentResponsible || "",
                            assignedDepartment: file.assignedDepartment || "",
                            assignedEmployee: file.assignedEmployee || "",
                            directorInstruction: file.directorInstruction || "",
                            dueDate: file.dueDate ? new Date(file.dueDate).toISOString().slice(0, 10) : "",
                            notes: file.notes || "",
                          });
                        }
                        setAdminEditOpen(!adminEditOpen);
                      }}
                    >
                      <Pencil size={14} /> {adminEditOpen ? "إلغاء التعديل" : "تعديل شامل لبيانات الملف"}
                    </button>
                    <button
                      type="button"
                      className="danger-button small"
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      <Trash2 size={14} /> حذف الملف نهائياً
                    </button>
                  </div>
                </div>

                {deleteConfirmOpen && (
                  <div style={{ background: "#fee2e2", border: "1px solid #f87171", borderRadius: "8px", padding: "12px", marginTop: "10px" }}>
                    <p style={{ color: "#991b1b", fontWeight: 600, fontSize: "13px", marginBottom: "8px" }}>
                      تحذير أمني: هل أنت متأكد من رغبتك في حذف هذا الملف نهائياً من قاعدة البيانات مع كافة وثائقه وسجلات حركته؟
                    </p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        className="primary-button small"
                        style={{ background: "#dc2626" }}
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate({ fileId: file.id })}
                      >
                        {deleteMutation.isPending ? "جاري الحذف..." : "نعم، احذف الملف الآن"}
                      </button>
                      <button
                        type="button"
                        className="outline-button small"
                        onClick={() => setDeleteConfirmOpen(false)}
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}

                {adminEditOpen && editForm && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      adminUpdateMutation.mutate({
                        fileId: file.id,
                        ...editForm,
                        year: Number(editForm.year),
                      });
                    }}
                    style={{ marginTop: "12px", background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}
                  >
                    <div className="form-grid">
                      <Field label="رقم الوارد" required>
                        <input value={editForm.fileNumber} onChange={(e) => setEditForm({ ...editForm, fileNumber: e.target.value })} />
                      </Field>
                      <Field label="السنة" required>
                        <input type="number" value={editForm.year} onChange={(e) => setEditForm({ ...editForm, year: e.target.value })} />
                      </Field>
                      <Field label="تاريخ الوصول" required>
                        <input type="date" value={editForm.arrivalDate} onChange={(e) => setEditForm({ ...editForm, arrivalDate: e.target.value })} />
                      </Field>
                      <Field label="جهة الورود" required>
                        <input value={editForm.sourceEntity} onChange={(e) => setEditForm({ ...editForm, sourceEntity: e.target.value })} />
                      </Field>
                      <Field label="نوع الوارد" required>
                        <select value={editForm.fileType} onChange={(e) => setEditForm({ ...editForm, fileType: e.target.value })}>
                          <option value="وارد عام">وارد عام</option>
                          <option value="وارد مكاتبات">وارد مكاتبات</option>
                          <option value="وارد شكاوي">وارد شكاوي</option>
                          <option value="وارد رئاسي">وارد رئاسي</option>
                          <option value="وارد خاص">وارد خاص</option>
                        </select>
                      </Field>
                      <Field label="مستوى الأهمية" required>
                        <select value={editForm.importance} onChange={(e) => setEditForm({ ...editForm, importance: e.target.value })}>
                          <option value="normal">عادي</option>
                          <option value="important">مهم</option>
                          <option value="urgent">عاجل</option>
                        </select>
                      </Field>
                      <Field label="حالة المعاملة" required>
                        <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                          {Object.entries(statusLabels).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="المسؤول الحالي">
                        <input value={editForm.currentResponsible} onChange={(e) => setEditForm({ ...editForm, currentResponsible: e.target.value })} />
                      </Field>
                      <Field label="القسم الموجه إليه">
                        <input value={editForm.assignedDepartment} onChange={(e) => setEditForm({ ...editForm, assignedDepartment: e.target.value })} />
                      </Field>
                      <Field label="الموظف الموجه إليه">
                        <input value={editForm.assignedEmployee} onChange={(e) => setEditForm({ ...editForm, assignedEmployee: e.target.value })} />
                      </Field>
                      <Field label="تاريخ الاستحقاق">
                        <input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} />
                      </Field>
                      <Field label="موضوع الوارد" required wide>
                        <input value={editForm.subject} onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })} />
                      </Field>
                      <AutoClassificationBanner
                        subject={editForm.subject}
                        currentFileType={editForm.fileType}
                        currentImportance={editForm.importance}
                        onApply={(suggestedType, suggestedImportance) => {
                          setEditForm((prev: any) => ({
                            ...prev,
                            fileType: suggestedType,
                            ...(suggestedImportance ? { importance: suggestedImportance } : {}),
                          }));
                          toast.success(`تم تحديث التصنيف إلى: ${suggestedType}`);
                        }}
                      />
                      <Field label="توجيه رئيس النيابة" wide>
                        <textarea rows={2} value={editForm.directorInstruction} onChange={(e) => setEditForm({ ...editForm, directorInstruction: e.target.value })} />
                      </Field>
                      <Field label="ملاحظات" wide>
                        <textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                      </Field>
                    </div>

                    <PreSaveClassificationReview
                      subject={editForm.subject}
                      selectedFileType={editForm.fileType}
                      selectedImportance={editForm.importance}
                      onApplySuggested={(suggestedType, suggestedImportance) => {
                        setEditForm((prev: any) => ({
                          ...prev,
                          fileType: suggestedType,
                          ...(suggestedImportance ? { importance: suggestedImportance } : {}),
                        }));
                        toast.success(`تم اعتماد التصنيف المقترح: ${suggestedType}`);
                      }}
                    />

                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "12px" }}>
                      <button type="submit" className="primary-button" disabled={adminUpdateMutation.isPending}>
                        {adminUpdateMutation.isPending ? "جاري حفظ التعديل..." : "حفظ التعديلات في النظام"}
                      </button>
                      <button type="button" className="outline-button" onClick={() => setAdminEditOpen(false)}>
                        إلغاء
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Director Notice: cannot edit core fields */}
            {isDirector && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#166534", marginBottom: "14px" }}>
                <ShieldCheck size={16} />
                <span>
                  <strong>صلاحية فضيلة رئيس النيابة العامة:</strong> الاطلاع على الوارد وتوجيهه ورفعه واعتماده بالتوقيع الإلكتروني. (لا يمكن التعديل على بيانات الإدخال الأساسية).
                </span>
              </div>
            )}

            {/* Reception Tracking Banner */}
            {isReception && (
              <div className="reception-tracking-banner">
                <div className="reception-tracking-top">
                  <div className="reception-tracking-title">
                    <Clock3 size={18} />
                    <span>حالة مسار المعاملة:</span>
                    <span className={`status-badge ${statusColors[file.status]}`}>{statusLabels[file.status]}</span>
                  </div>
                  <div className="reception-tracking-state">
                    <span>المسؤول المكلف:</span>
                    <strong>{file.currentResponsible || "بانتظار توجيه رئيس النيابة العامة"}</strong>
                  </div>
                </div>
                {file.directorInstruction ? (
                  <div style={{ fontSize: "12px", color: "#155e75", marginTop: "4px" }}>
                    <strong>توجيه رئيس النيابة:</strong> {file.directorInstruction}
                  </div>
                ) : (
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                    تم تسجيل المعاملة ورفعها إلكترونياً، وهي الآن قيد المتابعة وبانتظار صدور قرار وتوجيه رئيس النيابة العامة.
                  </div>
                )}
              </div>
            )}

            {/* مسار سير عمل المعاملة كـ Timeline مرئي يوضح الحالات الأربعة */}
            <TransactionWorkflowTimeline file={file} />

            <div className="detail-meta-grid">
              <Meta label="جهة الورود" value={file.sourceEntity} />
              <Meta label="تاريخ الوصول" value={formatDate(file.arrivalDate)} />
              <Meta label="نوع الملف" value={file.fileType} />
              <Meta label="المسؤول الحالي" value={file.currentResponsible || "لم يحدد بعد"} />
            </div>

            <div className="attachment-banner">
              <div className="attachment-symbol">
                <Paperclip size={19} />
              </div>
              <div>
                <strong>{file.originalFileName || `المستند الرسمي لوارد ${file.fileNumber}`}</strong>
                <span>
                  {file.isSigned
                    ? "نسخة أصلية محفوظة + نسخة موقعة ومختومة إلكترونياً"
                    : "وثيقة وارد رسمية معتمدة ومؤرشفة إلكترونياً"}
                </span>
              </div>
              <div className="attachment-actions">
                <button
                  type="button"
                  className="primary-button small"
                  onClick={() => setPdfPreviewType("original")}
                >
                  <Eye size={14} /> عرض الأصل (PDF)
                </button>
                {file.isSigned && (
                  <button
                    type="button"
                    className="primary-button small"
                    style={{ background: "#226756" }}
                    onClick={() => setPdfPreviewType("signed")}
                  >
                    <Signature size={14} /> عرض الموقّع
                  </button>
                )}
                <button
                  type="button"
                  className="primary-button small"
                  style={{ background: "#0f3d64", gap: "5px" }}
                  onClick={() => setManualSignOpen(true)}
                  title="أداة التوقيع اليدوي بالقلم ولصقها مباشرة على ملف PDF"
                >
                  <PenTool size={14} /> توقيع يدوي على PDF
                </button>
                <a
                  href={`/api/files/${file.id}/pdf${token ? `?token=${encodeURIComponent(token)}` : ""}`}
                  download={file.originalFileName || `وارد_${file.fileNumber.replace(/[\/\\]/g, "_")}.pdf`}
                  className="outline-button small"
                  title="تحميل نسخة PDF"
                >
                  <Download size={14} /> تحميل
                </a>
              </div>
            </div>

            {/* معاينة الورقة الأولى من المستند المرفق مع التوقيع الآلي */}
            <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "18px", marginTop: "16px", marginBottom: "16px", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", paddingBottom: "10px", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#0f3d64", fontWeight: 700, fontSize: "14px" }}>
                  <FileText size={18} />
                  <span>معاينة الورقة الأولى من المستند المرفق (الصفحة الرسمية والاعتماد الآلي)</span>
                </div>
                <span style={{ fontSize: "11px", background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", padding: "3px 10px", borderRadius: "20px", fontWeight: 600 }}>
                  ✓ مُوقّع ومختوم آلياً على الصفحة الأولى
                </span>
              </div>

              <div
                onClick={() => setPdfPreviewType(file.isSigned ? "signed" : "original")}
                style={{
                  background: "#f8fafc",
                  border: "1px dashed #94a3b8",
                  borderRadius: "10px",
                  padding: "20px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                title="انقر لفتح المعاينة الكاملة"
              >
                <div style={{ maxWidth: "600px", margin: "0 auto", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "24px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
                  <div style={{ textAlign: "center", borderBottom: "2px solid #0f3d64", paddingBottom: "12px", marginBottom: "16px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f3d64" }}>الجمهورية اليمنية · النيابة العامة</div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>مكتب رئيس النيابة العامة | إدارة الأوليات والمكاتبات</div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "12px", marginBottom: "14px", background: "#f8fafc", padding: "10px", borderRadius: "6px" }}>
                    <div><strong>رقم الوارد:</strong> {file.fileNumber}</div>
                    <div><strong>تاريخ الوورد:</strong> {formatDate(file.arrivalDate)}</div>
                    <div><strong>جهة الورود:</strong> {file.sourceEntity}</div>
                    <div><strong>نوع المعاملة:</strong> {file.fileType}</div>
                  </div>

                  <div style={{ fontSize: "13px", color: "#1e293b", marginBottom: "16px", lineHeight: 1.6 }}>
                    <strong>موضوع المعاملة:</strong> {file.subject}
                  </div>

                  <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "14px", marginTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#047857" }}>التوقيع والختم الإلكتروني (الصفحة الأولى):</div>
                      <div style={{ color: "#334155" }}>{file.signatureName || "فضيلة القاضي / رئيس النيابة العامة"} - {file.signatureTitle || "رئيس النيابة العامة"}</div>
                    </div>
                    <div style={{ border: "1px dashed #047857", borderRadius: "6px", padding: "6px 12px", color: "#047857", fontWeight: 700, fontSize: "11px", background: "#ecfdf5" }}>
                      ختم الاعتماد الرسمي
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "center", marginTop: "10px", fontSize: "11px", color: "#64748b" }}>
                  (انقر هنا لعرض المستند PDF بالكامل مع كافة الصفحات والصفحة الموقعة)
                </div>
              </div>
            </div>

            {file.directorInstruction && (
              <div className="instruction-box">
                <div className="instruction-heading">
                  <Send size={17} />
                  <strong>تعليمات رئيس النيابة العامة</strong>
                </div>
                <p>{file.directorInstruction}</p>
                {file.dueDate && (
                  <span>
                    <CalendarDays size={14} /> الموعد المحدد: {formatDate(file.dueDate)}
                  </span>
                )}
              </div>
            )}

            {file.notes && (
              <div className="notes-box">
                <strong>ملاحظات</strong>
                <p>{file.notes}</p>
              </div>
            )}

            {/* Director Confirmation & Signing Card (Stage 1 -> Stage 2) */}
            {canDirect && (file.status === "PENDING_AG" || file.status === "awaiting_direction") && (
              <div style={{ background: "#f0f7f5", border: "2px solid #236959", borderRadius: "12px", padding: "18px 20px", marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#1c5563", color: "#fff", display: "grid", placeItems: "center" }}>
                      <Signature size={20} />
                    </div>
                    <div>
                      <strong style={{ fontSize: "14px", color: "#143f4a", display: "block" }}>
                        مرحلة النائب العام: اعتماد التوجيه والتوقيع الإلكتروني
                      </strong>
                      <span style={{ fontSize: "12px", color: "#4f726a" }}>
                        التوقيع والاعتماد يختم المستند رسمياً ويحيل المعاملة فوراً للموظف في المرحلة الثانية بحالة (PENDING_EMPLOYEE)
                      </span>
                    </div>
                  </div>
                  <span className="status-badge status-amber">بانتظار توجيهكم واعتمادكم</span>
                </div>

                <div className="form-grid">
                  <Field label="نص توجيه وقرار النائب العام" required wide>
                    <textarea
                      rows={3}
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      placeholder="اكتب التوجيه القضائي والقرار الصادر بشأن هذا الوارد بوضوح..."
                    />
                  </Field>
                  <Field label="القسم أو الجهة المحال إليها">
                    <input
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="مثال: إدارة التفتيش القضائي، المكتب الفني، النيابة الكلية..."
                    />
                  </Field>
                  <Field label="الموظف أو العضو المسؤول">
                    <input
                      value={employee}
                      onChange={(e) => setEmployee(e.target.value)}
                      placeholder="اسم الموظف أو عضو النيابة المكلف"
                    />
                  </Field>
                  <Field label="الموعد النهائي للإنجاز">
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </Field>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="primary-button"
                    style={{ background: "#0f3d64", gap: "8px" }}
                    onClick={() => setManualSignOpen(true)}
                    title="فتح أداة التوقيع اليدوي بالقلم الرقمي ولصق التوقيع والختم مباشرة على مستند الـ PDF"
                  >
                    <PenTool size={16} />
                    <span>توقيع يدوي بالقلم ولصق على PDF</span>
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    style={{ background: "#185848", gap: "8px" }}
                    disabled={confirmAndForwardMutation.isPending}
                    onClick={() => {
                      if (!instruction.trim()) {
                        toast.error("يرجى كتابة نص التوجيه القضائي أولاً");
                        return;
                      }
                      confirmAndForwardMutation.mutate({
                        fileId: file.id,
                        directorInstruction: instruction,
                        assignedDepartment: department || undefined,
                        assignedEmployee: employee || undefined,
                        dueDate: dueDate || undefined,
                      });
                    }}
                  >
                    {confirmAndForwardMutation.isPending ? (
                      <><RefreshCw size={16} className="spin" /> جاري التوقيع والترحيل للموظف...</>
                    ) : (
                      <><Signature size={16} /> توقيع واعتماد وإحالة للموظف (PENDING_EMPLOYEE)</>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Reception / Employee Final Dispatch Card (Stage 2 -> Completed) */}
            {(isReception || isAdmin) && file.status === "PENDING_EMPLOYEE" && (
              <div style={{ background: "#fbf6e8", border: "2px solid #b78a22", borderRadius: "12px", padding: "18px 20px", marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#b78a22", color: "#fff", display: "grid", placeItems: "center" }}>
                      <CheckCircle2 size={20} />
                    </div>
                    <div>
                      <strong style={{ fontSize: "14px", color: "#684f15", display: "block" }}>
                        المرحلة الثانية: تفريغ توجيه النائب العام والترحيل النهائي
                      </strong>
                      <span style={{ fontSize: "12px", color: "#7a673c" }}>
                        قام فضيلة النائب العام بالتوجيه والتوقيع الإلكتروني. يرجى تفريغ وتأكيد التوجيه ثم الضغط على "ترحيل نهائي"
                      </span>
                    </div>
                  </div>
                  <span className="status-badge status-purple">بانتظار تفريغ التوجيه</span>
                </div>

                <div className="instruction-quote-card" style={{ margin: "10px 0 16px" }}>
                  <div className="instruction-quote-header">
                    <strong><Signature size={15} /> توجيه النائب العام المعتمد</strong>
                    {file.signedAt && <span>بتاريخ: {formatDateTime(file.signedAt)}</span>}
                  </div>
                  <div className="instruction-quote-text">
                    {file.signedInstruction || file.directorInstruction || "لا يوجد نص توجيه مدون"}
                  </div>
                  <div className="instruction-quote-signer">
                    الموقع: {file.signatureName || "فضيلة النائب العام"} ({file.signatureTitle || "النائب العام للجمهورية"})
                  </div>
                </div>

                <div className="form-grid">
                  <Field label="تفريغ نص توجيه النائب العام (للتثبيت الدائم)" required wide>
                    <textarea
                      rows={3}
                      value={instruction || file.directorInstruction || file.signedInstruction || ""}
                      onChange={(e) => setInstruction(e.target.value)}
                      placeholder="أدخل نص التوجيه المفرّغ للتثبيت في قاعدة البيانات..."
                    />
                  </Field>
                  <Field label="القسم / الإدارة المحال إليها">
                    <input
                      value={department || file.assignedDepartment || ""}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="القسم أو الإدارة"
                    />
                  </Field>
                  <Field label="الموظف المكلف">
                    <input
                      value={employee || file.assignedEmployee || ""}
                      onChange={(e) => setEmployee(e.target.value)}
                      placeholder="اسم الموظف"
                    />
                  </Field>
                  <Field label="ملاحظات ختامية للترحيل" wide>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="ملاحظات الحفظ والأرشفة النهائية..."
                    />
                  </Field>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "14px" }}>
                  <button
                    type="button"
                    className="final-dispatch-btn"
                    disabled={employeeFinalDispatchMutation.isPending}
                    onClick={() => {
                      const finalInst = instruction || file.directorInstruction || file.signedInstruction || "";
                      if (!finalInst.trim()) {
                        toast.error("يرجى تفريغ نص توجيه النائب العام قبل الترحيل النهائي");
                        return;
                      }
                      employeeFinalDispatchMutation.mutate({
                        fileId: file.id,
                        finalInstruction: finalInst,
                        assignedDepartment: department || file.assignedDepartment || undefined,
                        assignedEmployee: employee || file.assignedEmployee || undefined,
                        notes: notes || undefined,
                      });
                    }}
                  >
                    {employeeFinalDispatchMutation.isPending ? (
                      <><RefreshCw size={16} className="spin" /> جاري الترحيل النهائي...</>
                    ) : (
                      <><CheckCircle2 size={16} /> ترحيل نهائي إلى قاعدة البيانات (COMPLETED)</>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Action buttons only for Admin and Director */}
            {canDirect && (
              <>
                <div className="detail-actions">
                  <button className="primary-button" onClick={() => setActionOpen(!actionOpen)}>
                    <Send size={16} /> {file.status === "awaiting_direction" ? "توجيه الملف" : "تحديث التوجيه"}
                  </button>
                  <button
                    className="outline-button"
                    onClick={() =>
                      signMutation.mutate({
                        fileId: file.id,
                        signatureName: "رئيس النيابة العامة",
                        signatureTitle: "رئيس النيابة العامة",
                        instruction: file.directorInstruction || undefined,
                      })
                    }
                    disabled={signMutation.isPending}
                  >
                    <Signature size={16} /> {file.isSigned ? "تحديث النسخة الموقعة" : "توقيع إلكتروني"}
                  </button>
                </div>
                {actionOpen && (
                  <div className="direction-form">
                    <div className="direction-title">
                      <div className="number-chip">٣</div>
                      <div>
                        <h3>توجيه ومتابعة الملف</h3>
                        <span>حدد الجهة والإجراء المطلوب</span>
                      </div>
                    </div>
                    <div className="form-grid">
                      <Field label="القسم أو الجهة الموجّه إليها">
                        <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="اكتب الجهة هنا" />
                      </Field>
                      <Field label="الموظف المسؤول">
                        <input value={employee} onChange={(e) => setEmployee(e.target.value)} placeholder="اختياري" />
                      </Field>
                      <Field label="الموعد النهائي">
                        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                      </Field>
                      <Field label="التعليمات" wide>
                        <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} placeholder="اكتب الإجراء المطلوب بوضوح..." />
                      </Field>
                      <Field label="ملاحظات إضافية" wide>
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="ملاحظات المتابعة..." />
                      </Field>
                    </div>
                    <div className="direction-actions">
                      <button className="outline-button" onClick={() => saveDirection("returned")}>
                        <ArrowDownToLine size={15} /> إعادة للمتابعة
                      </button>
                      <button className="outline-button" onClick={() => saveDirection("in_progress")}>
                        <Clock3 size={15} /> قيد التنفيذ
                      </button>
                      <button className="primary-button" onClick={() => saveDirection("directed")}>
                        <Send size={15} /> اعتماد وإرسال
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="history-section">
              <div className="history-title">
                <History size={19} />
                <div>
                  <h3>سجل حركة الوارد</h3>
                  <span>التسلسل الزمني للإجراءات والتحديثات</span>
                </div>
              </div>
              {history.length === 0 ? (
                <span className="muted">لا توجد حركات مسجلة لهذا الوارد</span>
              ) : (
                <div className="timeline">
                  {history.map((entry) => (
                    <div className="timeline-item" key={entry.id}>
                      <div className="timeline-dot" />
                      <div className="timeline-card">
                        <strong>{entry.actionType}</strong>
                        <span>{entry.details || "تم تسجيل الإجراء في النظام"}</span>
                        <small>
                          <b>بواسطة:</b> {entry.actorName} <i>·</i> <b>التاريخ:</b> {formatDateTime(entry.createdAt)}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {pdfPreviewType && (
        <PdfViewerModal
          file={file}
          initialType={pdfPreviewType}
          onClose={() => setPdfPreviewType(null)}
        />
      )}
      {manualSignOpen && (
        <ManualSignatureModal
          file={file}
          currentUser={user}
          isOpen={manualSignOpen}
          onClose={() => setManualSignOpen(false)}
          onSuccess={(_updated) => {
            toast.success("تم لصق التوقيع اليدوي بنجاح وحفظ النسخة الموقعة!");
            setPdfPreviewType("signed");
            onChanged();
          }}
        />
      )}
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function UsersView() {
  const usersQuery = trpc.users.list.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ username: "", password: "", name: "", role: "input" as "input" | "director" | "admin", email: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => {
      toast.success("تمت إضافة المستخدم بنجاح");
      setForm({ username: "", password: "", name: "", role: "input", email: "" });
      utils.users.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateMutation = trpc.users.update.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث بيانات المستخدم");
      setEditingId(null);
      setNewPassword("");
      utils.users.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.username || !form.name || !form.password) {
      toast.error("أكمل اسم المستخدم والاسم وكلمة المرور");
      return;
    }
    createMutation.mutate({ ...form, email: form.email || undefined });
  };
  const roleLabel = (role: string) => (role === "admin" ? "مدير النظام" : role === "director" ? "رئيس النيابة" : "الإدخال والاستقبال");
  return (
    <div className="users-page">
      <div className="section-heading">
        <div>
          <div className="eyebrow">التحكم والصلاحيات</div>
          <h1>المستخدمون والصلاحيات</h1>
          <p>أضف المستخدمين، غيّر أدوارهم، وأعد ضبط كلمات المرور من مكان واحد.</p>
        </div>
        <div className="users-count">
          <UserCog size={18} />
          <strong>{(usersQuery.data || []).length}</strong>
          <span>مستخدمون</span>
        </div>
      </div>
      <div className="users-grid">
        <form className="form-card user-form-card" onSubmit={submit}>
          <div className="form-section-title">
            <span className="number-chip">١</span>
            <div>
              <h3>إضافة مستخدم جديد</h3>
              <span>أنشئ حسابًا بصلاحية محددة</span>
            </div>
          </div>
          <div className="form-grid">
            <Field label="اسم المستخدم" required>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="مثال: reception" />
            </Field>
            <Field label="اسم الموظف" required>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="الاسم الكامل" />
            </Field>
            <Field label="كلمة المرور" required>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="8 أحرف على الأقل" />
            </Field>
            <Field label="البريد الإلكتروني">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="اختياري" />
            </Field>
            <Field label="الصلاحية" wide>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}>
                <option value="input">موظف الإدخال والاستقبال</option>
                <option value="director">رئيس النيابة العامة</option>
                <option value="admin">مدير النظام</option>
              </select>
            </Field>
          </div>
          <button type="submit" className="primary-button" disabled={createMutation.isPending}>
            <Plus size={16} /> {createMutation.isPending ? "جارٍ الإضافة..." : "إضافة المستخدم"}
          </button>
        </form>
        <div className="panel users-list-panel">
          <div className="panel-heading">
            <div>
              <h2>الحسابات الحالية</h2>
              <span>لا تظهر كلمات المرور لأي مستخدم</span>
            </div>
            <ShieldCheck size={20} className="heading-icon" />
          </div>
          {usersQuery.isLoading ? (
            <div className="loading-inline">
              <RefreshCw className="spin" /> جاري تحميل المستخدمين...
            </div>
          ) : (
            <div className="users-list">
              {(usersQuery.data || []).map((account) => (
                <div className="user-row" key={account.id}>
                  <div className="avatar avatar-small">{getInitials(account.name)}</div>
                  <div className="user-row-copy">
                    <strong>{account.name || account.username}</strong>
                    <span>
                      @{account.username} · {roleLabel(account.role)}
                    </span>
                  </div>
                  {editingId === account.id ? (
                    <div className="user-edit">
                      <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="كلمة مرور جديدة" />
                      <select defaultValue={account.role} onChange={(e) => updateMutation.mutate({ id: account.id, role: e.target.value as "input" | "director" | "admin" })}>
                        <option value="input">إدخال واستقبال</option>
                        <option value="director">رئيس النيابة</option>
                        <option value="admin">مدير النظام</option>
                      </select>
                      <button className="primary-button small" onClick={() => (newPassword.length >= 8 ? updateMutation.mutate({ id: account.id, password: newPassword }) : toast.error("كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل"))}>
                        حفظ كلمة المرور
                      </button>
                      <button className="icon-button" onClick={() => setEditingId(null)}>
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <button className="outline-button small" onClick={() => setEditingId(account.id)}>
                      <Settings2 size={14} /> تعديل
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminSettingsView({ stats }: { stats: any }) {
  const usersQuery = trpc.users.list.useQuery();
  const usersCount = (usersQuery.data || []).length;

  return (
    <div className="admin-settings-container">
      <div className="section-heading">
        <div>
          <div className="eyebrow">لوحة تحكم مدير النظام</div>
          <h1>إعدادات النظام والتحكم الشامل</h1>
          <p>إدارة بنية النظام، التكوين الأمني، وتوزيع الصلاحيات على المستخدمين والنيابات.</p>
        </div>
        <div className="heading-actions">
          <span className="role-badge-pill badge-role-admin">
            <ShieldCheck size={14} /> مدير النظام (كامل الصلاحيات والتعديل)
          </span>
        </div>
      </div>

      <div className="admin-settings-grid">
        <div className="admin-settings-card">
          <div className="admin-settings-card-head">
            <div className="admin-settings-icon-box" style={{ background: "#fee2e2", color: "#991b1b" }}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3>نظام الصلاحيات الثلاثي المعتمد</h3>
              <span>توزيع الصلاحيات الصارم لنيابة الاستئناف</span>
            </div>
          </div>
          <div className="admin-permission-summary">
            <div className="admin-permission-item">
              <strong>١. مدير النظام (Admin / مدير النظام)</strong>
              <span>صلاحية مطلقة على كامل التطبيق، إمكانية التعديل على أي شيء، وحذف السجلات، وإدارة الحسابات والإعدادات.</span>
            </div>
            <div className="admin-permission-item">
              <strong>٢. رئيس النيابة العامة (Director)</strong>
              <span>الاطلاع على كل الوارد، التوجيه، التوقيع، والرفع للمتابعة. محظور عليه التعديل على البيانات الأساسية ولا يظهر له إلا ما هو ضمن صلاحياته.</span>
            </div>
            <div className="admin-permission-item">
              <strong>٣. موظف الاستقبال والإدخال (Reception / إدخال)</strong>
              <span>تسجيل الوارد الجديد ورفعه ومتابعة حالته فقط، مع إخفاء كافة شاشات وأدوات الإدارة والتوجيه.</span>
            </div>
          </div>
        </div>

        <div className="admin-settings-card">
          <div className="admin-settings-card-head">
            <div className="admin-settings-icon-box" style={{ background: "#e0f2fe", color: "#0369a1" }}>
              <Server size={20} />
            </div>
            <div>
              <h3>حالة النظام وقاعدة البيانات</h3>
              <span>المعاملات المخزنة وأداء خادم النيابة</span>
            </div>
          </div>
          <div className="admin-db-stats">
            <div className="admin-stat-cell">
              <span>إجمالي الملفات المسجلة</span>
              <strong>{stats.total.toLocaleString("ar-YE")}</strong>
            </div>
            <div className="admin-stat-cell">
              <span>الحسابات والمستخدمين</span>
              <strong>{usersCount.toLocaleString("ar-YE")}</strong>
            </div>
            <div className="admin-stat-cell">
              <span>معاملات الأولوية العاجلة</span>
              <strong>{stats.urgent.toLocaleString("ar-YE")}</strong>
            </div>
            <div className="admin-stat-cell">
              <span>المعاملات المكتملة</span>
              <strong>{stats.completed.toLocaleString("ar-YE")}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

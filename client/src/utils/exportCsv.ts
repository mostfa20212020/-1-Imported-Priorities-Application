import { toast } from "sonner";

export interface CsvColumnMapping {
  key: string;
  label: string;
  formatter?: (value: any, row: any) => string;
}

/**
 * Escapes a single CSV cell value according to RFC 4180:
 * - Wrap with double quotes if contains commas, double quotes, or newlines
 * - Escape internal double quotes with double quotes ("" )
 */
export function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }

  let stringValue: string;
  if (typeof value === "object") {
    stringValue = JSON.stringify(value);
  } else {
    stringValue = String(value);
  }

  // Check if escaping is necessary
  const needsEscaping =
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n") ||
    stringValue.includes("\r");

  if (needsEscaping) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Converts an array of JSON objects to CSV string format.
 * Includes UTF-8 BOM (\uFEFF) to guarantee correct rendering of Arabic characters in Excel.
 */
export function convertJsonToCsv(
  data: Record<string, any>[],
  columns?: CsvColumnMapping[]
): string {
  if (!data || data.length === 0) {
    if (columns && columns.length > 0) {
      // Return header only with BOM
      return "\uFEFF" + columns.map((c) => escapeCsvCell(c.label)).join(",");
    }
    return "\uFEFF";
  }

  // Determine columns if not explicitly provided
  const activeColumns: CsvColumnMapping[] =
    columns ||
    Array.from(
      new Set(
        data.reduce<string[]>((acc, item) => {
          return acc.concat(Object.keys(item));
        }, [])
      )
    ).map((key) => ({ key, label: key }));

  // Header row
  const headerRow = activeColumns.map((c) => escapeCsvCell(c.label)).join(",");

  // Data rows
  const dataRows = data.map((row) => {
    return activeColumns
      .map((col) => {
        const rawValue = row[col.key];
        const formattedValue = col.formatter
          ? col.formatter(rawValue, row)
          : rawValue;
        return escapeCsvCell(formattedValue);
      })
      .join(",");
  });

  // Prepend UTF-8 BOM (\uFEFF) so Excel opens Arabic text in UTF-8 encoding
  return "\uFEFF" + [headerRow, ...dataRows].join("\r\n");
}

/**
 * Triggers a client-side download of a CSV file using Blob and an invisible anchor tag.
 */
export function downloadCsv(csvContent: string, fileName: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.setAttribute("href", url);
  link.setAttribute("download", fileName.endsWith(".csv") ? fileName : `${fileName}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Arabic label mappings for priorities/files
const statusLabels: Record<string, string> = {
  RECEIVED: "وارد جديد",
  AWAITING_DIRECTOR: "بانتظار توجيه المدير",
  DIRECTED: "تم التوجيه",
  PENDING_EMPLOYEE: "قيد المتابعة والتنفيذ",
  SIGNED: "تم التوقيع والمصادقة",
  COMPLETED: "مكتمل ومؤرشف",
};

const importanceLabels: Record<string, string> = {
  urgent: "عاجل جداً",
  important: "مهم",
  normal: "عادي",
};

export const defaultPrioritiesColumns: CsvColumnMapping[] = [
  { key: "fileNumber", label: "رقم الملف / الأولوية" },
  { key: "year", label: "السنة" },
  {
    key: "arrivalDate",
    label: "تاريخ الورود",
    formatter: (val) => {
      if (!val) return "";
      try {
        const d = new Date(val);
        return isNaN(d.getTime()) ? String(val) : d.toISOString().split("T")[0];
      } catch {
        return String(val);
      }
    },
  },
  { key: "sourceEntity", label: "جهة الورود / المصدر" },
  { key: "fileType", label: "نوع الوارد" },
  { key: "subject", label: "موضوع الأولوية" },
  {
    key: "importance",
    label: "درجة الأهمية",
    formatter: (val) => importanceLabels[val] || val || "عادي",
  },
  {
    key: "status",
    label: "حالة المعاملة",
    formatter: (val) => statusLabels[val] || val || "جديد",
  },
  { key: "assignedDepartment", label: "الإدارة / الشعبة المحال إليها" },
  { key: "assignedEmployee", label: "الموظف المختص" },
  { key: "directorInstruction", label: "توجيه وقرار المدير" },
  {
    key: "isSigned",
    label: "حالة التوقيع",
    formatter: (val) => (val ? "تم التوقيع" : "غير موقع"),
  },
  { key: "signatureName", label: "الموقع" },
  { key: "signatureTitle", label: "صفة الموقع" },
  {
    key: "dueDate",
    label: "تاريخ الاستحقاق",
    formatter: (val) => {
      if (!val) return "";
      try {
        const d = new Date(val);
        return isNaN(d.getTime()) ? String(val) : d.toISOString().split("T")[0];
      } catch {
        return String(val);
      }
    },
  },
  {
    key: "createdAt",
    label: "تاريخ القيد والتسجيل",
    formatter: (val) => {
      if (!val) return "";
      try {
        const d = new Date(val);
        return isNaN(d.getTime()) ? String(val) : d.toLocaleString("ar-OM");
      } catch {
        return String(val);
      }
    },
  },
];

/**
 * High-level helper that exports the given list of priorities/files to CSV and triggers download.
 */
export function exportPrioritiesToCsv(files: any[], customFilename?: string): boolean {
  if (!files || files.length === 0) {
    toast.warning("لا توجد ملفات أو أولويات للتصدير في القائمة الحالية.");
    return false;
  }

  try {
    const csvData = convertJsonToCsv(files, defaultPrioritiesColumns);
    const dateStr = new Date().toISOString().split("T")[0];
    const filename =
      customFilename || `قائمة_الأوليات_النيابة_العامة_${dateStr}.csv`;

    downloadCsv(csvData, filename);
    toast.success(`تم تصدير ${files.length} ملف أولوية بنجاح إلى ملف CSV (${filename})`);
    return true;
  } catch (error: any) {
    console.error("[ExportCSV] Failed to generate CSV:", error);
    toast.error(`حدث خطأ أثناء تصدير ملف CSV: ${error?.message || "خطأ غير معروف"}`);
    return false;
  }
}

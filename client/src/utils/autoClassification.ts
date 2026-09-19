/**
 * نظام التصنيف التلقائي للمعاملات الواردة بالنيابة العامة
 * يقوم بفحص الكلمات المفتاحية في عنوان/موضوع المعاملة
 * واقتراح نوع الوارد ومستوى الأهمية المناسبين بدقة وعرضها للمستخدم قبل الحفظ.
 */

export type FileType = "وارد عام" | "وارد مكاتبات" | "وارد شكاوي" | "وارد رئاسي" | "وارد خاص";
export type ImportanceType = "normal" | "important" | "urgent";

export interface ClassificationSuggestion {
  fileType: FileType;
  matchedTypeKeywords: string[];
  suggestedImportance?: ImportanceType;
  matchedImportanceKeywords?: string[];
  reason: string;
}

// قواميس الكلمات المفتاحية لكل تصنيف حسب الأسبقية والأهمية القانونية
const CLASSIFICATION_RULES: Array<{
  type: FileType;
  keywords: string[];
  priority: number;
  label: string;
}> = [
  {
    type: "وارد رئاسي",
    priority: 1,
    label: "وارد رئاسي (جهات عليا وقرارات سيادية)",
    keywords: [
      "رئاسي",
      "رئاسة",
      "فخامة",
      "مرسوم",
      "ديوان الرئاسة",
      "قرار جمهوري",
      "توجيه رئاسي",
      "مجلس القيادة",
      "رئاسة الجمهورية",
      "مكتب الرئاسة",
      "الأمانة العامة للرئاسة",
      "رئيس مجلس القيادة",
      "رئيس الجمهورية",
      "توجيهات الرئاسة",
      "الديوان الرئاسي",
    ],
  },
  {
    type: "وارد خاص",
    priority: 2,
    label: "وارد خاص (سري / أمني / قضايا حساسة)",
    keywords: [
      "سري للغاية",
      "سري جدا",
      "سري وشخصي",
      "سري",
      "خاص جدا",
      "خاص وشخصي",
      "خاص",
      "سري ومكتوم",
      "كتمان",
      "محظور",
      "أمني خاص",
      "امني خاص",
      "تحريات سرية",
      "مكتوم",
      "حساس للغاية",
      "شخصي",
      "ملف أمني",
      "أمن الدولة",
      "مكافحة الإرهاب",
    ],
  },
  {
    type: "وارد شكاوي",
    priority: 3,
    label: "وارد شكاوي (تظلمات ومظالم وبلاغات مواطنين)",
    keywords: [
      "شكوى",
      "شكاوى",
      "شكوا",
      "تظلم",
      "تظلمات",
      "مظلمة",
      "مظالم",
      "عريضة",
      "استغاثة",
      "شاكي",
      "شاكية",
      "متظلم",
      "متظلمة",
      "انصاف",
      "إنصاف",
      "انتهاك",
      "تعدي",
      "اعتداء",
      "بلاغ",
      "مطالبة برفع ضرر",
      "حبس تعسفي",
      "دعوى جزائية",
      "خصومة",
      "طعن",
      "التماس",
      "شكاية",
      "انتهاكات",
      "تجاوزات",
    ],
  },
  {
    type: "وارد مكاتبات",
    priority: 4,
    label: "وارد مكاتبات (مذكرات ومخاطبات وكتب دورية رسمية)",
    keywords: [
      "مذكرة",
      "مذكره",
      "كتاب دوري",
      "تعميم",
      "خطاب",
      "مراسلة",
      "مخاطبة",
      "إفادة",
      "افادة",
      "إشعار",
      "اشعار",
      "برقية",
      "إرسالية",
      "ارساليه",
      "مكاتبة",
      "تقرير دوري",
      "إحالة رسمية",
      "مذكرة إيضاحية",
      "إشعار وصول",
      "طلب إفادة",
      "كتاب رسمي",
      "موافاة",
      "استدراك",
      "محضر اجتماع",
    ],
  },
  {
    type: "وارد عام",
    priority: 5,
    label: "وارد عام (معاملات وطلبات عامة)",
    keywords: [
      "طلب",
      "معاملة",
      "ملف عام",
      "استفسار",
      "محضر",
      "إحصائية",
      "احصائية",
      "طلب تجديد",
      "طلب ترخيص",
      "بيان",
      "طلب عام",
      "مستندات",
      "وثائق",
      "بيانات",
      "شهادة",
    ],
  },
];

// دلالات الاستعجال والأهمية
const URGENT_KEYWORDS = [
  "عاجل جدا",
  "عاجل وفوري",
  "عاجل",
  "فوري",
  "طارئ",
  "فوراً",
  "فورا",
  "خلال 24 ساعة",
  "بصفة الاستعجال",
  "أمر قبض",
  "أمر إحضار قهري",
  "إحضار قهري",
  "ضبط وإحضار",
];

const IMPORTANT_KEYWORDS = [
  "هام جدا",
  "هام",
  "أولوية",
  "ضروري",
  "ذو أهمية قصوى",
  "مهم",
  "أهمية قصوى",
  "متابعة دورية",
];

/**
 * تحليل عنوان أو موضوع المعاملة واقتراح التصنيف المناسب
 */
export function classifySubject(subject: string): ClassificationSuggestion | null {
  if (!subject || subject.trim().length < 2) {
    return null;
  }

  // تنظيف النص وتوحيد الحروف العربية للمطابقة الدقيقة
  const normalized = normalizeArabic(subject);

  // 1. البحث في قواعد التصنيف حسب الأولوية
  let matchedType: FileType | null = null;
  let matchedTypeKeywords: string[] = [];
  let reasonText = "";

  for (const rule of CLASSIFICATION_RULES) {
    const hits: string[] = [];
    for (const kw of rule.keywords) {
      const normalizedKw = normalizeArabic(kw);
      if (normalized.includes(normalizedKw)) {
        hits.push(kw);
      }
    }

    if (hits.length > 0) {
      matchedType = rule.type;
      matchedTypeKeywords = Array.from(new Set(hits));
      reasonText = `تم رصد الكلمات المفتاحية الدالة: (${matchedTypeKeywords.map((k) => `"${k}"`).join("، ")})`;
      break;
    }
  }

  // 2. فحص مستوى الأهمية
  let suggestedImportance: ImportanceType | undefined;
  let matchedImportanceKeywords: string[] = [];

  for (const kw of URGENT_KEYWORDS) {
    if (normalized.includes(normalizeArabic(kw))) {
      matchedImportanceKeywords.push(kw);
    }
  }

  if (matchedImportanceKeywords.length > 0) {
    suggestedImportance = "urgent";
  } else {
    for (const kw of IMPORTANT_KEYWORDS) {
      if (normalized.includes(normalizeArabic(kw))) {
        matchedImportanceKeywords.push(kw);
      }
    }
    if (matchedImportanceKeywords.length > 0) {
      suggestedImportance = "important";
    }
  }

  // إذا لم نجد تصنيفاً لنوع الوارد ولم نجد أهمية، لا يوجد اقتراح
  if (!matchedType && !suggestedImportance) {
    return null;
  }

  return {
    fileType: matchedType || "وارد عام",
    matchedTypeKeywords,
    suggestedImportance,
    matchedImportanceKeywords,
    reason: reasonText || "تم اقتراح الأهمية بناءً على عبارات الاستعجال في العنوان",
  };
}

/**
 * دالة تطبيع الحروف العربية لتفادي اختلاف الهمزات والتاء المربوطة
 */
function normalizeArabic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F]/g, "") // إزالة التشكيل
    .trim();
}

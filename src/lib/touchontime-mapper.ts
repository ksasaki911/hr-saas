// =============================================================
// タッチオンタイム CSV カラムマッピング定義
// タッチオンタイム(KING OF TIME系) のCSVフォーマットに対応
// =============================================================

/**
 * 従業員マスタ用 システムフィールド定義
 */
export interface EmployeeCsvRow {
  code: string | null;           // 社員番号
  lastName: string | null;       // 姓
  firstName: string | null;      // 名
  lastNameKana: string | null;   // 姓カナ
  firstNameKana: string | null;  // 名カナ
  email: string | null;          // メール
  phone: string | null;          // 電話
  storeName: string | null;      // 所属拠点名（店舗名）
  storeCode: string | null;      // 拠点コード
  departmentName: string | null; // 部門名
  departmentCode: string | null; // 部門コード
  employmentType: string | null; // 雇用区分
  positionName: string | null;   // 役職
  hireDate: string | null;       // 入社日
  hourlyWage: string | null;     // 時給
  monthlySalary: string | null;  // 月給
}

/**
 * 勤怠実績用 システムフィールド定義
 */
export interface AttendanceCsvRow {
  employeeCode: string | null;    // 従業員コード
  employeeName: string | null;    // 氏名（姓名結合の場合）
  date: string | null;            // 日付
  clockIn: string | null;         // 出勤時刻
  clockOut: string | null;        // 退勤時刻
  breakTime: string | null;       // 休憩時間
  totalWork: string | null;       // 実働時間
  overtime: string | null;        // 残業時間
  nightOvertime: string | null;   // 深夜残業
  lateMinutes: string | null;     // 遅刻時間
  earlyLeave: string | null;      // 早退時間
  holidayWork: string | null;     // 休日出勤
  storeName: string | null;       // 拠点名
  departmentName: string | null;  // 部門名
  note: string | null;            // 備考
}

/**
 * 従業員マスタCSVの自動マッピングプリセット
 * タッチオンタイムの一般的なヘッダー名パターン
 */
export const EMPLOYEE_MAPPING_PRESETS = [
  { systemField: "code", patterns: ["従業員コード", "社員番号", "従業員番号", "スタッフコード", "社員コード", "コード", "ID"] },
  { systemField: "lastName", patterns: ["姓", "氏名（姓）", "名前（姓）", "苗字"] },
  { systemField: "firstName", patterns: ["名", "氏名（名）", "名前（名）"] },
  { systemField: "lastNameKana", patterns: ["姓（カナ）", "姓カナ", "セイ", "フリガナ（姓）"] },
  { systemField: "firstNameKana", patterns: ["名（カナ）", "名カナ", "メイ", "フリガナ（名）"] },
  { systemField: "email", patterns: ["メールアドレス", "メール", "Eメール", "email", "E-mail"] },
  { systemField: "phone", patterns: ["電話番号", "電話", "携帯番号", "TEL", "携帯"] },
  { systemField: "storeName", patterns: ["所属", "拠点", "所属拠点", "勤務地", "店舗", "店舗名", "拠点名"] },
  { systemField: "storeCode", patterns: ["拠点コード", "所属コード", "店舗コード", "勤務地コード"] },
  { systemField: "departmentName", patterns: ["部門", "部門名", "部署", "部署名", "セクション"] },
  { systemField: "departmentCode", patterns: ["部門コード", "部署コード"] },
  { systemField: "employmentType", patterns: ["雇用区分コード", "雇用区分", "給与体系コード", "給与体系", "パート区分コード", "パート区分", "雇用形態", "勤務形態", "従業員区分", "区分"] },
  { systemField: "positionName", patterns: ["役職", "職位", "ポジション", "職種"] },
  { systemField: "hireDate", patterns: ["入社日", "入社年月日", "雇用開始日", "採用日"] },
  { systemField: "hourlyWage", patterns: ["時給", "時間単価", "時給単価"] },
  { systemField: "monthlySalary", patterns: ["月給", "基本給", "月額"] },
];

/**
 * 勤怠実績CSVの自動マッピングプリセット
 */
export const ATTENDANCE_MAPPING_PRESETS = [
  { systemField: "employeeCode", patterns: ["従業員コード", "社員番号", "従業員番号", "スタッフコード", "社員コード", "コード"] },
  { systemField: "employeeName", patterns: ["氏名", "名前", "従業員名", "スタッフ名"] },
  { systemField: "date", patterns: ["日時（曜日なし）", "日付", "勤務日", "出勤日", "対象日", "年月日"] },
  { systemField: "clockIn", patterns: ["出勤時刻(時刻のみ)", "出勤時刻", "出勤", "始業", "始業時刻", "出社時刻", "出勤打刻"] },
  { systemField: "clockOut", patterns: ["退勤時刻(時刻のみ)", "退勤時刻", "退勤", "終業", "終業時刻", "退社時刻", "退勤打刻"] },
  { systemField: "breakTime", patterns: ["休憩時間", "休憩", "休憩（時間）", "控除時間"] },
  { systemField: "totalWork", patterns: ["労働合計時間", "実働", "実働時間", "労働時間", "勤務時間", "就業時間", "総労働"] },
  { systemField: "overtime", patterns: ["残業時間", "残業", "時間外", "時間外労働", "普通残業"] },
  { systemField: "nightOvertime", patterns: ["深夜残業時間", "深夜", "深夜残業", "深夜時間", "深夜勤務"] },
  { systemField: "lateMinutes", patterns: ["遅刻時間", "遅刻", "遅刻（時間）"] },
  { systemField: "earlyLeave", patterns: ["早退時間", "早退", "早退（時間）"] },
  { systemField: "holidayWork", patterns: ["休日所定時間", "休日出勤", "休日労働", "休出", "法定休日"] },
  { systemField: "storeName", patterns: ["所属名", "出勤先所属", "所属", "拠点", "拠点名", "店舗", "店舗名"] },
  { systemField: "departmentName", patterns: ["部門", "部門名", "部署"] },
  { systemField: "note", patterns: ["備考(スケジュール)", "備考", "メモ", "コメント", "注記"] },
];

/**
 * 雇用区分のマッピング（テキスト名）
 * タッチオンタイムでの表記 → システム内の EmploymentType
 */
export const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  "正社員": "FULL_TIME",
  "社員": "FULL_TIME",
  "正規": "FULL_TIME",
  "フルタイム": "FULL_TIME",
  "会長": "FULL_TIME",
  "パート": "PART_TIME",
  "パートタイム": "PART_TIME",
  "パートタイマー": "PART_TIME",
  "P": "PART_TIME",
  "アルバイト": "ARBEIT",
  "バイト": "ARBEIT",
  "A": "ARBEIT",
  "契約": "CONTRACT",
  "契約社員": "CONTRACT",
  "嘱託": "CONTRACT",
  "嘱託社員": "CONTRACT",
};

/**
 * タッチオンタイムの雇用区分コード（数値）→ システムの EmploymentType
 * ※マルエーうちや様の設定に基づく
 */
export const EMPLOYMENT_CODE_MAP: Record<string, string> = {
  // タッチオンタイム雇用区分コード（1桁）
  "1": "FULL_TIME",    // 社員（一般）
  "2": "FULL_TIME",    // 社員（一般管理職）
  "3": "FULL_TIME",    // 社員（管理職）
  "6": "PART_TIME",    // パート（時間帯なし）
  "7": "PART_TIME",    // パート（月給：特殊）
  "8": "PART_TIME",    // パート1
  "9": "PART_TIME",    // パート2
  "10": "ARBEIT",      // アルバイト
  "11": "ARBEIT",      // アルバイト（時間帯なし）
  "15": "PART_TIME",   // 鮮魚ＰＣ技術手当用
  "016": "FULL_TIME",  // 会長
  // 給与奉行 給与体系コード（4桁）
  "0001": "FULL_TIME", // 社員（一般）
  "0002": "FULL_TIME", // 社員（一般管理職）
  "0003": "FULL_TIME", // 社員（管理職）
  "0004": "PART_TIME", // パート
  "0006": "PART_TIME", // パート（時間帯なし）
  "0007": "PART_TIME", // パート（月給：特殊）
  "0011": "ARBEIT",    // アルバイト（時間帯なし）
};

/**
 * 雇用区分文字列またはコードをシステムのenum値に変換
 */
export function mapEmploymentType(raw: string | null): string {
  if (!raw) return "PART_TIME"; // デフォルト
  const normalized = raw.trim();

  // 数値コードとして完全一致（タッチオンタイムの雇用区分コード）
  if (EMPLOYMENT_CODE_MAP[normalized]) return EMPLOYMENT_CODE_MAP[normalized];

  // テキスト名として完全一致
  if (EMPLOYMENT_TYPE_MAP[normalized]) return EMPLOYMENT_TYPE_MAP[normalized];

  // テキスト名の部分一致
  for (const [key, value] of Object.entries(EMPLOYMENT_TYPE_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }

  return "PART_TIME"; // 不明な場合はパート扱い
}

/**
 * 時刻文字列を "HH:MM" 形式に正規化
 * 入力例: "9:05", "09:05", "9時5分", "0905", "9:05:00"
 */
export function normalizeTime(raw: string | null): string | null {
  if (!raw || raw.trim() === "" || raw === "-" || raw === "ー") return null;

  const s = raw.trim();

  // HH:MM:SS → HH:MM
  const hms = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hms) {
    return `${hms[1].padStart(2, "0")}:${hms[2]}`;
  }

  // HHMM
  const hhmm = s.match(/^(\d{2})(\d{2})$/);
  if (hhmm) {
    return `${hhmm[1]}:${hhmm[2]}`;
  }

  // H時M分
  const kanji = s.match(/(\d{1,2})時(\d{1,2})分?/);
  if (kanji) {
    return `${kanji[1].padStart(2, "0")}:${kanji[2].padStart(2, "0")}`;
  }

  return null;
}

/**
 * 日付文字列を Date オブジェクトに変換
 * 入力例: "2026/03/01", "2026-03-01", "2026年3月1日", "20260301"
 */
export function parseDate(raw: string | null): Date | null {
  if (!raw || raw.trim() === "") return null;

  const s = raw.trim();

  // YYYY/MM/DD or YYYY-MM-DD
  const ymd = s.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})/);
  if (ymd) {
    return new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
  }

  // YYYY年M月D日
  const kanji = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (kanji) {
    return new Date(parseInt(kanji[1]), parseInt(kanji[2]) - 1, parseInt(kanji[3]));
  }

  // YYYYMMDD
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return new Date(parseInt(compact[1]), parseInt(compact[2]) - 1, parseInt(compact[3]));
  }

  // fallback
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 時間文字列を分に変換
 *
 * タッチオンタイムのH.MM形式に対応:
 *   "8.45" → 8時間45分 → 525分（小数部は分を表す。0〜59）
 *   "0.52" → 0時間52分 → 52分
 *
 * その他の形式:
 *   "8:30" → 510分
 *   "90"   → 90分（整数は分とみなす）
 */
export function parseTimeToMinutes(raw: string | null): number {
  if (!raw || raw.trim() === "" || raw === "-" || raw === "ー") return 0;

  const s = raw.trim();

  // H:MM形式
  const hm = s.match(/^(\d{1,3}):(\d{2})$/);
  if (hm) {
    return parseInt(hm[1]) * 60 + parseInt(hm[2]);
  }

  // H.MM形式（タッチオンタイム日別データ）
  // 小数部が60未満ならH.MM（分表記）、60以上なら小数時間とみなす
  const dotMatch = s.match(/^(\d+)\.(\d+)$/);
  if (dotMatch) {
    const hours = parseInt(dotMatch[1]);
    const decimalPart = parseInt(dotMatch[2]);
    // 小数部を2桁にパディングして判定（"8.5" → "50"?）
    // タッチオンタイムは常に2桁: "8.45", "0.52"
    if (decimalPart < 60) {
      // H.MM形式: 小数部は「分」
      return hours * 60 + decimalPart;
    } else {
      // 小数時間: 1.75 → 105分
      return Math.round(parseFloat(s) * 60);
    }
  }

  // 整数（分単位とみなす）
  const minutes = parseInt(s);
  if (!isNaN(minutes)) {
    return minutes;
  }

  return 0;
}

/**
 * 金額文字列を数値に変換
 * 入力例: "1,200", "¥1200", "1200円"
 */
export function parseAmount(raw: string | null): number | null {
  if (!raw || raw.trim() === "") return null;
  const cleaned = raw.replace(/[¥￥,、円]/g, "").trim();
  const num = parseInt(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * インポートバリデーション結果
 */
export interface ImportValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    warningRows: number;
  };
}

/**
 * 従業員データのバリデーション
 */
export function validateEmployeeImport(
  rows: EmployeeCsvRow[]
): ImportValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let validCount = 0;
  let errorCount = 0;
  const codes = new Set<string>();

  rows.forEach((row, i) => {
    const lineNum = i + 2; // ヘッダー行 +1、0-indexed +1
    const rowErrors: string[] = [];

    // 必須チェック
    if (!row.code) {
      rowErrors.push(`行${lineNum}: 従業員コードが空です`);
    } else if (codes.has(row.code)) {
      // 重複は警告のみ（再インポート時はupsertで更新される）
      warnings.push(`行${lineNum}: 従業員コード「${row.code}」が重複（上書き更新されます）`);
    } else {
      codes.add(row.code);
    }

    if (!row.lastName) {
      rowErrors.push(`行${lineNum}: 姓が空です`);
    }

    // 警告
    if (!row.storeName && !row.storeCode) {
      warnings.push(`行${lineNum}: 所属(店舗)が未指定のため、デフォルト店舗に割り当てます`);
    }
    if (!row.employmentType) {
      warnings.push(`行${lineNum}: 雇用区分が未指定のため「パート」として登録します`);
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      errorCount++;
    } else {
      validCount++;
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalRows: rows.length,
      validRows: validCount,
      errorRows: errorCount,
      warningRows: warnings.length,
    },
  };
}

/**
 * 勤怠データのバリデーション
 */
export function validateAttendanceImport(
  rows: AttendanceCsvRow[]
): ImportValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let validCount = 0;
  let errorCount = 0;

  rows.forEach((row, i) => {
    const lineNum = i + 2;
    const rowErrors: string[] = [];

    if (!row.employeeCode) {
      rowErrors.push(`行${lineNum}: 従業員コードが空です`);
    }
    if (!row.date) {
      rowErrors.push(`行${lineNum}: 日付が空です`);
    } else {
      const d = parseDate(row.date);
      if (!d) rowErrors.push(`行${lineNum}: 日付「${row.date}」が不正です`);
    }

    // 出退勤がない日は欠勤扱い（警告のみ）
    if (!row.clockIn && !row.clockOut && !row.totalWork) {
      warnings.push(`行${lineNum}: 出退勤データなし（欠勤/休日の可能性）`);
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      errorCount++;
    } else {
      validCount++;
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalRows: rows.length,
      validRows: validCount,
      errorRows: errorCount,
      warningRows: warnings.length,
    },
  };
}

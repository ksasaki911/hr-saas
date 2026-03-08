// =============================================================
// 給与奉行 CSVパーサー
// 給与奉行の汎用データ出力フォーマットを解析して
// HR SaaS の取込形式に変換する
// =============================================================

// --- 社員マスタCSV パース ---
export type BugyoEmployeeRow = {
  code: string;            // 社員番号
  storeCode: string;       // 所属コード
  storeName: string;       // 所属
  positionCode: string;    // 役職コード
  positionName: string;    // 役職
  salaryTypeCode: string;  // 給与体系コード
  salaryTypeName: string;  // 給与体系
  gender: string;          // 性別
  name: string;            // 氏名
  nameKana: string;        // フリガナ
  birthDate: string;       // 生年月日
  hireDate: string;        // 入社年月日
  terminationDate: string; // 退職年月日
  baseSalary: number;      // 基本給
  managerAllowance: number; // 管理職手当
  dutyAllowance: number;   // 職務手当
  experienceAllowance: number; // 経験能力手当
  partTimePay: number;     // パート勤務分（時給）
  commutingAllowance: number; // 通勤手当
  healthInsurance: number; // 健康保険料
  careInsurance: number;   // 介護保険料
  pensionInsurance: number; // 厚生年金保険
  email: string;           // 個人用e-Mail
  jobCode: string;         // 職種コード
  jobName: string;         // 職種
  dutyCode: string;        // 職務コード
  dutyName: string;        // 職務
  partTypeCode: string;    // パート区分コード
  partTypeName: string;    // パート区分
};

// --- 給与実績CSV パース ---
export type BugyoPayrollRow = {
  code: string;            // 社員番号
  name: string;            // 氏名
  workDays: number;        // 出勤日数
  workTimeStr: string;     // 出勤時間（"218:45"形式）
  paidLeaveDays: number;   // 有休日数
  totalPayment: number;    // 総支給金額
  netPayment: number;      // 差引支給額
  commutingAllowance: number; // 通勤手当
  partTimePay: number;     // パート勤務分
  overtimeTimeStr: string; // 普通残業時間
  nightOvertimeStr: string; // 深夜残業時間
  nightWorkStr: string;    // 深夜労働時間
  holidayWorkStr: string;  // 通常休出時間
  scheduledWorkStr: string; // 就業時間
  healthInsurance: number; // 健康保険料
  careInsurance: number;   // 介護保険料
  pensionInsurance: number; // 厚生年金保険
  employmentInsurance: number; // 雇用保険料
  socialInsuranceTotal: number; // 社保合計額
  incomeTax: number;       // 所得税
  baseSalary: number;      // 基本給
  managerAllowance: number; // 管理職手当
  dutyAllowance: number;   // 職務手当
  experienceAllowance: number; // 経験能力手当
  overtimePay: number;     // 普通残業（金額）
  nightOvertimePay: number; // 深夜残業（金額）
  nightWorkPay: number;    // 深夜労働（金額）
  overtimeTotal: number;   // 残業手当
  residentTax: number;     // 住民税
  storeCode: string;       // 所属コード
  storeName: string;       // 所属
  positionCode: string;    // 役職コード
  positionName: string;    // 役職
  jobCode: string;         // 職種コード
  jobName: string;         // 職種
};

// 全角スペースを含む氏名から姓・名を分割
export function splitName(fullName: string): { lastName: string; firstName: string } {
  const trimmed = fullName.trim().replace(/"/g, "");
  // 全角スペース or 半角スペースで分割
  const parts = trimmed.split(/[\s　]+/);
  if (parts.length >= 2) {
    return { lastName: parts[0], firstName: parts.slice(1).join("") };
  }
  return { lastName: trimmed, firstName: "" };
}

// カタカナ(半角/全角)フリガナから姓・名を分割
export function splitKana(kana: string): { lastNameKana: string; firstNameKana: string } {
  const trimmed = kana.trim().replace(/"/g, "");
  const parts = trimmed.split(/[\s　]+/);
  if (parts.length >= 2) {
    return { lastNameKana: parts[0], firstNameKana: parts.slice(1).join("") };
  }
  return { lastNameKana: trimmed, firstNameKana: "" };
}

// 和暦→西暦変換
export function warekiToDate(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === "" || dateStr.trim() === '""') return null;
  const clean = dateStr.replace(/"/g, "").trim();
  if (!clean) return null;

  // "昭和37年03月18日" → Date
  const match = clean.match(/^(明治|大正|昭和|平成|令和)(\d+)年(\d+)月(\d+)日$/);
  if (!match) {
    // ISO形式ならそのまま返す
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    return null;
  }

  const eraMap: Record<string, number> = {
    "明治": 1868, "大正": 1912, "昭和": 1926, "平成": 1989, "令和": 2019,
  };
  const year = eraMap[match[1]] + Number(match[2]) - 1;
  const month = String(Number(match[3])).padStart(2, "0");
  const day = String(Number(match[4])).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 時間文字列 "218:45" → 時間(Float) 218.75
export function parseTimeStr(timeStr: string): number {
  if (!timeStr || timeStr === "0:00" || timeStr === "0.00") return 0;
  const clean = timeStr.replace(/"/g, "").trim();
  const match = clean.match(/^(\d+):(\d+)$/);
  if (match) {
    return Number(match[1]) + Number(match[2]) / 60;
  }
  return Number(clean) || 0;
}

// CSVの値をクリーンアップ
function cleanVal(val: string | undefined): string {
  if (!val) return "";
  return val.replace(/^"|"$/g, "").trim();
}

function cleanNum(val: string | undefined): number {
  if (!val) return 0;
  const clean = val.replace(/^"|"$/g, "").replace(/,/g, "").trim();
  return Number(clean) || 0;
}

// 給与体系コード → 雇用形態
export function salaryTypeToEmploymentType(code: string, positionCode: string): string {
  // 給与体系コード:
  // 0001=社員（一般）, 0002=社員（一般管理職）, 0003=社員（管理職）
  // 0004=パート, 0006=パート（時間帯なし）, 0007=パート（月給：特殊）
  // 0011=アルバイト（時間帯なし）
  if (code.startsWith("000")) return "FULL_TIME"; // 社員系
  if (code === "0011") return "ARBEIT";
  // 役職コードも確認
  if (positionCode === "011") return "CONTRACT"; // 契約社員
  return "PART_TIME"; // パート系
}

// CSVテキストを行ごとに分割（ダブルクォート対応）
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let current = "";
    let inQuote = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
        current += ch;
      } else if (ch === "," && !inQuote) {
        cols.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    cols.push(current);
    rows.push(cols);
  }
  return rows;
}

// 社員マスタCSV → BugyoEmployeeRow[]
export function parseBugyoEmployeeCsv(text: string): BugyoEmployeeRow[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];

  // ヘッダー行スキップ
  return rows.slice(1).map((cols) => ({
    code: cleanVal(cols[0]),
    storeCode: cleanVal(cols[1]),
    storeName: cleanVal(cols[2]),
    positionCode: cleanVal(cols[5]),
    positionName: cleanVal(cols[6]),
    salaryTypeCode: cleanVal(cols[7]),
    salaryTypeName: cleanVal(cols[8]),
    gender: cleanVal(cols[10]),
    name: cleanVal(cols[11]),
    nameKana: cleanVal(cols[30]),
    birthDate: cleanVal(cols[12]),
    hireDate: cleanVal(cols[13]),
    terminationDate: cleanVal(cols[14]),
    baseSalary: cleanNum(cols[15]),
    managerAllowance: cleanNum(cols[16]),
    dutyAllowance: cleanNum(cols[17]),
    experienceAllowance: cleanNum(cols[18]),
    partTimePay: cleanNum(cols[21]),
    commutingAllowance: cleanNum(cols[23]),
    healthInsurance: cleanNum(cols[25]),
    careInsurance: cleanNum(cols[26]),
    pensionInsurance: cleanNum(cols[28]),
    email: cleanVal(cols[64]) || cleanVal(cols[63]),
    jobCode: cleanVal(cols[59]),
    jobName: cleanVal(cols[60]),
    dutyCode: cleanVal(cols[61]),
    dutyName: cleanVal(cols[62]),
    partTypeCode: cleanVal(cols[67]),
    partTypeName: cleanVal(cols[68]),
  })).filter((r) => r.code); // 空行除去
}

// 給与実績CSV → BugyoPayrollRow[]
export function parseBugyoPayrollCsv(text: string): BugyoPayrollRow[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];

  return rows.slice(1).map((cols) => ({
    code: cleanVal(cols[0]),
    name: cleanVal(cols[1]),
    workDays: cleanNum(cols[2]),
    workTimeStr: cleanVal(cols[3]),
    paidLeaveDays: cleanNum(cols[4]),
    totalPayment: cleanNum(cols[14]),
    netPayment: cleanNum(cols[15]),
    commutingAllowance: cleanNum(cols[18]),
    partTimePay: cleanNum(cols[19]),
    overtimeTimeStr: cleanVal(cols[25]),
    nightOvertimeStr: cleanVal(cols[26]),
    nightWorkStr: cleanVal(cols[27]),
    holidayWorkStr: cleanVal(cols[28]),
    scheduledWorkStr: cleanVal(cols[30]),
    healthInsurance: cleanNum(cols[33]),
    careInsurance: cleanNum(cols[34]),
    pensionInsurance: cleanNum(cols[35]),
    employmentInsurance: cleanNum(cols[36]),
    socialInsuranceTotal: cleanNum(cols[37]),
    incomeTax: cleanNum(cols[38]),
    baseSalary: cleanNum(cols[39]),
    managerAllowance: cleanNum(cols[40]),
    dutyAllowance: cleanNum(cols[41]),
    experienceAllowance: cleanNum(cols[42]),
    overtimePay: cleanNum(cols[47]),
    nightOvertimePay: cleanNum(cols[48]),
    nightWorkPay: cleanNum(cols[49]),
    overtimeTotal: cleanNum(cols[50]),
    residentTax: cleanNum(cols[56]),
    storeCode: cleanVal(cols[60]),
    storeName: cleanVal(cols[61]),
    positionCode: cleanVal(cols[64]),
    positionName: cleanVal(cols[65]),
    jobCode: cleanVal(cols[66]),
    jobName: cleanVal(cols[67]),
  })).filter((r) => r.code);
}

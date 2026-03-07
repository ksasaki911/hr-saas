// =============================================================
// シフト自動生成アルゴリズム v3
// 貪欲法 + 実績プロファイル + 就業規則 + 会社カレンダー
// + スキル適合チェック + 本部応援連携
// =============================================================

// ---- 型定義 ----

export interface ShiftGenerateConfig {
  storeId: string;
  weekStartDate: string; // YYYY-MM-DD (月曜日)
  departmentFilter?: string[];
  autoAssignFullTime: boolean;
  priorityStrategy: "cost" | "balanced" | "profile";
  useAttendanceProfile: boolean;
  dryRun: boolean;
}

interface EmployeeData {
  id: string;
  code: string;
  lastName: string;
  firstName: string;
  employmentType: string;
  departmentId: string | null;
  hourlyWage: number | null;
  monthlySalary: number | null;
  maxHoursPerWeek: number | null;
  canWorkDepts: string[];
  skills: string[];
}

interface StaffingReq {
  departmentId: string;
  dayOfWeek: number;
  timeSlot: string;
  minStaff: number;
  idealStaff: number;
}

interface ShiftRequestData {
  employeeId: string;
  targetDate: Date;
  requestType: string;
  startTime: string | null;
  endTime: string | null;
}

interface ExistingShift {
  employeeId: string;
  shiftDate: Date;
  startTime: string;
  endTime: string;
}

interface LeaveData {
  employeeId: string;
  startDate: Date;
  endDate: Date;
}

interface CalendarData {
  calendarDate: Date;
  dayType: string;
  name: string | null;
}

interface EmploymentRuleData {
  employmentType: string;
  monthlyWorkDays: number | null;
  weeklyWorkDays: number | null;
  dailyWorkHours: number | null;
  weeklyMaxHours: number | null;
  maxConsecutiveDays: number | null;
  minBreakMinutes: number;
}

interface ProfileData {
  employeeId: string;
  dayOfWeekProb: number[];
  typicalStartTime: string | null;
  typicalEndTime: string | null;
  typicalBreakMin: number | null;
  avgMonthlyDays: number | null;
  confidenceScore: number;
  // v4拡張
  timeSlotProb: number[];          // 長さ4 [09-12, 12-15, 15-18, 18-22]
  dowTimeSlotProb: number[];       // 長さ28 (曜日7×時間帯4)
  preferredPatterns: string[];     // ["morning","afternoon",...]
  avgConsecutiveDays: number | null;
  typicalWeeklyHours: number | null;
  scheduleAdherence: number | null;
}

interface DeptSkillReqData {
  departmentId: string;
  skillName: string;
  isRequired: boolean;
}

interface HQSupportData {
  id: string;
  storeId: string;
  departmentId: string | null;
  supportDate: Date;
  staffName: string;
  startTime: string;
  endTime: string;
  skills: string[];
  status: string;
}

export interface GeneratedShift {
  employeeId: string;
  storeId: string;
  departmentId: string | null;
  shiftDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  status: string;
  laborCost: number | null;
  isHelpShift: boolean;
}

export interface DeptCoverage {
  departmentId: string;
  departmentName?: string;
  timeSlot: string;
  minStaff: number;
  idealStaff: number;
  assigned: number;
  status: "over" | "ideal" | "minimum" | "short";
}

export interface SkillAlert {
  departmentId: string;
  date: string;
  timeSlot: string;
  missingSkill: string;
  assignedEmployees: string[];
  severity: "critical" | "warning";
}

export interface DaySummary {
  date: string;
  dayOfWeek: number;
  dayLabel: string;
  isHoliday: boolean;
  calendarNote: string | null;
  shiftsGenerated: number;
  estimatedCost: number;
  coverage: DeptCoverage[];
  hqSupportCount: number;
}

// v4: 従業員別割当詳細
export interface EmployeeAssignmentDetail {
  employeeId: string;
  employeeName: string;
  employmentType: string;
  assignedDays: number;
  totalHours: number;
  profileMatchScore: number | null;  // プロファイル適合度 (0-100)
  requestFulfilled: number;          // 希望が通った日数
  requestTotal: number;              // 希望提出日数
}

// v4: 希望充足サマリー
export interface RequestFulfillment {
  totalRequests: number;       // 全希望件数
  preferredFulfilled: number;  // PREFERRED希望が通った件数
  availableFulfilled: number;  // AVAILABLE希望が通った件数
  unavailableRespected: number;// UNAVAILABLE回避できた件数
  fulfillmentRate: number;     // 全体充足率 (0-1)
}

export interface GenerateResult {
  shifts: GeneratedShift[];
  totalCount: number;
  totalCost: number;
  daySummaries: DaySummary[];
  warnings: string[];
  skillAlerts: SkillAlert[];
  profilesUsed: number;
  hqSupportUsed: number;
  // v4追加
  employeeDetails: EmployeeAssignmentDetail[];
  requestFulfillment: RequestFulfillment;
}

// ---- シフトパターン ----

const SHIFT_PATTERNS: Record<string, { start: string; end: string; breakMin: number }> = {
  // 正社員用（早番・中番・遅番の3交代）
  early:     { start: "07:00", end: "16:00", breakMin: 60 },  // 早番
  full:      { start: "08:00", end: "17:00", breakMin: 60 },  // 中番A
  mid:       { start: "09:00", end: "18:00", breakMin: 60 },  // 中番B
  late_full: { start: "12:00", end: "21:00", breakMin: 60 },  // 遅番
  // パート・アルバイト用
  morning:   { start: "09:00", end: "14:00", breakMin: 0 },   // 午前パート
  day:       { start: "09:00", end: "17:00", breakMin: 60 },  // 日勤パート
  afternoon: { start: "13:00", end: "18:00", breakMin: 0 },   // 午後パート
  late:      { start: "14:00", end: "22:00", breakMin: 60 },  // 遅番パート
  evening:   { start: "17:00", end: "22:00", breakMin: 0 },   // 夜パート
};

// 正社員の3交代パターン（カバレッジに応じて分散配置）
const FT_ROTATION_PATTERNS = ["early", "full", "mid", "late_full"] as const;

const TIME_SLOTS = ["09:00-12:00", "12:00-15:00", "15:00-18:00", "18:00-22:00"];

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// ---- ユーティリティ ----

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function calcWorkMinutes(start: string, end: string, breakMin: number): number {
  return parseTime(end) - parseTime(start) - breakMin;
}

function dateToStr(d: Date): string {
  // ローカルタイム(JST)で日付文字列を生成（toISOString はUTC変換で1日ずれる）
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeSlotOverlaps(slotRange: string, shiftStart: string, shiftEnd: string): boolean {
  const [slotS, slotE] = slotRange.split("-");
  const ss = parseTime(slotS);
  const se = parseTime(slotE);
  const fs = parseTime(shiftStart);
  const fe = parseTime(shiftEnd);
  return fs < se && fe > ss;
}

// スキルマッチチェック（部分一致対応）
function hasSkill(empSkills: string[], requiredSkill: string): boolean {
  return empSkills.some(
    (es) => es.includes(requiredSkill) || requiredSkill.includes(es)
  );
}

function selectShiftPattern(
  employeeType: string,
  preferredStart?: string | null,
  preferredEnd?: string | null,
  profile?: ProfileData | null,
  ruleBreakMin?: number,
  dayOfWeek?: number,
  targetTimeSlot?: string,
): { start: string; end: string; breakMin: number } {
  // 1. シフト希望が具体的にあればそれを優先
  if (preferredStart && preferredEnd) {
    const workMin = parseTime(preferredEnd) - parseTime(preferredStart);
    return {
      start: preferredStart,
      end: preferredEnd,
      breakMin: workMin > 360 ? (ruleBreakMin ?? 60) : 0,
    };
  }

  // 2. v4: 曜日×時間帯マトリクスから最適パターンを選択
  if (profile && profile.confidenceScore >= 0.3 && dayOfWeek !== undefined) {
    // 曜日×時間帯マトリクスがある場合
    if (profile.dowTimeSlotProb && profile.dowTimeSlotProb.length === 28) {
      const dowBase = dayOfWeek * 4;
      const slotProbs = [
        profile.dowTimeSlotProb[dowBase],     // 09-12
        profile.dowTimeSlotProb[dowBase + 1], // 12-15
        profile.dowTimeSlotProb[dowBase + 2], // 15-18
        profile.dowTimeSlotProb[dowBase + 3], // 18-22
      ];

      // 最も確率の高い連続スロットからパターン推定
      const maxSlot = slotProbs.indexOf(Math.max(...slotProbs));
      // preferredPatternsがあればそこから曜日に合うものを選ぶ
      if (profile.preferredPatterns && profile.preferredPatterns.length > 0) {
        // 午前系(0)、昼系(1)、午後系(2)、夜系(3)
        const slotToPatterns: Record<number, string[]> = {
          0: ["morning", "full", "day"],
          1: ["day", "afternoon", "full"],
          2: ["afternoon", "late"],
          3: ["late", "evening"],
        };
        const candidates = slotToPatterns[maxSlot] || [];
        for (const pat of candidates) {
          if (profile.preferredPatterns.includes(pat) && SHIFT_PATTERNS[pat]) {
            const p = SHIFT_PATTERNS[pat];
            const workMin = parseTime(p.end) - parseTime(p.start) - p.breakMin;
            return {
              start: p.start,
              end: p.end,
              breakMin: workMin > 360 ? (ruleBreakMin ?? p.breakMin) : p.breakMin,
            };
          }
        }
      }
    }

    // フォールバック: 従来の典型時間帯
    if (profile.typicalStartTime && profile.typicalEndTime) {
      const workMin = parseTime(profile.typicalEndTime) - parseTime(profile.typicalStartTime);
      return {
        start: profile.typicalStartTime,
        end: profile.typicalEndTime,
        breakMin: workMin > 360 ? (ruleBreakMin ?? (profile.typicalBreakMin ?? 60)) : (profile.typicalBreakMin ?? 0),
      };
    }
  }

  // 3. 正社員はフルタイム固定
  if (employeeType === "FULL_TIME") return SHIFT_PATTERNS.full;

  // 4. パート/アルバイト: カバレッジが必要な時間帯に基づいてパターンを選択
  //    targetTimeSlot が渡された場合、その時間帯をカバーするパターンを選ぶ
  if (targetTimeSlot) {
    const slotToPattern: Record<string, string> = {
      "09:00-12:00": "morning",   // 09:00-14:00
      "12:00-15:00": "day",       // 09:00-17:00
      "15:00-18:00": "afternoon", // 13:00-18:00
      "18:00-22:00": "evening",   // 17:00-22:00
    };
    const patternName = slotToPattern[targetTimeSlot];
    if (patternName && SHIFT_PATTERNS[patternName]) {
      return SHIFT_PATTERNS[patternName];
    }
  }

  // 5. デフォルト（時間帯情報なし）
  if (employeeType === "PART_TIME") return SHIFT_PATTERNS.morning;
  return SHIFT_PATTERNS.evening;
}

// ---- メイン生成関数 ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateShifts(db: any, config: ShiftGenerateConfig): Promise<GenerateResult> {
  const warnings: string[] = [];
  const skillAlerts: SkillAlert[] = [];
  const generatedShifts: GeneratedShift[] = [];

  // 対象週の日付配列 (月〜日)
  const weekDates: Date[] = [];
  const baseDate = new Date(config.weekStartDate + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    weekDates.push(d);
  }

  // ========================================
  // 1. データ読込（並列）- v3拡張版
  // ========================================
  const [
    employees, staffingReqs, shiftRequests, existingShifts,
    leaveRequests, calendarEntries, employmentRules, attendanceProfiles,
    deptSkillReqs, hqSupports,
  ] = await Promise.all([
    // 従業員: storeId/departmentFilter両方で検索し、0件なら全従業員にフォールバック
    db.employee.findMany({
      where: {
        isActive: { not: false },
      },
      select: {
        id: true, code: true, lastName: true, firstName: true,
        employmentType: true, departmentId: true, hourlyWage: true,
        monthlySalary: true, maxHoursPerWeek: true, canWorkDepts: true, skills: true,
      },
    }) as Promise<EmployeeData[]>,

    // 必要人員: departmentFilterのみ適用（storeIdはマイグレーション後のUUIDかハードコードか不定）
    db.staffingRequirement.findMany({
      where: {
        ...(config.departmentFilter?.length
          ? { departmentId: { in: config.departmentFilter } }
          : {}),
      },
      select: { departmentId: true, dayOfWeek: true, timeSlot: true, minStaff: true, idealStaff: true },
    }) as Promise<StaffingReq[]>,

    db.shiftRequest.findMany({
      where: {
        targetDate: { gte: weekDates[0], lte: weekDates[6] },
      },
      select: { employeeId: true, targetDate: true, requestType: true, startTime: true, endTime: true },
    }) as Promise<ShiftRequestData[]>,

    db.shift.findMany({
      where: {
        shiftDate: { gte: weekDates[0], lte: weekDates[6] },
      },
      select: { employeeId: true, shiftDate: true, startTime: true, endTime: true },
    }) as Promise<ExistingShift[]>,

    db.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: weekDates[6] },
        endDate: { gte: weekDates[0] },
      },
      select: { employeeId: true, startDate: true, endDate: true },
    }) as Promise<LeaveData[]>,

    db.companyCalendar.findMany({
      where: {
        calendarDate: { gte: weekDates[0], lte: weekDates[6] },
      },
      select: { calendarDate: true, dayType: true, name: true },
    }).catch(() => [] as CalendarData[]) as Promise<CalendarData[]>,

    db.employmentRule.findMany({
      where: { isActive: true },
    }).catch(() => [] as EmploymentRuleData[]) as Promise<EmploymentRuleData[]>,

    config.useAttendanceProfile
      ? (db.attendanceProfile.findMany({
          where: {},
          select: {
            employeeId: true, dayOfWeekProb: true,
            typicalStartTime: true, typicalEndTime: true, typicalBreakMin: true,
            avgMonthlyDays: true, confidenceScore: true,
            // v4拡張
            timeSlotProb: true, dowTimeSlotProb: true, preferredPatterns: true,
            avgConsecutiveDays: true, typicalWeeklyHours: true, scheduleAdherence: true,
          },
        }).catch(() => [] as ProfileData[]) as Promise<ProfileData[]>)
      : Promise.resolve([] as ProfileData[]),

    // 部門別スキル要件（v3新規）
    db.departmentSkillRequirement.findMany({
      where: {},
      select: { departmentId: true, skillName: true, isRequired: true },
    }).catch(() => [] as DeptSkillReqData[]) as Promise<DeptSkillReqData[]>,

    // 本部応援（v3新規）
    db.headquartersSupport.findMany({
      where: {
        supportDate: { gte: weekDates[0], lte: weekDates[6] },
        status: "CONFIRMED",
      },
      select: {
        id: true, storeId: true, departmentId: true, supportDate: true,
        staffName: true, startTime: true, endTime: true, skills: true, status: true,
      },
    }).catch(() => [] as HQSupportData[]) as Promise<HQSupportData[]>,
  ]);

  // ---- インデックス構築 ----

  const fullTimeEmps = employees.filter((e) => e.employmentType === "FULL_TIME");
  const partTimeEmps = employees.filter(
    (e) => e.employmentType === "PART_TIME" || e.employmentType === "ARBEIT"
  );


  const requestMap = new Map<string, ShiftRequestData>();
  for (const sr of shiftRequests) {
    const key = `${sr.employeeId}_${dateToStr(new Date(sr.targetDate))}`;
    requestMap.set(key, sr);
  }

  const existingSet = new Set<string>();
  for (const es of existingShifts) {
    existingSet.add(`${es.employeeId}_${dateToStr(new Date(es.shiftDate))}`);
  }

  const calendarMap = new Map<string, CalendarData>();
  for (const ce of calendarEntries) {
    calendarMap.set(dateToStr(new Date(ce.calendarDate)), ce);
  }

  const ruleMap = new Map<string, EmploymentRuleData>();
  for (const rule of employmentRules) {
    ruleMap.set(rule.employmentType, rule);
  }

  const profileMap = new Map<string, ProfileData>();
  for (const prof of attendanceProfiles) {
    profileMap.set(prof.employeeId, prof);
  }
  const profilesUsed = profileMap.size;

  // ---- サマリーログ ----
  console.log(`[shift-gen] 従業員: ${employees.length}名 (正社員${fullTimeEmps.length}, パート/アルバイト${partTimeEmps.length}), 必要人員: ${staffingReqs.length}件, プロファイル: ${profilesUsed}件`);

  // スキル要件マップ: departmentId -> requiredSkills[]
  const deptRequiredSkills = new Map<string, string[]>();
  for (const sr of deptSkillReqs) {
    if (sr.isRequired) {
      const existing = deptRequiredSkills.get(sr.departmentId) || [];
      existing.push(sr.skillName);
      deptRequiredSkills.set(sr.departmentId, existing);
    }
  }

  // 本部応援マップ: dateStr -> HQSupportData[]
  const hqSupportMap = new Map<string, HQSupportData[]>();
  for (const hs of hqSupports) {
    const key = dateToStr(new Date(hs.supportDate));
    const existing = hqSupportMap.get(key) || [];
    existing.push(hs);
    hqSupportMap.set(key, existing);
  }

  function isOnLeave(employeeId: string, date: Date): boolean {
    return leaveRequests.some(
      (lr) =>
        lr.employeeId === employeeId &&
        new Date(lr.startDate) <= date &&
        new Date(lr.endDate) >= date
    );
  }

  function isHolidayDate(date: Date): boolean {
    const entry = calendarMap.get(dateToStr(date));
    return entry?.dayType === "HOLIDAY";
  }

  function isBusyDay(date: Date): boolean {
    const entry = calendarMap.get(dateToStr(date));
    return entry?.dayType === "BUSY_DAY" || entry?.dayType === "SPECIAL_OPEN";
  }

  // スキル適合チェック: 従業員が部門の必須スキルを持っているか
  function hasRequiredSkills(emp: EmployeeData, deptId: string): boolean {
    const required = deptRequiredSkills.get(deptId);
    if (!required || required.length === 0) return true;
    return required.every((sk) => hasSkill(emp.skills, sk));
  }

  // 不足スキル一覧
  function getMissingSkills(emp: EmployeeData, deptId: string): string[] {
    const required = deptRequiredSkills.get(deptId);
    if (!required || required.length === 0) return [];
    return required.filter((sk) => !hasSkill(emp.skills, sk));
  }

  // 週内割当時間トラッカー
  const weeklyHours = new Map<string, number>();
  function getWeeklyHours(empId: string): number {
    return weeklyHours.get(empId) || 0;
  }
  function addWeeklyHours(empId: string, minutes: number): void {
    weeklyHours.set(empId, getWeeklyHours(empId) + minutes);
  }

  const consecutiveDays = new Map<string, number>();
  function getConsecutiveDays(empId: string): number {
    return consecutiveDays.get(empId) || 0;
  }
  function addConsecutiveDay(empId: string): void {
    consecutiveDays.set(empId, getConsecutiveDays(empId) + 1);
  }

  // カバレッジトラッカー
  const coverageMap = new Map<string, number>();
  function getCoverage(dateStr: string, timeSlot: string, deptId: string): number {
    return coverageMap.get(`${dateStr}_${timeSlot}_${deptId}`) || 0;
  }
  function addCoverage(dateStr: string, timeSlot: string, deptId: string): void {
    const key = `${dateStr}_${timeSlot}_${deptId}`;
    coverageMap.set(key, (coverageMap.get(key) || 0) + 1);
  }

  // 割当済み従業員トラッカー（スキルアラート用）
  const assignedBySlot = new Map<string, string[]>();
  function addAssigned(dateStr: string, timeSlot: string, deptId: string, empName: string): void {
    const key = `${dateStr}_${timeSlot}_${deptId}`;
    const existing = assignedBySlot.get(key) || [];
    existing.push(empName);
    assignedBySlot.set(key, existing);
  }

  // 既存シフトのカバレッジ反映
  for (const es of existingShifts) {
    const dateStr = dateToStr(new Date(es.shiftDate));
    for (const slot of TIME_SLOTS) {
      if (timeSlotOverlaps(slot, es.startTime, es.endTime)) {
        const emp = employees.find((e) => e.id === es.employeeId);
        if (emp?.departmentId) {
          addCoverage(dateStr, slot, emp.departmentId);
        }
      }
    }
  }

  // 本部応援のカバレッジ反映
  let hqSupportUsed = 0;
  for (const [dateStr, hsList] of hqSupportMap) {
    for (const hs of hsList) {
      for (const slot of TIME_SLOTS) {
        if (timeSlotOverlaps(slot, hs.startTime, hs.endTime)) {
          if (hs.departmentId) {
            addCoverage(dateStr, slot, hs.departmentId);
            addAssigned(dateStr, slot, hs.departmentId, `[本部]${hs.staffName}`);
          }
        }
      }
      hqSupportUsed++;
    }
    warnings.push(`${dateStr} 本部応援: ${hsList.map((h) => h.staffName).join(", ")}`);
  }

  // ========================================
  // 2. 正社員割当（早番・中番・遅番ローテーション）
  // ========================================
  if (config.autoAssignFullTime) {
    const ftRule = ruleMap.get("FULL_TIME");
    const maxConsec = ftRule?.maxConsecutiveDays ?? 6;

    // 正社員をシャッフルして偏りを防ぐ
    const shuffledFT = [...fullTimeEmps];
    for (let i = shuffledFT.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledFT[i], shuffledFT[j]] = [shuffledFT[j], shuffledFT[i]];
    }

    for (let empIdx = 0; empIdx < shuffledFT.length; empIdx++) {
      const emp = shuffledFT[empIdx];
      let consecutiveCount = 0;

      for (const date of weekDates) {
        const dow = date.getDay();
        const dateStr = dateToStr(date);

        if (isHolidayDate(date)) continue;
        if (dow === 0 || dow === 6) continue;

        const key = `${emp.id}_${dateStr}`;
        if (existingSet.has(key)) { consecutiveCount++; continue; }
        if (isOnLeave(emp.id, date)) { consecutiveCount = 0; continue; }

        if (consecutiveCount >= maxConsec) {
          warnings.push(`${emp.lastName}${emp.firstName}: 連続勤務${maxConsec}日上限のため${DAY_LABELS[dow]}曜スキップ`);
          consecutiveCount = 0;
          continue;
        }

        // 正社員の部門: 本人の部門、なければその日最も人手不足の部門を割当
        let assignDeptId = emp.departmentId;
        if (!assignDeptId) {
          const dayReqs = staffingReqs.filter((r) => r.dayOfWeek === dow);
          let maxGap = -Infinity;
          for (const r of dayReqs) {
            for (const s of TIME_SLOTS) {
              if (r.timeSlot === s) {
                const g = r.minStaff - getCoverage(dateStr, s, r.departmentId);
                if (g > maxGap) { maxGap = g; assignDeptId = r.departmentId; }
              }
            }
          }
        }

        // カバレッジに基づいて最適なパターンを選択（早番/中番/遅番）
        let bestPattern = "full";
        if (assignDeptId) {
          let bestScore = -Infinity;
          for (const pat of FT_ROTATION_PATTERNS) {
            const p = SHIFT_PATTERNS[pat];
            let score = 0;
            for (const slot of TIME_SLOTS) {
              if (timeSlotOverlaps(slot, p.start, p.end)) {
                const gap = (staffingReqs.find(
                  (r) => r.departmentId === assignDeptId && r.dayOfWeek === dow && r.timeSlot === slot
                )?.minStaff || 0) - getCoverage(dateStr, slot, assignDeptId);
                score += Math.max(0, gap); // 不足が多いスロットをカバーするパターンを優先
              }
            }
            // 従業員ごとにパターンを散らすためのオフセット
            score += ((empIdx + dow) % FT_ROTATION_PATTERNS.length === FT_ROTATION_PATTERNS.indexOf(pat)) ? 2 : 0;
            if (score > bestScore) { bestScore = score; bestPattern = pat; }
          }
        } else {
          // 部門未定の場合は従業員インデックスでローテーション
          bestPattern = FT_ROTATION_PATTERNS[(empIdx + dow) % FT_ROTATION_PATTERNS.length];
        }

        const pattern = SHIFT_PATTERNS[bestPattern];
        const workMin = calcWorkMinutes(pattern.start, pattern.end, pattern.breakMin);
        const laborCost = emp.monthlySalary ? Math.round(emp.monthlySalary / 21) : null;

        generatedShifts.push({
          employeeId: emp.id,
          storeId: config.storeId,
          departmentId: assignDeptId,
          shiftDate: dateStr,
          startTime: pattern.start,
          endTime: pattern.end,
          breakMinutes: pattern.breakMin,
          status: "DRAFT",
          laborCost,
          isHelpShift: false,
        });

        existingSet.add(key);
        addWeeklyHours(emp.id, workMin);
        consecutiveCount++;

        if (assignDeptId) {
          for (const slot of TIME_SLOTS) {
            if (timeSlotOverlaps(slot, pattern.start, pattern.end)) {
              addCoverage(dateStr, slot, assignDeptId);
              addAssigned(dateStr, slot, assignDeptId, `${emp.lastName}${emp.firstName}`);
            }
          }
        }
      }
    }
  }


  // ========================================
  // 3+4. カバレッジギャップ + パート/アルバイト割当
  // ========================================
  for (const date of weekDates) {
    const dow = date.getDay();
    const dateStr = dateToStr(date);

    if (isHolidayDate(date)) {
      warnings.push(`${dateStr}(${DAY_LABELS[dow]}) は休業日のためスキップ`);
      continue;
    }

    const busyMultiplier = isBusyDay(date) ? 1.3 : 1.0;
    if (isBusyDay(date)) {
      const calEntry = calendarMap.get(dateStr);
      warnings.push(`${dateStr}(${DAY_LABELS[dow]}) は繁忙日（${calEntry?.name || ""}）- 必要人員1.3倍`);
    }

    const dayReqs = staffingReqs.filter((r) => r.dayOfWeek === dow);

    for (const slot of TIME_SLOTS) {
      const deptGaps = dayReqs
        .filter((r) => r.timeSlot === slot)
        .map((r) => ({
          departmentId: r.departmentId,
          minStaff: Math.ceil(r.minStaff * busyMultiplier),
          idealStaff: Math.ceil(r.idealStaff * busyMultiplier),
          current: getCoverage(dateStr, slot, r.departmentId),
          gap: Math.ceil(r.minStaff * busyMultiplier) - getCoverage(dateStr, slot, r.departmentId),
        }))
        .filter((g) => g.gap > 0)
        .sort((a, b) => b.gap - a.gap);

      if (deptGaps.length === 0) continue;

      for (const gap of deptGaps) {
        while (gap.gap > 0) {
          const candidate = findBestCandidate(
            partTimeEmps, gap.departmentId, date, dateStr, slot, config.priorityStrategy
          );

          if (!candidate) {
            warnings.push(
              `${DAY_LABELS[dow]}曜 ${slot} 部門:${gap.departmentId} 最低人員未充足（必要:${gap.minStaff}, 割当:${gap.current + (gap.minStaff - gap.gap)}）`
            );
            break;
          }

          // スキル適合チェック
          const missingSkills = getMissingSkills(candidate, gap.departmentId);
          if (missingSkills.length > 0) {
            skillAlerts.push({
              departmentId: gap.departmentId,
              date: dateStr,
              timeSlot: slot,
              missingSkill: missingSkills.join(", "),
              assignedEmployees: [`${candidate.lastName}${candidate.firstName}`],
              severity: "critical",
            });
            warnings.push(
              `⚠ スキル不足: ${candidate.lastName}${candidate.firstName} → ${gap.departmentId} [不足: ${missingSkills.join(", ")}]`
            );
          }

          const request = requestMap.get(`${candidate.id}_${dateStr}`);
          const profile = config.useAttendanceProfile ? profileMap.get(candidate.id) : null;
          const empRule = ruleMap.get(candidate.employmentType);
          const pattern = selectShiftPattern(
            candidate.employmentType,
            request?.startTime,
            request?.endTime,
            profile,
            empRule?.minBreakMinutes,
            date.getDay(),
            slot,  // カバレッジ不足の時間帯を渡す
          );

          const workMin = calcWorkMinutes(pattern.start, pattern.end, pattern.breakMin);
          const laborCost = candidate.hourlyWage
            ? Math.round((candidate.hourlyWage * workMin) / 60)
            : null;

          generatedShifts.push({
            employeeId: candidate.id,
            storeId: config.storeId,
            departmentId: gap.departmentId,
            shiftDate: dateStr,
            startTime: pattern.start,
            endTime: pattern.end,
            breakMinutes: pattern.breakMin,
            status: "DRAFT",
            laborCost,
            isHelpShift: gap.departmentId !== candidate.departmentId,
          });

          existingSet.add(`${candidate.id}_${dateStr}`);
          addWeeklyHours(candidate.id, workMin);
          addConsecutiveDay(candidate.id);

          for (const s of TIME_SLOTS) {
            if (timeSlotOverlaps(s, pattern.start, pattern.end)) {
              addCoverage(dateStr, s, gap.departmentId);
              addAssigned(dateStr, s, gap.departmentId, `${candidate.lastName}${candidate.firstName}`);
            }
          }

          gap.current++;
          gap.gap--;
        }
      }

      // ========================================
      // v4: idealStaffまでの追加割当（プロファイル適合度重視）
      // minStaff充足後、idealStaffまで可能な限り追加
      // ========================================
      const idealGaps = dayReqs
        .filter((r) => r.timeSlot === slot)
        .map((r) => ({
          departmentId: r.departmentId,
          idealStaff: Math.ceil(r.idealStaff * busyMultiplier),
          current: getCoverage(dateStr, slot, r.departmentId),
        }))
        .filter((g) => g.current < g.idealStaff)
        .sort((a, b) => (b.idealStaff - b.current) - (a.idealStaff - a.current));

      for (const ig of idealGaps) {
        let remaining = ig.idealStaff - ig.current;
        while (remaining > 0) {
          const candidate = findBestCandidate(
            partTimeEmps, ig.departmentId, date, dateStr, slot, config.priorityStrategy
          );
          if (!candidate) break; // 候補者なし → 次の部門へ

          const request = requestMap.get(`${candidate.id}_${dateStr}`);
          const profile = config.useAttendanceProfile ? profileMap.get(candidate.id) : null;
          const empRule = ruleMap.get(candidate.employmentType);
          const pattern = selectShiftPattern(
            candidate.employmentType,
            request?.startTime, request?.endTime,
            profile, empRule?.minBreakMinutes, date.getDay(),
            slot,  // カバレッジ不足の時間帯を渡す
          );

          const workMin = calcWorkMinutes(pattern.start, pattern.end, pattern.breakMin);
          const laborCost = candidate.hourlyWage
            ? Math.round((candidate.hourlyWage * workMin) / 60)
            : null;

          generatedShifts.push({
            employeeId: candidate.id,
            storeId: config.storeId,
            departmentId: ig.departmentId,
            shiftDate: dateStr,
            startTime: pattern.start,
            endTime: pattern.end,
            breakMinutes: pattern.breakMin,
            status: "DRAFT",
            laborCost,
            isHelpShift: ig.departmentId !== candidate.departmentId,
          });

          existingSet.add(`${candidate.id}_${dateStr}`);
          addWeeklyHours(candidate.id, workMin);
          addConsecutiveDay(candidate.id);

          for (const s of TIME_SLOTS) {
            if (timeSlotOverlaps(s, pattern.start, pattern.end)) {
              addCoverage(dateStr, s, ig.departmentId);
              addAssigned(dateStr, s, ig.departmentId, `${candidate.lastName}${candidate.firstName}`);
            }
          }
          remaining--;
        }
      }
    }
  }

  // 候補者検索関数（v4: 曜日×時間帯マトリクス + 連勤 + 週間時間バランス + 遵守率）
  function findBestCandidate(
    candidates: EmployeeData[],
    targetDeptId: string,
    date: Date,
    dateStr: string,
    timeSlot: string,
    strategy: "cost" | "balanced" | "profile"
  ): EmployeeData | null {
    const dow = date.getDay();
    // timeSlotからスロットインデックスを取得
    const slotIdx = TIME_SLOTS.indexOf(timeSlot);

    const scored = candidates
      .filter((emp) => {
        if (existingSet.has(`${emp.id}_${dateStr}`)) return false;
        if (isOnLeave(emp.id, date)) return false;

        const req = requestMap.get(`${emp.id}_${dateStr}`);
        if (req?.requestType === "UNAVAILABLE") return false;

        const empRule = ruleMap.get(emp.employmentType);
        const maxWeeklyH = empRule?.weeklyMaxHours ?? (emp.maxHoursPerWeek || 40);
        const currentHours = getWeeklyHours(emp.id) / 60;
        if (currentHours >= maxWeeklyH) return false;

        const maxConsec = empRule?.maxConsecutiveDays ?? 5;
        if (getConsecutiveDays(emp.id) >= maxConsec) return false;

        // 部門マッチ: departmentIdがnullの場合はどの部門にも配置可能とする
        const canWork =
          emp.departmentId === null ||
          emp.departmentId === targetDeptId ||
          (emp.canWorkDepts && emp.canWorkDepts.includes(targetDeptId));
        if (!canWork) return false;

        return true;
      })
      .map((emp) => {
        let score = 0;
        const req = requestMap.get(`${emp.id}_${dateStr}`);
        const profile = profileMap.get(emp.id);

        // (1) 希望マッチスコア
        if (req?.requestType === "PREFERRED") score += 100;
        else if (req?.requestType === "AVAILABLE") score += 50;
        else score += 10;

        // (2) v4: 曜日×時間帯マトリクスによるスコア（従来の曜日確率を置換）
        if (profile && profile.confidenceScore >= 0.3) {
          if (profile.dowTimeSlotProb && profile.dowTimeSlotProb.length === 28 && slotIdx >= 0) {
            // 曜日×時間帯の確率を使う（より精密）
            const dowSlotProb = profile.dowTimeSlotProb[dow * 4 + slotIdx] || 0;
            const weightMultiplier = strategy === "profile" ? 120 : 40;
            score += Math.round(dowSlotProb * weightMultiplier);
            // 希望未提出でもプロファイルが強ければ加点
            if (!req && strategy === "profile") {
              score += Math.round(dowSlotProb * 50);
            }
          } else {
            // フォールバック: 従来の曜日確率
            const prob = profile.dayOfWeekProb[dow] || 0;
            const weightMultiplier = strategy === "profile" ? 80 : 20;
            score += Math.round(prob * weightMultiplier);
          }

          // (3) v4: シフト遵守率加点（信頼できる人を優先）
          if (profile.scheduleAdherence != null && profile.scheduleAdherence > 0) {
            score += Math.round(profile.scheduleAdherence * 30);
          }

          // (4) v4: 連勤バランス（平均連勤日数を超えそうなら減点）
          if (profile.avgConsecutiveDays != null) {
            const currentConsec = getConsecutiveDays(emp.id);
            if (currentConsec >= profile.avgConsecutiveDays) {
              score -= 20; // 普段より連勤が多くなりそう
            }
          }

          // (5) v4: 週間労働時間バランス
          if (profile.typicalWeeklyHours != null && profile.typicalWeeklyHours > 0) {
            const currentHours = getWeeklyHours(emp.id) / 60;
            const remaining = profile.typicalWeeklyHours - currentHours;
            if (remaining > 0) {
              score += Math.min(25, Math.round(remaining * 3)); // まだ余裕がある人を優先
            } else {
              score -= 15; // 典型的な週間時間を超えそう
            }
          }
        }

        // (6) 部門マッチ
        if (emp.departmentId === targetDeptId) score += 50;

        // (7) スキル適合スコア
        if (hasRequiredSkills(emp, targetDeptId)) {
          score += 80;
        } else {
          score -= 40;
        }

        // (8) コスト優先
        if (strategy === "cost" && emp.hourlyWage) {
          score += Math.max(0, 30 - Math.floor((emp.hourlyWage - 1000) / 50));
        }

        // (9) バランス優先（公平性: 割当が少ない人を優先）
        if (strategy === "balanced") {
          const currentHours = getWeeklyHours(emp.id) / 60;
          score += Math.max(0, 25 - Math.floor(currentHours * 1.5));
        }

        return { emp, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored.length > 0 ? scored[0].emp : null;
  }

  // ========================================
  // 5. 生成後スキルアラート一括チェック
  // ========================================
  // 各部門×日×時間帯で、必須スキル保有者が1人以上いるかチェック
  for (const date of weekDates) {
    const dateStr = dateToStr(date);
    if (isHolidayDate(date)) continue;

    for (const slot of TIME_SLOTS) {
      for (const [deptId, requiredSkills] of deptRequiredSkills) {
        const assigned = assignedBySlot.get(`${dateStr}_${slot}_${deptId}`) || [];
        if (assigned.length === 0) continue;

        // この時間帯に割当された従業員のスキルをチェック
        const slotShifts = generatedShifts.filter(
          (s) => s.shiftDate === dateStr && s.departmentId === deptId &&
            timeSlotOverlaps(slot, s.startTime, s.endTime)
        );
        const slotEmps = slotShifts.map((s) => employees.find((e) => e.id === s.employeeId)).filter(Boolean) as EmployeeData[];

        // 本部応援も含む
        const dayHQ = (hqSupportMap.get(dateStr) || []).filter(
          (h) => h.departmentId === deptId && timeSlotOverlaps(slot, h.startTime, h.endTime)
        );

        for (const skill of requiredSkills) {
          const hasHolder = slotEmps.some((e) => hasSkill(e.skills, skill))
            || dayHQ.some((h) => hasSkill(h.skills, skill));
          if (!hasHolder) {
            // 重複チェック
            const already = skillAlerts.find(
              (a) => a.departmentId === deptId && a.date === dateStr && a.timeSlot === slot && a.missingSkill === skill
            );
            if (!already) {
              skillAlerts.push({
                departmentId: deptId,
                date: dateStr,
                timeSlot: slot,
                missingSkill: skill,
                assignedEmployees: assigned,
                severity: "critical",
              });
            }
          }
        }
      }
    }
  }

  // ========================================
  // 6. サマリー生成
  // ========================================
  const daySummaries: DaySummary[] = weekDates.map((date) => {
    const dateStr = dateToStr(date);
    const dow = date.getDay();
    const dayShifts = generatedShifts.filter((s) => s.shiftDate === dateStr);
    const dayReqs = staffingReqs.filter((r) => r.dayOfWeek === dow);
    const calEntry = calendarMap.get(dateStr);
    const dayHQ = hqSupportMap.get(dateStr) || [];

    const coverage: DeptCoverage[] = [];
    for (const req of dayReqs) {
      const assigned = getCoverage(dateStr, req.timeSlot, req.departmentId);
      let status: DeptCoverage["status"];
      if (assigned >= req.idealStaff) status = "over";
      else if (assigned >= req.minStaff) status = "minimum";
      else status = "short";
      if (assigned === req.idealStaff) status = "ideal";

      coverage.push({
        departmentId: req.departmentId,
        timeSlot: req.timeSlot,
        minStaff: req.minStaff,
        idealStaff: req.idealStaff,
        assigned,
        status,
      });
    }

    return {
      date: dateStr,
      dayOfWeek: dow,
      dayLabel: `${DAY_LABELS[dow]}曜`,
      isHoliday: calEntry?.dayType === "HOLIDAY",
      calendarNote: calEntry?.name || null,
      shiftsGenerated: dayShifts.length,
      estimatedCost: dayShifts.reduce((sum, s) => sum + (s.laborCost || 0), 0),
      coverage,
      hqSupportCount: dayHQ.length,
    };
  });

  // ========================================
  // 7. v4: 従業員別割当詳細 + 希望充足率
  // ========================================
  const empAssignMap = new Map<string, { days: number; hours: number; matchScores: number[] }>();
  for (const shift of generatedShifts) {
    const emp = employees.find((e) => e.id === shift.employeeId);
    if (!emp) continue;
    const existing = empAssignMap.get(shift.employeeId) || { days: 0, hours: 0, matchScores: [] };
    existing.days++;
    const workMin = calcWorkMinutes(shift.startTime, shift.endTime, shift.breakMinutes);
    existing.hours += workMin / 60;

    // プロファイルマッチスコア計算
    const profile = profileMap.get(shift.employeeId);
    if (profile && profile.confidenceScore >= 0.3) {
      const shiftDate = new Date(shift.shiftDate + "T00:00:00");
      const dow = shiftDate.getDay();
      let matchScore = 0;
      // 曜日確率
      matchScore += (profile.dayOfWeekProb[dow] || 0) * 40;
      // 曜日×時間帯確率
      if (profile.dowTimeSlotProb && profile.dowTimeSlotProb.length === 28) {
        const slotIdx = TIME_SLOTS.findIndex((s) => timeSlotOverlaps(s, shift.startTime, shift.endTime));
        if (slotIdx >= 0) {
          matchScore += (profile.dowTimeSlotProb[dow * 4 + slotIdx] || 0) * 60;
        }
      }
      existing.matchScores.push(Math.min(100, Math.round(matchScore)));
    }

    empAssignMap.set(shift.employeeId, existing);
  }

  const employeeDetails: EmployeeAssignmentDetail[] = [];
  for (const [empId, data] of empAssignMap) {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) continue;

    // 希望充足計算
    let fulfilled = 0;
    let total = 0;
    for (const date of weekDates) {
      const dateStr = dateToStr(date);
      const req = requestMap.get(`${empId}_${dateStr}`);
      if (!req) continue;
      if (req.requestType === "PREFERRED" || req.requestType === "AVAILABLE") {
        total++;
        if (existingSet.has(`${empId}_${dateStr}`)) fulfilled++;
      }
    }

    const avgMatch = data.matchScores.length > 0
      ? Math.round(data.matchScores.reduce((a, b) => a + b, 0) / data.matchScores.length)
      : null;

    employeeDetails.push({
      employeeId: empId,
      employeeName: `${emp.lastName}${emp.firstName}`,
      employmentType: emp.employmentType,
      assignedDays: data.days,
      totalHours: Math.round(data.hours * 10) / 10,
      profileMatchScore: avgMatch,
      requestFulfilled: fulfilled,
      requestTotal: total,
    });
  }

  // 希望充足サマリー
  let preferredFulfilled = 0, availableFulfilled = 0, unavailableRespected = 0;
  let totalPreferred = 0, totalAvailable = 0, totalUnavailable = 0;
  for (const sr of shiftRequests) {
    const dateStr = dateToStr(new Date(sr.targetDate));
    const assigned = existingSet.has(`${sr.employeeId}_${dateStr}`);
    if (sr.requestType === "PREFERRED") {
      totalPreferred++;
      if (assigned) preferredFulfilled++;
    } else if (sr.requestType === "AVAILABLE") {
      totalAvailable++;
      if (assigned) availableFulfilled++;
    } else if (sr.requestType === "UNAVAILABLE") {
      totalUnavailable++;
      if (!assigned) unavailableRespected++;
    }
  }
  const totalFulfillable = totalPreferred + totalAvailable + totalUnavailable;
  const totalFulfilled = preferredFulfilled + availableFulfilled + unavailableRespected;

  const requestFulfillment: RequestFulfillment = {
    totalRequests: totalFulfillable,
    preferredFulfilled,
    availableFulfilled,
    unavailableRespected,
    fulfillmentRate: totalFulfillable > 0 ? Math.round((totalFulfilled / totalFulfillable) * 100) / 100 : 1,
  };

  // シフトパターン分布ログ
  const patternDist = new Map<string, number>();
  for (const s of generatedShifts) {
    const key = `${s.startTime}-${s.endTime}`;
    patternDist.set(key, (patternDist.get(key) || 0) + 1);
  }
  const patternEntries = [...patternDist.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`[shift-gen] シフトパターン分布: ${patternEntries.map(([k, v]) => `${k}:${v}件`).join(", ")}`);

  // 日別分布ログ
  const dayDist = new Map<string, number>();
  for (const s of generatedShifts) {
    dayDist.set(s.shiftDate, (dayDist.get(s.shiftDate) || 0) + 1);
  }
  const dayEntries = [...dayDist.entries()].sort();
  console.log(`[shift-gen] 日別分布: ${dayEntries.map(([k, v]) => `${k}:${v}件`).join(", ")}`);

  return {
    shifts: generatedShifts,
    totalCount: generatedShifts.length,
    totalCost: generatedShifts.reduce((sum, s) => sum + (s.laborCost || 0), 0),
    daySummaries,
    warnings,
    skillAlerts,
    profilesUsed,
    hqSupportUsed,
    employeeDetails,
    requestFulfillment,
  };
}

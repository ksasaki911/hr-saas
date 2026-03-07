// =============================================================
// 出勤パターンプロファイルAPI
// GET: プロファイル取得
// POST: 実績データ分析→プロファイル生成
// =============================================================
import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const url = new URL(req.url);
    const storeId = url.searchParams.get("storeId");
    const employeeId = url.searchParams.get("employeeId");

    const where: Record<string, unknown> = {};
    if (storeId) where.storeId = storeId;
    if (employeeId) where.employeeId = employeeId;

    const profiles = await db.attendanceProfile.findMany({
      where,
      include: {
        employee: {
          select: {
            code: true,
            lastName: true,
            firstName: true,
            employmentType: true,
            departmentId: true,
          },
        },
      },
      orderBy: { confidenceScore: "desc" },
    });

    return NextResponse.json(profiles);
  } catch (e) {
    console.error("GET /api/attendance-profile error:", e);
    return NextResponse.json({ error: "取得失敗" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, tenantId } = await getTenantDb();
    const body = await req.json();
    const { storeId, monthsBack = 3 } = body as {
      storeId: string;
      monthsBack?: number;
    };

    if (!storeId) {
      return NextResponse.json({ error: "storeIdが必要です" }, { status: 400 });
    }

    // 分析対象期間
    const analyzedTo = new Date();
    const analyzedFrom = new Date();
    analyzedFrom.setMonth(analyzedFrom.getMonth() - monthsBack);

    // 対象従業員を取得（全雇用区分）
    const employees = await db.employee.findMany({
      where: {
        storeId,
        isActive: true,
      },
      select: { id: true, code: true, lastName: true, firstName: true },
    });

    // 勤怠レコードを一括取得
    const records = await db.attendanceRecord.findMany({
      where: {
        storeId,
        attendanceDate: { gte: analyzedFrom, lte: analyzedTo },
        clockIn: { not: null },
        clockOut: { not: null },
      },
      select: {
        employeeId: true,
        attendanceDate: true,
        clockIn: true,
        clockOut: true,
        actualBreakMinutes: true,
        totalWorkMinutes: true,
      },
    });

    // シフトデータも取得（遵守率計算用）
    const shifts = await db.shift.findMany({
      where: {
        storeId,
        shiftDate: { gte: analyzedFrom, lte: analyzedTo },
        status: { in: ["PUBLISHED", "CONFIRMED"] },
      },
      select: { employeeId: true, shiftDate: true },
    });
    type ShiftRec = typeof shifts[number];
    const shiftsByEmp = new Map<string, ShiftRec[]>();
    for (const s of shifts) {
      const arr = shiftsByEmp.get(s.employeeId) || [];
      arr.push(s);
      shiftsByEmp.set(s.employeeId, arr);
    }

    // 従業員ごとにグループ化
    type AttRecord = typeof records[number];
    const recordsByEmp = new Map<string, AttRecord[]>();
    for (const r of records) {
      const arr = recordsByEmp.get(r.employeeId) || [];
      arr.push(r);
      recordsByEmp.set(r.employeeId, arr);
    }

    // ---- ユーティリティ ----
    const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    const stdCalc = (arr: number[], m: number) =>
      arr.length > 0 ? Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length) : 0;
    const roundTo30 = (m: number) => Math.round(m / 30) * 30;
    const formatMin = (m: number) => {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    };
    const dateStr = (d: Date) => {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    };

    // 時間帯スロット定義: 09-12=0, 12-15=1, 15-18=2, 18-22=3
    const SLOT_RANGES = [
      { start: 540, end: 720 },  // 09:00-12:00
      { start: 720, end: 900 },  // 12:00-15:00
      { start: 900, end: 1080 }, // 15:00-18:00
      { start: 1080, end: 1320 },// 18:00-22:00
    ];
    function getActiveSlots(clockInMin: number, clockOutMin: number): number[] {
      const slots: number[] = [];
      for (let i = 0; i < 4; i++) {
        if (clockInMin < SLOT_RANGES[i].end && clockOutMin > SLOT_RANGES[i].start) {
          slots.push(i);
        }
      }
      return slots;
    }

    // シフトパターン判定
    const PATTERNS: Record<string, { start: number; end: number }> = {
      full:      { start: 480, end: 1020 }, // 08:00-17:00
      morning:   { start: 540, end: 840 },  // 09:00-14:00
      day:       { start: 540, end: 1020 }, // 09:00-17:00
      afternoon: { start: 780, end: 1080 }, // 13:00-18:00
      late:      { start: 840, end: 1320 }, // 14:00-22:00
      evening:   { start: 1020, end: 1320 },// 17:00-22:00
    };
    function detectPattern(clockInMin: number, clockOutMin: number): string {
      let best = "other";
      let minDist = Infinity;
      for (const [name, p] of Object.entries(PATTERNS)) {
        const dist = Math.abs(clockInMin - p.start) + Math.abs(clockOutMin - p.end);
        if (dist < minDist) { minDist = dist; best = name; }
      }
      return minDist <= 90 ? best : "other"; // 1.5h以内なら判定
    }

    const profiles = [];
    for (const emp of employees) {
      const empRecords = recordsByEmp.get(emp.id) || [];
      if (empRecords.length < 5) continue;

      // ===== 既存: 曜日別出勤回数 =====
      const dowCount = [0, 0, 0, 0, 0, 0, 0];
      const dowTotal = [0, 0, 0, 0, 0, 0, 0];
      const dayMs = 86400000;
      for (let d = new Date(analyzedFrom); d <= analyzedTo; d = new Date(d.getTime() + dayMs)) {
        dowTotal[d.getDay()]++;
      }

      // ===== v4新規: 時間帯別・曜日×時間帯別カウンタ =====
      const slotCount = [0, 0, 0, 0];           // 全体の時間帯別
      const dowSlotCount = new Array(28).fill(0); // 曜日7×時間帯4

      const clockInMinutes: number[] = [];
      const clockOutMinutes: number[] = [];
      let totalDays = 0;
      let totalWorkMin = 0;

      // ===== v4新規: パターン別カウンタ =====
      const patternCount = new Map<string, number>();

      // ===== v4新規: 週間労働時間トラッカー =====
      const weeklyWorkMap = new Map<string, number>(); // "YYYY-WW" -> totalMinutes

      for (const r of empRecords) {
        const attDate = new Date(r.attendanceDate);
        const dow = attDate.getDay();
        dowCount[dow]++;
        totalDays++;
        totalWorkMin += r.totalWorkMinutes;

        let ciMin = 0, coMin = 0;
        if (r.clockIn) {
          const ci = new Date(r.clockIn);
          ciMin = ci.getHours() * 60 + ci.getMinutes();
          clockInMinutes.push(ciMin);
        }
        if (r.clockOut) {
          const co = new Date(r.clockOut);
          coMin = co.getHours() * 60 + co.getMinutes();
          clockOutMinutes.push(coMin);
        }

        // 時間帯別集計
        if (r.clockIn && r.clockOut) {
          const activeSlots = getActiveSlots(ciMin, coMin);
          for (const si of activeSlots) {
            slotCount[si]++;
            dowSlotCount[dow * 4 + si]++;
          }

          // パターン検出
          const pat = detectPattern(ciMin, coMin);
          patternCount.set(pat, (patternCount.get(pat) || 0) + 1);
        }

        // 週間集計
        const weekNum = getISOWeekStr(attDate);
        weeklyWorkMap.set(weekNum, (weeklyWorkMap.get(weekNum) || 0) + r.totalWorkMinutes);
      }

      // 曜日別出勤確率
      const dayOfWeekProb = dowCount.map((cnt, i) =>
        dowTotal[i] > 0 ? Math.round((cnt / dowTotal[i]) * 100) / 100 : 0
      );

      // ===== v4新規: 時間帯別出勤確率 =====
      const timeSlotProb = slotCount.map(cnt =>
        totalDays > 0 ? Math.round((cnt / totalDays) * 100) / 100 : 0
      );

      // ===== v4新規: 曜日×時間帯マトリクス =====
      const dowTimeSlotProb = dowSlotCount.map((cnt, idx) => {
        const dowIdx = Math.floor(idx / 4);
        return dowCount[dowIdx] > 0 ? Math.round((cnt / dowCount[dowIdx]) * 100) / 100 : 0;
      });

      // ===== v4新規: よく入るシフトパターン（頻度上位3つ）=====
      const preferredPatterns = Array.from(patternCount.entries())
        .filter(([name]) => name !== "other")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .filter(([, cnt]) => cnt >= 3) // 最低3回以上
        .map(([name]) => name);

      // ===== v4新規: 連勤パターン =====
      const sortedDates = empRecords
        .map(r => dateStr(r.attendanceDate))
        .sort();
      const uniqueDates = [...new Set(sortedDates)];
      const consecutiveStreaks: number[] = [];
      let streak = 1;
      for (let i = 1; i < uniqueDates.length; i++) {
        const prev = new Date(uniqueDates[i - 1] + "T00:00:00");
        const curr = new Date(uniqueDates[i] + "T00:00:00");
        const diffDays = Math.round((curr.getTime() - prev.getTime()) / dayMs);
        if (diffDays === 1) {
          streak++;
        } else {
          consecutiveStreaks.push(streak);
          streak = 1;
        }
      }
      consecutiveStreaks.push(streak);
      const avgConsecutiveDays = consecutiveStreaks.length > 0
        ? Math.round(mean(consecutiveStreaks) * 10) / 10
        : null;

      // ===== v4新規: 週間労働時間 =====
      const weeklyHoursArr = Array.from(weeklyWorkMap.values()).map(m => m / 60);
      const typicalWeeklyHours = weeklyHoursArr.length > 0
        ? Math.round(mean(weeklyHoursArr) * 10) / 10
        : null;

      // ===== v4新規: シフト遵守率 =====
      const empShifts = shiftsByEmp.get(emp.id) || [];
      let shiftAttended = 0;
      for (const s of empShifts) {
        const sDateStr = dateStr(s.shiftDate);
        if (uniqueDates.includes(sDateStr)) shiftAttended++;
      }
      const scheduleAdherence = empShifts.length > 0
        ? Math.round((shiftAttended / empShifts.length) * 100) / 100
        : null;

      // ===== 既存: 平均・標準偏差 =====
      const avgIn = clockInMinutes.length > 0 ? mean(clockInMinutes) : null;
      const stdIn = avgIn !== null ? stdCalc(clockInMinutes, avgIn) : null;
      const avgOut = clockOutMinutes.length > 0 ? mean(clockOutMinutes) : null;
      const stdOut = avgOut !== null ? stdCalc(clockOutMinutes, avgOut) : null;

      const typicalStart = avgIn !== null ? formatMin(roundTo30(avgIn)) : null;
      const typicalEnd = avgOut !== null ? formatMin(roundTo30(avgOut)) : null;
      const typicalBreakMin = empRecords.length > 0
        ? Math.round(empRecords.reduce((s, r) => s + r.actualBreakMinutes, 0) / empRecords.length)
        : null;

      const confidenceScore = Math.min(1.0, empRecords.length / (monthsBack * 20));
      const avgMonthlyDays = totalDays / monthsBack;
      const avgDailyHours = totalDays > 0 ? totalWorkMin / totalDays / 60 : 0;

      // プロファイルデータ
      const profileData = {
        storeId,
        analyzedFrom,
        analyzedTo,
        totalRecordDays: empRecords.length,
        dayOfWeekProb,
        avgClockInMinute: avgIn,
        stdClockInMinute: stdIn,
        avgClockOutMinute: avgOut,
        stdClockOutMinute: stdOut,
        avgMonthlyDays,
        avgDailyHours,
        typicalStartTime: typicalStart,
        typicalEndTime: typicalEnd,
        typicalBreakMin,
        // v4新規フィールド
        timeSlotProb,
        dowTimeSlotProb,
        preferredPatterns,
        avgConsecutiveDays,
        typicalWeeklyHours,
        scheduleAdherence,
        confidenceScore,
      };

      const profile = await db.attendanceProfile.upsert({
        where: {
          tenantId_employeeId: { tenantId, employeeId: emp.id },
        },
        update: profileData,
        create: { tenantId, employeeId: emp.id, ...profileData },
      });
      profiles.push(profile);
    }

    // ISO週番号ヘルパー
    function getISOWeekStr(d: Date): string {
      const tmp = new Date(d.getTime());
      tmp.setHours(0, 0, 0, 0);
      tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
      const week1 = new Date(tmp.getFullYear(), 0, 4);
      const weekNum = 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
      return `${tmp.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
    }

    return NextResponse.json({
      analyzedEmployees: employees.length,
      generatedProfiles: profiles.length,
      period: { from: analyzedFrom.toISOString().split("T")[0], to: analyzedTo.toISOString().split("T")[0] },
      profiles,
    });
  } catch (e) {
    console.error("POST /api/attendance-profile error:", e);
    return NextResponse.json({ error: `分析失敗: ${e instanceof Error ? e.message : "不明"}` }, { status: 500 });
  }
}

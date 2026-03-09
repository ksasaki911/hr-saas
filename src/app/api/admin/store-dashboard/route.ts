// @ts-nocheck
// =============================================================
// 店舗長ダッシュボードAPI（パフォーマンス最適化版）
// GET /api/admin/store-dashboard?storeId=xxx
// 店舗単位の勤怠・人時・人件費データを返す
// =============================================================
import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

export const maxDuration = 120;

// インメモリキャッシュ（3分TTL、storeId+month+weekごと）
const storeCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 3 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const url = new URL(req.url);
    const storeId = url.searchParams.get("storeId");

    if (!storeId) {
      return NextResponse.json({ error: "storeIdが必要です" }, { status: 400 });
    }

    // キャッシュチェック
    const monthParam = url.searchParams.get("month");
    const weekParam = url.searchParams.get("weekStart");
    const cacheKey = `${storeId}|${monthParam || ""}|${weekParam || ""}`;
    const cached = storeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    // 店舗情報
    const store = await db.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 });
    }

    // 従業員一覧
    const employees = await db.employee.findMany({
      where: { storeId, isActive: true },
      select: {
        id: true, code: true, lastName: true, firstName: true,
        employmentType: true, hourlyWage: true, departmentId: true,
      },
      orderBy: { code: "asc" },
    });

    // 基準月（クエリパラメータ or 今月）
    // monthParam は上部キャッシュキー生成で取得済み
    const now = new Date();
    let baseYear = now.getFullYear();
    let baseMonth = now.getMonth(); // 0-indexed
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split("-").map(Number);
      baseYear = y;
      baseMonth = m - 1; // 0-indexed
    }

    // 基準月・先月・前年同月の日付範囲
    const thisMonthStart = new Date(baseYear, baseMonth, 1);
    const thisMonthEnd = new Date(baseYear, baseMonth + 1, 0);
    const lastMonthStart = new Date(baseYear, baseMonth - 1, 1);
    const lastMonthEnd = new Date(baseYear, baseMonth, 0);
    const prevYearStart = new Date(baseYear - 1, baseMonth, 1);
    const prevYearEnd = new Date(baseYear - 1, baseMonth + 1, 0);

    // 基準週（クエリパラメータ or 今週）: weekStart="2026-03-02" 形式（月曜日）
    // weekParam は上部キャッシュキー生成で取得済み
    let thisWeekStart: Date;
    if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
      const [wy, wm, wd] = weekParam.split("-").map(Number);
      thisWeekStart = new Date(wy, wm - 1, wd);
    } else {
      // デフォルト: 今週の月曜日
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
    }
    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekEnd.getDate() + 6);

    // 先週の範囲
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

    // 前年同週の範囲（同じ月の同じ週番号に近い月曜）
    const prevYearWeekStart = new Date(thisWeekStart);
    prevYearWeekStart.setFullYear(prevYearWeekStart.getFullYear() - 1);
    // 曜日を月曜に揃える
    const pyDow = prevYearWeekStart.getDay();
    const pyMondayOff = pyDow === 0 ? -6 : 1 - pyDow;
    prevYearWeekStart.setDate(prevYearWeekStart.getDate() + pyMondayOff);
    const prevYearWeekEnd = new Date(prevYearWeekStart);
    prevYearWeekEnd.setDate(prevYearWeekEnd.getDate() + 6);

    // 過去8週分の範囲（週次トレンド用）
    const trend8WeeksStart = new Date(thisWeekStart);
    trend8WeeksStart.setDate(trend8WeeksStart.getDate() - 7 * 7); // 7週前の月曜

    // 勤怠レコード（今月・先月・前年同月・今週・先週・前年同週・8週トレンド）
    const minDate = new Date(Math.min(
      prevYearStart.getTime(),
      lastMonthStart.getTime(),
      prevYearWeekStart.getTime(),
      trend8WeeksStart.getTime(),
    ));
    const maxDate = new Date(Math.max(
      thisMonthEnd.getTime(),
      thisWeekEnd.getTime(),
    ));
    const allRecords = await db.attendanceRecord.findMany({
      where: {
        storeId,
        attendanceDate: {
          gte: minDate,
          lte: maxDate,
        },
      },
      select: {
        employeeId: true,
        attendanceDate: true,
        clockIn: true,
        clockOut: true,
        totalWorkMinutes: true,
        overtimeMinutes: true,
        lateMinutes: true,
        earlyLeaveMinutes: true,
        laborCost: true,
        status: true,
        actualBreakMinutes: true,
      },
      orderBy: { attendanceDate: "asc" },
    });

    // ローカルタイムゾーン対応の日付フォーマット（toISOStringはUTC変換されるので使わない）
    const localDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    // 1パスで全期間バケットに振り分け（6回のfilterスキャンを排除）
    type Rec = typeof allRecords[number];
    const thisMonthRecs: Rec[] = [];
    const lastMonthRecs: Rec[] = [];
    const prevYearRecs: Rec[] = [];
    const thisWeekRecs: Rec[] = [];
    const lastWeekRecs: Rec[] = [];
    const prevYearWeekRecs: Rec[] = [];

    // 期間境界を事前計算（文字列比較用）
    const ranges = {
      tm: [localDateStr(thisMonthStart), localDateStr(thisMonthEnd)],
      lm: [localDateStr(lastMonthStart), localDateStr(lastMonthEnd)],
      py: [localDateStr(prevYearStart), localDateStr(prevYearEnd)],
      tw: [localDateStr(thisWeekStart), localDateStr(thisWeekEnd)],
      lw: [localDateStr(lastWeekStart), localDateStr(lastWeekEnd)],
      pyw: [localDateStr(prevYearWeekStart), localDateStr(prevYearWeekEnd)],
    };

    for (const r of allRecords) {
      const rDate = localDateStr(new Date(r.attendanceDate));
      if (rDate >= ranges.tm[0] && rDate <= ranges.tm[1]) thisMonthRecs.push(r);
      if (rDate >= ranges.lm[0] && rDate <= ranges.lm[1]) lastMonthRecs.push(r);
      if (rDate >= ranges.py[0] && rDate <= ranges.py[1]) prevYearRecs.push(r);
      if (rDate >= ranges.tw[0] && rDate <= ranges.tw[1]) thisWeekRecs.push(r);
      if (rDate >= ranges.lw[0] && rDate <= ranges.lw[1]) lastWeekRecs.push(r);
      if (rDate >= ranges.pyw[0] && rDate <= ranges.pyw[1]) prevYearWeekRecs.push(r);
    }

    // 期間フィルタ関数（週トレンド用に残す）
    const inRange = (r: Rec, from: Date, to: Date) => {
      const rDate = localDateStr(new Date(r.attendanceDate));
      return rDate >= localDateStr(from) && rDate <= localDateStr(to);
    };

    // 集計ヘルパー
    const summarize = (recs: Rec[]) => {
      const workMinutes = recs.reduce((s, r) => s + (r.totalWorkMinutes || 0), 0);
      const overtimeMinutes = recs.reduce((s, r) => s + (r.overtimeMinutes || 0), 0);
      const laborCost = recs.reduce((s, r) => s + (r.laborCost || 0), 0);
      const lateDays = recs.filter(r => (r.lateMinutes || 0) > 0).length;
      const workingDays = recs.filter(r => (r.totalWorkMinutes || 0) > 0).length;
      const uniqueEmps = new Set(recs.filter(r => (r.totalWorkMinutes || 0) > 0).map(r => r.employeeId)).size;
      return {
        workHours: Math.round(workMinutes / 60 * 10) / 10,
        overtimeHours: Math.round(overtimeMinutes / 60 * 10) / 10,
        laborCost,
        workingDays,
        lateDays,
        uniqueEmployees: uniqueEmps,
        avgDailyHours: workingDays > 0 ? Math.round(workMinutes / workingDays / 60 * 10) / 10 : 0,
      };
    };

    const thisMonthSummary = summarize(thisMonthRecs);
    const lastMonthSummary = summarize(lastMonthRecs);
    const prevYearSummary = summarize(prevYearRecs);
    const thisWeekSummary = summarize(thisWeekRecs);
    const lastWeekSummary = summarize(lastWeekRecs);
    const prevYearWeekSummary = summarize(prevYearWeekRecs);

    // 週次比較データ
    const fmtDate = localDateStr;
    const weeklyComparison = {
      thisWeek: {
        period: `${fmtDate(thisWeekStart)} 〜 ${fmtDate(thisWeekEnd)}`,
        ...thisWeekSummary,
      },
      lastWeek: {
        period: `${fmtDate(lastWeekStart)} 〜 ${fmtDate(lastWeekEnd)}`,
        ...lastWeekSummary,
      },
      prevYearWeek: {
        period: `${fmtDate(prevYearWeekStart)} 〜 ${fmtDate(prevYearWeekEnd)}`,
        ...prevYearWeekSummary,
      },
    };

    // 今週の日別人時データ（曜日別）
    const weeklyDailyDetail = (recs: Rec[], weekStart: Date) => {
      const result: { date: string; dow: number; workHours: number; overtimeHours: number; laborCost: number; headcount: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const dateStr = fmtDate(d);
        const dayRecs = recs.filter(r => fmtDate(new Date(r.attendanceDate)) === dateStr);
        const workMin = dayRecs.reduce((s, r) => s + (r.totalWorkMinutes || 0), 0);
        const otMin = dayRecs.reduce((s, r) => s + (r.overtimeMinutes || 0), 0);
        const cost = dayRecs.reduce((s, r) => s + (r.laborCost || 0), 0);
        const hc = new Set(dayRecs.filter(r => (r.totalWorkMinutes || 0) > 0).map(r => r.employeeId)).size;
        result.push({
          date: dateStr,
          dow: (d.getDay() + 6) % 7, // 月=0, 日=6
          workHours: Math.round(workMin / 60 * 10) / 10,
          overtimeHours: Math.round(otMin / 60 * 10) / 10,
          laborCost: cost,
          headcount: hc,
        });
      }
      return result;
    };

    const thisWeekDaily = weeklyDailyDetail(thisWeekRecs, thisWeekStart);
    const lastWeekDaily = weeklyDailyDetail(lastWeekRecs, lastWeekStart);

    // 過去8週のトレンド
    const weeklyTrend: { weekStart: string; weekEnd: string; weekLabel: string; workHours: number; overtimeHours: number; laborCost: number; headcount: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const wStart = new Date(thisWeekStart);
      wStart.setDate(wStart.getDate() - 7 * w);
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 6);
      const wRecs = allRecords.filter(r => inRange(r, wStart, wEnd));
      const workMin = wRecs.reduce((s, r) => s + (r.totalWorkMinutes || 0), 0);
      const otMin = wRecs.reduce((s, r) => s + (r.overtimeMinutes || 0), 0);
      const cost = wRecs.reduce((s, r) => s + (r.laborCost || 0), 0);
      const hc = new Set(wRecs.filter(r => (r.totalWorkMinutes || 0) > 0).map(r => r.employeeId)).size;
      weeklyTrend.push({
        weekStart: fmtDate(wStart),
        weekEnd: fmtDate(wEnd),
        weekLabel: `${wStart.getMonth() + 1}/${wStart.getDate()}〜`,
        workHours: Math.round(workMin / 60 * 10) / 10,
        overtimeHours: Math.round(otMin / 60 * 10) / 10,
        laborCost: cost,
        headcount: hc,
      });
    }

    // 今月の日別集計
    const dailyMap = new Map<string, { date: string; workHours: number; overtimeHours: number; laborCost: number; employees: Set<string>; lateDays: number }>();
    for (const r of thisMonthRecs) {
      const dateStr = localDateStr(new Date(r.attendanceDate));
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, { date: dateStr, workHours: 0, overtimeHours: 0, laborCost: 0, employees: new Set(), lateDays: 0 });
      }
      const d = dailyMap.get(dateStr)!;
      d.workHours += (r.totalWorkMinutes || 0) / 60;
      d.overtimeHours += (r.overtimeMinutes || 0) / 60;
      d.laborCost += r.laborCost || 0;
      if ((r.totalWorkMinutes || 0) > 0) d.employees.add(r.employeeId);
      if ((r.lateMinutes || 0) > 0) d.lateDays++;
    }
    const dailyData = Array.from(dailyMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        date: d.date,
        workHours: Math.round(d.workHours * 10) / 10,
        overtimeHours: Math.round(d.overtimeHours * 10) / 10,
        laborCost: d.laborCost,
        headcount: d.employees.size,
        lateDays: d.lateDays,
      }));

    // 今週の従業員別詳細
    const weeklyByEmployee = new Map<string, {
      empId: string; days: Map<string, { clockIn: string | null; clockOut: string | null; workHours: number; overtime: number }>
    }>();
    for (const r of thisWeekRecs) {
      if (!weeklyByEmployee.has(r.employeeId)) {
        weeklyByEmployee.set(r.employeeId, { empId: r.employeeId, days: new Map() });
      }
      const dateStr = localDateStr(new Date(r.attendanceDate));
      const formatTime = (d: Date | null) => {
        if (!d) return null;
        const dt = new Date(d);
        return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
      };
      weeklyByEmployee.get(r.employeeId)!.days.set(dateStr, {
        clockIn: formatTime(r.clockIn),
        clockOut: formatTime(r.clockOut),
        workHours: Math.round((r.totalWorkMinutes || 0) / 60 * 10) / 10,
        overtime: Math.round((r.overtimeMinutes || 0) / 60 * 10) / 10,
      });
    }

    // 今週の日付リスト
    const weekDates: string[] = [];
    for (let d = new Date(thisWeekStart); d <= thisWeekEnd; d.setDate(d.getDate() + 1)) {
      weekDates.push(localDateStr(d));
    }

    const empMap = new Map(employees.map(e => [e.id, e]));
    const weeklySchedule = Array.from(weeklyByEmployee.values())
      .map(w => {
        const emp = empMap.get(w.empId);
        if (!emp) return null;
        const totalWeekHours = Array.from(w.days.values()).reduce((s, d) => s + d.workHours, 0);
        return {
          code: emp.code,
          name: `${emp.lastName} ${emp.firstName}`,
          employmentType: emp.employmentType,
          totalHours: Math.round(totalWeekHours * 10) / 10,
          days: Object.fromEntries(weekDates.map(date => [date, w.days.get(date) || null])),
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a!.code > b!.code ? 1 : -1));

    // 雇用区分別サマリ（今月）
    const empTypeMap = new Map<string, { type: string; count: number; workHours: number; laborCost: number }>();
    for (const r of thisMonthRecs) {
      const emp = empMap.get(r.employeeId);
      const type = emp?.employmentType || "OTHER";
      if (!empTypeMap.has(type)) {
        empTypeMap.set(type, { type, count: 0, workHours: 0, laborCost: 0 });
      }
      const t = empTypeMap.get(type)!;
      t.workHours += (r.totalWorkMinutes || 0) / 60;
      t.laborCost += r.laborCost || 0;
    }
    // uniqueカウント
    const empTypeUnique = new Map<string, Set<string>>();
    for (const r of thisMonthRecs) {
      const emp = empMap.get(r.employeeId);
      const type = emp?.employmentType || "OTHER";
      if (!empTypeUnique.has(type)) empTypeUnique.set(type, new Set());
      empTypeUnique.get(type)!.add(r.employeeId);
    }
    const byEmploymentType = Array.from(empTypeMap.values()).map(t => ({
      type: t.type,
      count: empTypeUnique.get(t.type)?.size || 0,
      workHours: Math.round(t.workHours * 10) / 10,
      laborCost: t.laborCost,
    }));

    // 選択月内の週リスト（フロントエンド週セレクター用）
    const availableWeeks: { weekStart: string; label: string }[] = [];
    {
      // 月の最初の月曜を求める
      const first = new Date(baseYear, baseMonth, 1);
      const firstDow = first.getDay();
      const firstMondayOff = firstDow === 0 ? -6 : firstDow === 1 ? 0 : 1 - firstDow;
      const firstMonday = new Date(baseYear, baseMonth, 1 + firstMondayOff);
      // 月初より前の月曜なら1日を含む週として採用、そうでなければ翌週から
      let cursor = new Date(firstMonday);
      const monthEndStr = localDateStr(thisMonthEnd);
      while (true) {
        const cursorEnd = new Date(cursor);
        cursorEnd.setDate(cursorEnd.getDate() + 6);
        const wkStartStr = localDateStr(cursor);
        const wkEndStr = localDateStr(cursorEnd);
        // この週が月と重なるなら追加
        if (wkStartStr <= monthEndStr && wkEndStr >= localDateStr(thisMonthStart)) {
          availableWeeks.push({
            weekStart: wkStartStr,
            label: `${cursor.getMonth() + 1}/${cursor.getDate()}〜${cursorEnd.getMonth() + 1}/${cursorEnd.getDate()}`,
          });
        }
        cursor.setDate(cursor.getDate() + 7);
        if (localDateStr(cursor) > monthEndStr) break;
      }
    }

    const result = {
      store: { id: store.id, name: store.name },
      employeeCount: employees.length,
      availableWeeks,
      selectedWeekStart: localDateStr(thisWeekStart),
      thisMonth: {
        period: `${localDateStr(thisMonthStart)} 〜 ${localDateStr(thisMonthEnd)}`,
        ...thisMonthSummary,
      },
      lastMonth: {
        period: `${localDateStr(lastMonthStart)} 〜 ${localDateStr(lastMonthEnd)}`,
        ...lastMonthSummary,
      },
      prevYear: {
        period: `${localDateStr(prevYearStart)} 〜 ${localDateStr(prevYearEnd)}`,
        ...prevYearSummary,
      },
      dailyData,
      weeklyComparison,
      thisWeekDaily,
      lastWeekDaily,
      weeklyTrend,
      weekDates,
      weeklySchedule,
      byEmploymentType,
    };

    // キャッシュに保存（最大50エントリ）
    if (storeCache.size > 50) storeCache.clear();
    storeCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return NextResponse.json(result);
  } catch (e) {
    console.error("store-dashboard error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

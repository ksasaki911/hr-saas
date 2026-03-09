// ダッシュボード用データ集計API（パフォーマンス最適化版）
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getTenantDb } from "@/lib/tenant";
import { NextResponse } from "next/server";

export const maxDuration = 120;

// インメモリキャッシュ（5分TTL）
let cache: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5分

export async function GET() {
  try {
    // キャッシュチェック
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
      return NextResponse.json(cache.data);
    }

    const { db } = await getTenantDb();

    // 店舗一覧
    const stores = await db.store.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    });

    // 従業員サマリ
    const employees = await db.employee.findMany({
      select: {
        id: true,
        storeId: true,
        employmentType: true,
        isActive: true,
        hourlyWage: true,
      },
    });

    // 過去13ヶ月分のみ取得（全件ではなく期間指定）
    const now = new Date();
    const thirteenMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 13, 1);

    const records = await db.attendanceRecord.findMany({
      where: {
        attendanceDate: { gte: thirteenMonthsAgo },
      },
      select: {
        storeId: true,
        employeeId: true,
        attendanceDate: true,
        totalWorkMinutes: true,
        overtimeMinutes: true,
        lateMinutes: true,
        laborCost: true,
      },
    });

    // laborCostがnullのレコードを従業員のhourlyWageから補完
    const empWageMap = new Map<string, number>();
    for (const e of employees) {
      if (e.hourlyWage) empWageMap.set(e.id, e.hourlyWage);
    }
    for (const r of records) {
      if (r.laborCost === null && r.totalWorkMinutes > 0) {
        const wage = empWageMap.get(r.employeeId);
        if (wage) {
          r.laborCost = Math.round((wage * r.totalWorkMinutes) / 60);
        }
      }
    }

    // ローカルタイムゾーン対応の日付ヘルパー
    const localDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    // ===== 1パスで月別＆曜日別を同時集計 =====
    type MonthRow = {
      month: string;
      storeId: string;
      workMinutes: number;
      overtimeMinutes: number;
      laborCost: number;
      attendanceDays: number;
      lateDays: number;
      uniqueEmployees: Set<string>;
    };
    const monthlyMap = new Map<string, MonthRow>();
    const dowMap = new Map<string, { dow: number; storeId: string; workMinutes: number; count: number }>();

    for (const r of records) {
      const d = new Date(r.attendanceDate);
      const dStr = localDateStr(d);
      const month = dStr.substring(0, 7);

      // 月別集計
      const mKey = `${month}|${r.storeId}`;
      if (!monthlyMap.has(mKey)) {
        monthlyMap.set(mKey, {
          month, storeId: r.storeId,
          workMinutes: 0, overtimeMinutes: 0, laborCost: 0,
          attendanceDays: 0, lateDays: 0, uniqueEmployees: new Set(),
        });
      }
      const mRow = monthlyMap.get(mKey)!;
      mRow.workMinutes += r.totalWorkMinutes || 0;
      mRow.overtimeMinutes += r.overtimeMinutes || 0;
      mRow.laborCost += r.laborCost || 0;
      if (r.totalWorkMinutes > 0) {
        mRow.attendanceDays++;
        mRow.uniqueEmployees.add(r.employeeId);
      }
      if (r.lateMinutes > 0) mRow.lateDays++;

      // 曜日別集計（同じループ内で処理）
      if (r.totalWorkMinutes > 0) {
        const dow = d.getDay();
        const dKey = `${dow}|${r.storeId}`;
        if (!dowMap.has(dKey)) {
          dowMap.set(dKey, { dow, storeId: r.storeId, workMinutes: 0, count: 0 });
        }
        const dRow = dowMap.get(dKey)!;
        dRow.workMinutes += r.totalWorkMinutes;
        dRow.count++;
      }
    }

    const monthly = Array.from(monthlyMap.values()).map(r => ({
      month: r.month,
      storeId: r.storeId,
      workHours: Math.round(r.workMinutes / 60 * 10) / 10,
      overtimeHours: Math.round(r.overtimeMinutes / 60 * 10) / 10,
      laborCost: r.laborCost,
      attendanceDays: r.attendanceDays,
      lateDays: r.lateDays,
      uniqueEmployees: r.uniqueEmployees.size,
    }));

    const byDow = Array.from(dowMap.values()).map(r => ({
      dow: r.dow,
      storeId: r.storeId,
      avgHours: Math.round(r.workMinutes / r.count / 60 * 10) / 10,
      totalDays: r.count,
    }));

    // 店舗別従業員構成（事前にstoreIdでグループ化）
    type EmpRow = { storeId: string; isActive: boolean; employmentType: string; id: string; hourlyWage: number | null };
    const storeEmpMap = new Map<string, EmpRow[]>();
    for (const e of employees as EmpRow[]) {
      if (!e.isActive) continue;
      if (!storeEmpMap.has(e.storeId)) storeEmpMap.set(e.storeId, []);
      storeEmpMap.get(e.storeId)!.push(e);
    }

    const storeEmpBreakdown = stores
      .map((s: { id: string; name: string; code: string }) => {
        const storeEmps = storeEmpMap.get(s.id) || [];
        if (storeEmps.length === 0) return null;
        let ft = 0, pt = 0, ab = 0, ct = 0;
        for (const e of storeEmps) {
          if (e.employmentType === "FULL_TIME") ft++;
          else if (e.employmentType === "PART_TIME") pt++;
          else if (e.employmentType === "ARBEIT") ab++;
          else if (e.employmentType === "CONTRACT") ct++;
        }
        return {
          storeId: s.id, storeName: s.name,
          fullTime: ft, partTime: pt, arbeit: ab, contract: ct,
          total: storeEmps.length,
        };
      })
      .filter(Boolean);

    const result = {
      stores: stores.map((s: any) => ({ id: s.id, name: s.name, code: s.code })),
      summary: {
        totalEmployees: (employees as any[]).filter((e: any) => e.isActive).length,
        totalStores: stores.length,
        totalRecords: records.length,
        dateRange: {
          from: records.length > 0 ? records.reduce((min: any, r: any) => r.attendanceDate < min ? r.attendanceDate : min, records[0].attendanceDate) : null,
          to: records.length > 0 ? records.reduce((max: any, r: any) => r.attendanceDate > max ? r.attendanceDate : max, records[0].attendanceDate) : null,
        },
      },
      monthly,
      byDow,
      storeEmpBreakdown,
    };

    // キャッシュに保存
    cache = { data: result, timestamp: Date.now() };

    return NextResponse.json(result);
  } catch (e) {
    console.error("dashboard-data error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

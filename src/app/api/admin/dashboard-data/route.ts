// ダッシュボード用データ集計API
import { getTenantDb } from "@/lib/tenant";
import { NextResponse } from "next/server";

export const maxDuration = 120;

export async function GET() {
  try {
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

    // 勤怠レコード全件（集計用フィールドのみ）
    const records = await db.attendanceRecord.findMany({
      select: {
        storeId: true,
        employeeId: true,
        attendanceDate: true,
        totalWorkMinutes: true,
        overtimeMinutes: true,
        lateMinutes: true,
        earlyLeaveMinutes: true,
        laborCost: true,
        status: true,
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

    // ===== 集計 =====

    // 月別集計
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

    for (const r of records) {
      const dStr = localDateStr(new Date(r.attendanceDate));
      const month = dStr.substring(0, 7);
      const key = `${month}|${r.storeId}`;

      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, {
          month,
          storeId: r.storeId,
          workMinutes: 0,
          overtimeMinutes: 0,
          laborCost: 0,
          attendanceDays: 0,
          lateDays: 0,
          uniqueEmployees: new Set(),
        });
      }
      const row = monthlyMap.get(key)!;
      row.workMinutes += r.totalWorkMinutes || 0;
      row.overtimeMinutes += r.overtimeMinutes || 0;
      row.laborCost += r.laborCost || 0;
      if (r.totalWorkMinutes > 0) {
        row.attendanceDays++;
        row.uniqueEmployees.add(r.employeeId);
      }
      if (r.lateMinutes > 0) row.lateDays++;
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

    // 曜日別集計
    const dowMap = new Map<string, { dow: number; storeId: string; workMinutes: number; count: number }>();
    for (const r of records) {
      if (r.totalWorkMinutes <= 0) continue;
      const dow = new Date(r.attendanceDate).getDay();
      const key = `${dow}|${r.storeId}`;
      if (!dowMap.has(key)) {
        dowMap.set(key, { dow, storeId: r.storeId, workMinutes: 0, count: 0 });
      }
      const row = dowMap.get(key)!;
      row.workMinutes += r.totalWorkMinutes;
      row.count++;
    }
    const byDow = Array.from(dowMap.values()).map(r => ({
      dow: r.dow,
      storeId: r.storeId,
      avgHours: Math.round(r.workMinutes / r.count / 60 * 10) / 10,
      totalDays: r.count,
    }));

    // 店舗別従業員構成
    const storeEmpBreakdown = stores.map(s => {
      const storeEmps = employees.filter(e => e.storeId === s.id && e.isActive);
      return {
        storeId: s.id,
        storeName: s.name,
        fullTime: storeEmps.filter(e => e.employmentType === "FULL_TIME").length,
        partTime: storeEmps.filter(e => e.employmentType === "PART_TIME").length,
        arbeit: storeEmps.filter(e => e.employmentType === "ARBEIT").length,
        contract: storeEmps.filter(e => e.employmentType === "CONTRACT").length,
        total: storeEmps.length,
      };
    }).filter(s => s.total > 0);

    return NextResponse.json({
      stores: stores.map(s => ({ id: s.id, name: s.name, code: s.code })),
      summary: {
        totalEmployees: employees.filter(e => e.isActive).length,
        totalStores: stores.length,
        totalRecords: records.length,
        dateRange: {
          from: records.length > 0 ? records.reduce((min, r) => r.attendanceDate < min ? r.attendanceDate : min, records[0].attendanceDate) : null,
          to: records.length > 0 ? records.reduce((max, r) => r.attendanceDate > max ? r.attendanceDate : max, records[0].attendanceDate) : null,
        },
      },
      monthly,
      byDow,
      storeEmpBreakdown,
    });
  } catch (e) {
    console.error("dashboard-data error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// =============================================================
// 月次勤怠集計 API
// GET /api/attendance/monthly-summary - 月次集計取得
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const url = new URL(request.url);

    const yearMonth = url.searchParams.get("yearMonth"); // "2026-03"
    const employeeId = url.searchParams.get("employeeId");

    if (!yearMonth) {
      return apiError("yearMonthは必須です（例: 2026-03）", 400);
    }

    // 月の開始日・終了日を計算
    const [year, month] = yearMonth.split("-").map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // 月末

    const where: Record<string, unknown> = {
      attendanceDate: {
        gte: startDate,
        lte: endDate,
      },
    };
    if (employeeId) where.employeeId = employeeId;

    const records = await db.attendanceRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            lastName: true,
            firstName: true,
            employmentType: true,
            hourlyWage: true,
          },
        },
      },
      orderBy: [{ employeeId: "asc" }, { attendanceDate: "asc" }],
    });

    // 従業員ごとに集計
    const employeeMap = new Map<string, {
      employee: { id: string; code: string; lastName: string; firstName: string; employmentType: string; hourlyWage: number | null };
      totalWorkDays: number;
      totalWorkHours: number;
      totalOvertimeHours: number;
      totalLateDays: number;
      totalAbsentDays: number;
      totalEarlyLeaveDays: number;
      totalLaborCost: number;
    }>();

    for (const r of records) {
      const emp = r.employee;
      if (!employeeMap.has(emp.id)) {
        employeeMap.set(emp.id, {
          employee: emp,
          totalWorkDays: 0,
          totalWorkHours: 0,
          totalOvertimeHours: 0,
          totalLateDays: 0,
          totalAbsentDays: 0,
          totalEarlyLeaveDays: 0,
          totalLaborCost: 0,
        });
      }

      const summary = employeeMap.get(emp.id)!;

      if (["CLOCKED_OUT", "LATE", "EARLY_LEAVE", "APPROVED"].includes(r.status)) {
        summary.totalWorkDays++;
      }
      summary.totalWorkHours += r.totalWorkMinutes / 60;
      summary.totalOvertimeHours += r.overtimeMinutes / 60;
      if (r.lateMinutes > 0) summary.totalLateDays++;
      if (r.status === "ABSENT") summary.totalAbsentDays++;
      if (r.earlyLeaveMinutes > 0) summary.totalEarlyLeaveDays++;

      // laborCostがnullの場合、hourlyWageから補完計算
      let cost = r.laborCost;
      if (cost === null && r.totalWorkMinutes > 0 && emp.hourlyWage) {
        cost = Math.round((emp.hourlyWage * r.totalWorkMinutes) / 60);
      }
      summary.totalLaborCost += cost || 0;
    }

    // 数値の丸め
    const summaries = Array.from(employeeMap.values()).map((s) => ({
      ...s,
      yearMonth,
      totalWorkHours: Math.round(s.totalWorkHours * 10) / 10,
      totalOvertimeHours: Math.round(s.totalOvertimeHours * 10) / 10,
    }));

    // 社員番号順
    summaries.sort((a, b) => a.employee.code.localeCompare(b.employee.code));

    return apiSuccess(summaries);
  } catch (error) {
    console.error("GET /api/attendance/monthly-summary error:", error);
    return apiError("月次集計の取得に失敗しました", 500);
  }
}

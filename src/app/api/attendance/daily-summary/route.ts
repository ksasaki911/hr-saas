// =============================================================
// 日次勤怠集計 API
// GET /api/attendance/daily-summary - 日次集計取得
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const url = new URL(request.url);

    const date = url.searchParams.get("date");
    const storeId = url.searchParams.get("storeId");

    if (!date) {
      return apiError("dateは必須です", 400);
    }

    const targetDate = new Date(date);

    // 該当日の全打刻を集計
    const where: Record<string, unknown> = { attendanceDate: targetDate };
    if (storeId) where.storeId = storeId;

    const records = await db.attendanceRecord.findMany({ where });

    // シフト予定者数（該当日のシフト数）
    const shiftWhere: Record<string, unknown> = { shiftDate: targetDate };
    if (storeId) shiftWhere.storeId = storeId;
    const totalShifts = await db.shift.count({ where: shiftWhere });

    const summary = {
      date,
      totalEmployees: totalShifts,
      totalPresent: records.filter((r: { status: string }) =>
        ["CLOCKED_IN", "CLOCKED_OUT", "LATE", "EARLY_LEAVE", "APPROVED"].includes(r.status)
      ).length,
      totalAbsent: records.filter((r: { status: string }) => r.status === "ABSENT").length,
      totalLate: records.filter((r: { status: string; lateMinutes: number }) =>
        r.status === "LATE" || r.lateMinutes > 0
      ).length,
      totalEarlyLeave: records.filter((r: { status: string; earlyLeaveMinutes: number }) =>
        r.status === "EARLY_LEAVE" || r.earlyLeaveMinutes > 0
      ).length,
      totalWorkHours: Math.round(
        records.reduce((sum: number, r: { totalWorkMinutes: number }) => sum + r.totalWorkMinutes, 0) / 60 * 10
      ) / 10,
      totalOvertimeHours: Math.round(
        records.reduce((sum: number, r: { overtimeMinutes: number }) => sum + r.overtimeMinutes, 0) / 60 * 10
      ) / 10,
      totalLaborCost: records.reduce(
        (sum: number, r: { laborCost: number | null }) => sum + (r.laborCost || 0), 0
      ),
      records,
    };

    return apiSuccess(summary);
  } catch (error) {
    console.error("GET /api/attendance/daily-summary error:", error);
    return apiError("日次集計の取得に失敗しました", 500);
  }
}

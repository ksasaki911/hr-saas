// =============================================================
// 退勤打刻 API
// POST /api/attendance/clock-out - 従業員IDで退勤打刻
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { attendanceClockOutSchema } from "@/lib/validations/attendance";
import { apiSuccess, apiError, apiValidationError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const body = await request.json();

    const parsed = attendanceClockOutSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    const data = parsed.data;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 本日の出勤中レコードを検索
    const record = await db.attendanceRecord.findFirst({
      where: {
        employeeId: data.employeeId,
        attendanceDate: today,
        clockOut: null,
      },
      include: {
        employee: { select: { hourlyWage: true } },
        shift: { select: { startTime: true, endTime: true, breakMinutes: true } },
      },
    });

    if (!record) {
      return apiError("本日の出勤記録が見つかりません", 404);
    }

    const clockOutTime = data.clockOut ? new Date(data.clockOut) : new Date();
    const breakMin = data.actualBreakMinutes ?? record.shift?.breakMinutes ?? record.actualBreakMinutes;

    // 労働時間計算
    const totalMinutes = Math.floor((clockOutTime.getTime() - record.clockIn!.getTime()) / 60000);
    const workMinutes = Math.max(0, totalMinutes - breakMin);

    // 残業計算
    let overtimeMinutes = 0;
    if (record.shift) {
      const [endH, endM] = record.shift.endTime.split(":").map(Number);
      const scheduledEnd = new Date(clockOutTime);
      scheduledEnd.setHours(endH, endM, 0, 0);
      if (clockOutTime > scheduledEnd) {
        overtimeMinutes = Math.ceil((clockOutTime.getTime() - scheduledEnd.getTime()) / 60000);
      }
    }

    // 早退判定
    let earlyLeaveMinutes = 0;
    if (record.shift) {
      const [endH, endM] = record.shift.endTime.split(":").map(Number);
      const scheduledEnd = new Date(clockOutTime);
      scheduledEnd.setHours(endH, endM, 0, 0);
      if (clockOutTime < scheduledEnd) {
        earlyLeaveMinutes = Math.ceil((scheduledEnd.getTime() - clockOutTime.getTime()) / 60000);
      }
    }

    // 人件費
    let laborCost: number | null = null;
    if (record.employee?.hourlyWage) {
      laborCost = Math.round((record.employee.hourlyWage * workMinutes) / 60);
    }

    // ステータス決定
    let status: string = "CLOCKED_OUT";
    if (earlyLeaveMinutes > 0) status = "EARLY_LEAVE";
    if (record.lateMinutes > 0 && earlyLeaveMinutes === 0) status = "CLOCKED_OUT";

    const updated = await db.attendanceRecord.update({
      where: { id: record.id },
      data: {
        clockOut: clockOutTime,
        breakStartTime: data.breakStartTime,
        breakEndTime: data.breakEndTime,
        actualBreakMinutes: breakMin,
        totalWorkMinutes: workMinutes,
        overtimeMinutes,
        earlyLeaveMinutes,
        laborCost,
        status,
        note: data.note || record.note,
      },
      include: {
        employee: {
          select: {
            id: true, code: true, lastName: true, firstName: true,
            employmentType: true, hourlyWage: true, departmentId: true,
          },
        },
        shift: {
          select: { id: true, startTime: true, endTime: true, breakMinutes: true },
        },
      },
    });

    return apiSuccess(updated);
  } catch (error) {
    console.error("POST /api/attendance/clock-out error:", error);
    return apiError("退勤打刻に失敗しました", 500);
  }
}

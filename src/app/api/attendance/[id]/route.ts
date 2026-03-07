// =============================================================
// 勤怠個別 API
// GET   /api/attendance/[id] - 詳細取得
// PATCH /api/attendance/[id] - 修正・退勤打刻
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { attendanceUpdateSchema } from "@/lib/validations/attendance";
import { apiSuccess, apiError, apiValidationError } from "@/lib/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await getTenantDb();
    const { id } = await params;

    const record = await db.attendanceRecord.findFirst({
      where: { id },
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

    if (!record) {
      return apiError("勤怠記録が見つかりません", 404);
    }

    return apiSuccess(record);
  } catch (error) {
    console.error("GET /api/attendance/[id] error:", error);
    return apiError("勤怠記録の取得に失敗しました", 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await getTenantDb();
    const { id } = await params;
    const body = await request.json();

    const parsed = attendanceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    const existing = await db.attendanceRecord.findFirst({
      where: { id },
      include: {
        employee: { select: { hourlyWage: true } },
        shift: { select: { startTime: true, endTime: true, breakMinutes: true } },
      },
    });

    if (!existing) {
      return apiError("勤怠記録が見つかりません", 404);
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (data.clockIn !== undefined) updateData.clockIn = new Date(data.clockIn);
    if (data.clockOut !== undefined) updateData.clockOut = new Date(data.clockOut);
    if (data.breakStartTime !== undefined) updateData.breakStartTime = data.breakStartTime;
    if (data.breakEndTime !== undefined) updateData.breakEndTime = data.breakEndTime;
    if (data.actualBreakMinutes !== undefined) updateData.actualBreakMinutes = data.actualBreakMinutes;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.note !== undefined) updateData.note = data.note;

    // 退勤打刻の場合は労働時間・残業・人件費を自動計算
    const clockOut = data.clockOut ? new Date(data.clockOut) : existing.clockOut;
    const clockIn = data.clockIn ? new Date(data.clockIn) : existing.clockIn;

    if (clockIn && clockOut) {
      const breakMin = data.actualBreakMinutes ?? existing.actualBreakMinutes;
      const totalMinutes = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
      const workMinutes = Math.max(0, totalMinutes - breakMin);
      updateData.totalWorkMinutes = workMinutes;

      // 残業計算（シフトの予定時間を超えた分）
      if (existing.shift) {
        const [endH, endM] = existing.shift.endTime.split(":").map(Number);
        const scheduledEnd = new Date(clockOut);
        scheduledEnd.setHours(endH, endM, 0, 0);
        if (clockOut > scheduledEnd) {
          updateData.overtimeMinutes = Math.ceil((clockOut.getTime() - scheduledEnd.getTime()) / 60000);
        }
      }

      // 早退判定
      if (existing.shift && data.clockOut) {
        const [endH, endM] = existing.shift.endTime.split(":").map(Number);
        const scheduledEnd = new Date(new Date(data.clockOut));
        scheduledEnd.setHours(endH, endM, 0, 0);
        if (new Date(data.clockOut) < scheduledEnd) {
          const earlyMin = Math.ceil((scheduledEnd.getTime() - new Date(data.clockOut).getTime()) / 60000);
          updateData.earlyLeaveMinutes = earlyMin;
        }
      }

      // 人件費計算
      if (existing.employee?.hourlyWage) {
        updateData.laborCost = Math.round((existing.employee.hourlyWage * workMinutes) / 60);
      }

      // ステータス更新
      if (!data.status) {
        if ((updateData.earlyLeaveMinutes as number) > 0) {
          updateData.status = "EARLY_LEAVE";
        } else {
          updateData.status = "CLOCKED_OUT";
        }
      }
    }

    const record = await db.attendanceRecord.update({
      where: { id },
      data: updateData,
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

    return apiSuccess(record);
  } catch (error) {
    console.error("PATCH /api/attendance/[id] error:", error);
    return apiError("勤怠記録の更新に失敗しました", 500);
  }
}

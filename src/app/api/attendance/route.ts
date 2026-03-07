// =============================================================
// 勤怠打刻 API
// GET  /api/attendance - 打刻一覧取得
// POST /api/attendance - 出勤打刻
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { attendanceClockInSchema } from "@/lib/validations/attendance";
import { apiSuccess, apiError, apiValidationError, apiPaginated } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const url = new URL(request.url);

    const storeId = url.searchParams.get("storeId");
    const attendanceDate = url.searchParams.get("date");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const employeeId = url.searchParams.get("employeeId");
    const status = url.searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (storeId) where.storeId = storeId;
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    if (attendanceDate) {
      // PostgreSQL DATE型に合わせてUTC基準で日付を作成
      where.attendanceDate = new Date(attendanceDate + "T00:00:00.000Z");
    } else if (startDate && endDate) {
      where.attendanceDate = {
        gte: new Date(startDate + "T00:00:00.000Z"),
        lte: new Date(endDate + "T23:59:59.999Z"),
      };
    }

    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "100");

    const [records, total] = await Promise.all([
      db.attendanceRecord.findMany({
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
              departmentId: true,
            },
          },
          shift: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
              breakMinutes: true,
            },
          },
        },
        orderBy: [{ attendanceDate: "desc" }, { clockIn: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.attendanceRecord.count({ where }),
    ]);

    return apiPaginated(records, total, page, limit);
  } catch (error) {
    console.error("GET /api/attendance error:", error);
    return apiError("勤怠記録の取得に失敗しました", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const body = await request.json();

    const parsed = attendanceClockInSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    const data = parsed.data;
    const clockInTime = data.clockIn ? new Date(data.clockIn) : new Date();

    // 同日の重複チェック
    const existing = await db.attendanceRecord.findFirst({
      where: {
        employeeId: data.employeeId,
        attendanceDate: new Date(data.attendanceDate),
      },
    });

    if (existing) {
      return apiError("この従業員は本日既に打刻済みです", 409);
    }

    // シフトとの比較で遅刻判定
    let lateMinutes = 0;
    if (data.shiftId) {
      const shift = await db.shift.findFirst({
        where: { id: data.shiftId },
      });
      if (shift) {
        const [shiftH, shiftM] = shift.startTime.split(":").map(Number);
        const shiftStart = new Date(clockInTime);
        shiftStart.setHours(shiftH, shiftM, 0, 0);
        if (clockInTime > shiftStart) {
          lateMinutes = Math.ceil((clockInTime.getTime() - shiftStart.getTime()) / 60000);
        }
      }
    }

    const record = await db.attendanceRecord.create({
      data: {
        employeeId: data.employeeId,
        storeId: data.storeId,
        shiftId: data.shiftId,
        attendanceDate: new Date(data.attendanceDate),
        clockIn: clockInTime,
        status: lateMinutes > 0 ? "LATE" : "CLOCKED_IN",
        lateMinutes,
        note: data.note,
      },
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            lastName: true,
            firstName: true,
            employmentType: true,
            hourlyWage: true,
            departmentId: true,
          },
        },
        shift: {
          select: { id: true, startTime: true, endTime: true, breakMinutes: true },
        },
      },
    });

    return apiSuccess(record, 201);
  } catch (error) {
    console.error("POST /api/attendance error:", error);
    return apiError("出勤打刻に失敗しました", 500);
  }
}

// =============================================================
// 休暇申請 API
// GET  /api/leave-requests - 休暇申請一覧
// POST /api/leave-requests - 休暇申請作成
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { leaveRequestCreateSchema } from "@/lib/validations/attendance";
import { apiSuccess, apiError, apiValidationError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const url = new URL(request.url);

    const employeeId = url.searchParams.get("employeeId");
    const status = url.searchParams.get("status");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;
    if (startDate && endDate) {
      where.startDate = { gte: new Date(startDate) };
      where.endDate = { lte: new Date(endDate) };
    }

    const requests = await db.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            lastName: true,
            firstName: true,
            employmentType: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return apiSuccess(requests);
  } catch (error) {
    console.error("GET /api/leave-requests error:", error);
    return apiError("休暇申請の取得に失敗しました", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const body = await request.json();

    const parsed = leaveRequestCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    const data = parsed.data;

    // 同期間の重複チェック
    const existing = await db.leaveRequest.findFirst({
      where: {
        employeeId: data.employeeId,
        status: { not: "REJECTED" },
        OR: [
          {
            startDate: { lte: new Date(data.endDate) },
            endDate: { gte: new Date(data.startDate) },
          },
        ],
      },
    });

    if (existing) {
      return apiError("この期間に既に休暇申請があります", 409);
    }

    // 日数計算
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const diffTime = end.getTime() - start.getTime();
    const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const leaveRequest = await db.leaveRequest.create({
      data: {
        employeeId: data.employeeId,
        leaveType: data.leaveType,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        totalDays,
        reason: data.reason,
        status: "PENDING",
      },
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            lastName: true,
            firstName: true,
            employmentType: true,
          },
        },
      },
    });

    return apiSuccess(leaveRequest, 201);
  } catch (error) {
    console.error("POST /api/leave-requests error:", error);
    return apiError("休暇申請の作成に失敗しました", 500);
  }
}

// =============================================================
// 休暇申請 詳細・承認・却下 API
// GET   /api/leave-requests/[id] - 詳細取得
// PATCH /api/leave-requests/[id] - 承認/却下
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { leaveRequestUpdateSchema } from "@/lib/validations/attendance";
import { apiSuccess, apiError, apiValidationError } from "@/lib/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await getTenantDb();
    const { id } = await params;

    const leaveRequest = await db.leaveRequest.findUnique({
      where: { id },
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

    if (!leaveRequest) {
      return apiError("休暇申請が見つかりません", 404);
    }

    return apiSuccess(leaveRequest);
  } catch (error) {
    console.error("GET /api/leave-requests/[id] error:", error);
    return apiError("休暇申請の取得に失敗しました", 500);
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

    const parsed = leaveRequestUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    // 存在確認
    const existing = await db.leaveRequest.findUnique({
      where: { id },
    });

    if (!existing) {
      return apiError("休暇申請が見つかりません", 404);
    }

    if (existing.status !== "PENDING") {
      return apiError("この申請は既に処理済みです", 400);
    }

    const updated = await db.leaveRequest.update({
      where: { id },
      data: {
        status: parsed.data.status,
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

    return apiSuccess(updated);
  } catch (error) {
    console.error("PATCH /api/leave-requests/[id] error:", error);
    return apiError("休暇申請の更新に失敗しました", 500);
  }
}

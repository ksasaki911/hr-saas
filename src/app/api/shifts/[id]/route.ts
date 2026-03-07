// =============================================================
// シフト個別操作 API
// GET    /api/shifts/[id] - シフト詳細取得
// PATCH  /api/shifts/[id] - シフト更新
// DELETE /api/shifts/[id] - シフト削除
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { shiftUpdateSchema } from "@/lib/validations/shift";
import { apiSuccess, apiError, apiValidationError } from "@/lib/api-response";

type RouteParams = { params: Promise<{ id: string }> };

// シフト詳細取得
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { db } = await getTenantDb();
    const { id } = await params;

    const shift = await db.shift.findFirst({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            lastName: true,
            firstName: true,
            employmentType: true,
            hourlyWage: true,
            phone: true,
          },
        },
        department: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    if (!shift) {
      return apiError("シフトが見つかりません", 404);
    }

    return apiSuccess(shift);
  } catch (error) {
    console.error("GET /api/shifts/[id] error:", error);
    return apiError("シフトの取得に失敗しました", 500);
  }
}

// シフト更新
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { db } = await getTenantDb();
    const { id } = await params;
    const body = await request.json();

    const parsed = shiftUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    // 対象シフトの存在確認
    const existing = await db.shift.findFirst({ where: { id } });
    if (!existing) {
      return apiError("シフトが見つかりません", 404);
    }

    // 確定済みシフトの変更はステータスをCHANGEDに
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (existing.status === "CONFIRMED") {
      updateData.status = "CHANGED";
    }

    // 日付フィールドの変換
    if (updateData.shiftDate) {
      updateData.shiftDate = new Date(updateData.shiftDate as string);
    }

    // 人件費再計算（時刻変更時）
    if (updateData.startTime || updateData.endTime || updateData.breakMinutes !== undefined) {
      const employee = await db.employee.findFirst({
        where: { id: existing.employeeId },
      });
      if (employee?.hourlyWage) {
        const startTime = (updateData.startTime as string) || existing.startTime;
        const endTime = (updateData.endTime as string) || existing.endTime;
        const breakMin =
          (updateData.breakMinutes as number) ?? existing.breakMinutes;
        const [sH, sM] = startTime.split(":").map(Number);
        const [eH, eM] = endTime.split(":").map(Number);
        const workMinutes = eH * 60 + eM - (sH * 60 + sM) - breakMin;
        updateData.laborCost = Math.round(
          (employee.hourlyWage * workMinutes) / 60
        );
      }
    }

    const shift = await db.shift.update({
      where: { id },
      data: updateData,
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
        department: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    return apiSuccess(shift);
  } catch (error) {
    console.error("PATCH /api/shifts/[id] error:", error);
    return apiError("シフトの更新に失敗しました", 500);
  }
}

// シフト削除
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { db } = await getTenantDb();
    const { id } = await params;

    const existing = await db.shift.findFirst({ where: { id } });
    if (!existing) {
      return apiError("シフトが見つかりません", 404);
    }

    // 確定済みは削除不可
    if (existing.status === "CONFIRMED") {
      return apiError("確定済みシフトは削除できません。先にステータスを変更してください。", 400);
    }

    await db.shift.delete({ where: { id } });
    return apiSuccess({ deleted: true });
  } catch (error) {
    console.error("DELETE /api/shifts/[id] error:", error);
    return apiError("シフトの削除に失敗しました", 500);
  }
}

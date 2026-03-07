// =============================================================
// シフト一括操作 API
// POST /api/shifts/bulk - 一括作成（週間シフト投入）
// PATCH /api/shifts/bulk - 一括ステータス更新（公開・確定）
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { shiftBulkCreateSchema } from "@/lib/validations/shift";
import { apiSuccess, apiError, apiValidationError } from "@/lib/api-response";
import { z } from "zod";

// 一括作成
export async function POST(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const body = await request.json();

    const parsed = shiftBulkCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    const { shifts } = parsed.data;

    // 従業員IDリストを取得して時給を一括取得
    const employeeIds = [...new Set(shifts.map((s) => s.employeeId))];
    const employees = await db.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, hourlyWage: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wageMap = new Map(employees.map((e: any) => [e.id, e.hourlyWage]));

    // 人件費計算しつつデータ整形
    const shiftData = shifts.map((s) => {
      const wage = wageMap.get(s.employeeId) as number | null;
      let laborCost: number | null = null;
      if (wage && typeof wage === "number") {
        const [sH, sM] = s.startTime.split(":").map(Number);
        const [eH, eM] = s.endTime.split(":").map(Number);
        const workMin = eH * 60 + eM - (sH * 60 + sM) - s.breakMinutes;
        laborCost = Math.round((wage * workMin) / 60);
      }
      return {
        employeeId: s.employeeId,
        storeId: s.storeId,
        departmentId: s.departmentId,
        shiftDate: new Date(s.shiftDate),
        startTime: s.startTime,
        endTime: s.endTime,
        breakMinutes: s.breakMinutes,
        isHelpShift: s.isHelpShift,
        note: s.note,
        laborCost,
      };
    });

    const result = await db.shift.createMany({
      data: shiftData,
      skipDuplicates: true,
    });

    return apiSuccess(
      { created: result.count, total: shifts.length },
      201
    );
  } catch (error) {
    console.error("POST /api/shifts/bulk error:", error);
    return apiError("一括シフト作成に失敗しました", 500);
  }
}

// 草案シフト一括削除
export async function DELETE(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const body = await request.json().catch(() => ({}));
    const status = body.status || "DRAFT";

    const result = await db.shift.deleteMany({
      where: { status },
    });

    return apiSuccess({ deleted: result.count });
  } catch (error) {
    console.error("DELETE /api/shifts/bulk error:", error);
    return apiError("一括削除に失敗しました", 500);
  }
}

// 一括ステータス更新
const bulkStatusSchema = z.object({
  shiftIds: z.array(z.string().uuid()).min(1).max(500),
  status: z.enum(["DRAFT", "PUBLISHED", "CONFIRMED"]),
  approvedBy: z.string().uuid().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const body = await request.json();

    const parsed = bulkStatusSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    const { shiftIds, status, approvedBy } = parsed.data;

    const updateData: Record<string, unknown> = { status };
    if (status === "CONFIRMED" && approvedBy) {
      updateData.approvedBy = approvedBy;
      updateData.approvedAt = new Date();
    }

    const result = await db.shift.updateMany({
      where: { id: { in: shiftIds } },
      data: updateData,
    });

    return apiSuccess({ updated: result.count });
  } catch (error) {
    console.error("PATCH /api/shifts/bulk error:", error);
    return apiError("一括ステータス更新に失敗しました", 500);
  }
}

// =============================================================
// 必要人員マスタ API
// GET  /api/staffing-requirements - 一覧取得
// POST /api/staffing-requirements - 登録・更新
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { staffingRequirementSchema } from "@/lib/validations/shift";
import { apiSuccess, apiError, apiValidationError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const url = new URL(request.url);

    const storeId = url.searchParams.get("storeId");
    const departmentId = url.searchParams.get("departmentId");

    const where: Record<string, unknown> = {};
    if (storeId) where.storeId = storeId;
    if (departmentId) where.departmentId = departmentId;

    const requirements = await db.staffingRequirement.findMany({
      where,
      include: {
        department: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: [
        { departmentId: "asc" },
        { dayOfWeek: "asc" },
        { timeSlot: "asc" },
      ],
    });

    return apiSuccess(requirements);
  } catch (error) {
    console.error("GET /api/staffing-requirements error:", error);
    return apiError("必要人員の取得に失敗しました", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const body = await request.json();

    const parsed = staffingRequirementSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    const data = parsed.data;

    const requirement = await db.staffingRequirement.create({
      data: {
        storeId: data.storeId,
        departmentId: data.departmentId,
        dayOfWeek: data.dayOfWeek,
        timeSlot: data.timeSlot,
        minStaff: data.minStaff,
        idealStaff: data.idealStaff,
        isHoliday: data.isHoliday,
      },
      include: {
        department: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    return apiSuccess(requirement, 201);
  } catch (error) {
    console.error("POST /api/staffing-requirements error:", error);
    return apiError("必要人員の登録に失敗しました", 500);
  }
}

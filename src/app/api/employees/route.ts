// =============================================================
// 従業員 API（シフト管理画面で使用する一覧取得）
// GET /api/employees - 従業員一覧
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError, apiPaginated } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const url = new URL(request.url);

    const storeId = url.searchParams.get("storeId");
    const departmentId = url.searchParams.get("departmentId");
    const search = url.searchParams.get("search");
    const activeOnly = url.searchParams.get("activeOnly") !== "false";

    const where: Record<string, unknown> = { isActive: activeOnly };
    if (storeId) where.storeId = storeId;
    if (departmentId) where.departmentId = departmentId;
    if (search) {
      where.OR = [
        { lastName: { contains: search } },
        { firstName: { contains: search } },
        { code: { contains: search } },
      ];
    }

    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "50");

    const [employees, total] = await Promise.all([
      db.employee.findMany({
        where,
        select: {
          id: true,
          code: true,
          lastName: true,
          firstName: true,
          employmentType: true,
          storeId: true,
          departmentId: true,
          hourlyWage: true,
          maxHoursPerWeek: true,
          canWorkDepts: true,
          skills: true,
        },
        orderBy: { code: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.employee.count({ where }),
    ]);

    return apiPaginated(employees, total, page, limit);
  } catch (error) {
    console.error("GET /api/employees error:", error);
    return apiError("従業員の取得に失敗しました", 500);
  }
}

// =============================================================
// 月間シフトパターン API
// GET  /api/shift-patterns - パターン一覧（従業員別）
// POST /api/shift-patterns - パターン一括登録・更新
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const url = new URL(request.url);

    const employeeId = url.searchParams.get("employeeId");
    const storeId = url.searchParams.get("storeId");

    const where: Record<string, unknown> = { isActive: true };
    if (employeeId) where.employeeId = employeeId;
    if (storeId) where.storeId = storeId;

    const patterns = await db.shiftPattern.findMany({
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
            maxHoursPerWeek: true,
          },
        },
      },
      orderBy: [{ employeeId: "asc" }, { dayOfWeek: "asc" }],
    });

    return apiSuccess(patterns);
  } catch (error) {
    console.error("GET /api/shift-patterns error:", error);
    return apiError("シフトパターンの取得に失敗しました", 500);
  }
}

// 従業員の曜日別パターンを一括保存（7曜日分まとめて）
export async function POST(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const body = await request.json();

    const { employeeId, storeId, patterns } = body as {
      employeeId: string;
      storeId: string;
      patterns: {
        dayOfWeek: number;
        requestType: string;
        startTime?: string | null;
        endTime?: string | null;
      }[];
    };

    if (!employeeId || !storeId || !Array.isArray(patterns)) {
      return apiError("employeeId, storeId, patterns は必須です", 400);
    }

    // 全曜日を一括upsert
    const results = [];
    for (const p of patterns) {
      const result = await db.shiftPattern.upsert({
        where: {
          tenantId_employeeId_dayOfWeek: {
            tenantId: "", // テナントスコープで自動注入される
            employeeId,
            dayOfWeek: p.dayOfWeek,
          },
        },
        update: {
          requestType: p.requestType,
          startTime: p.startTime || null,
          endTime: p.endTime || null,
          storeId,
          isActive: true,
        },
        create: {
          employeeId,
          storeId,
          dayOfWeek: p.dayOfWeek,
          requestType: p.requestType,
          startTime: p.startTime || null,
          endTime: p.endTime || null,
        },
      });
      results.push(result);
    }

    return apiSuccess(results);
  } catch (error) {
    console.error("POST /api/shift-patterns error:", error);
    return apiError("シフトパターンの保存に失敗しました", 500);
  }
}

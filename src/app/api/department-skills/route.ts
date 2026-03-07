// =============================================================
// 部門別必須スキル API
// GET  - 一覧取得（departmentId でフィルタ可）
// POST - 一括登録/更新
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const url = new URL(request.url);
    const departmentId = url.searchParams.get("departmentId");

    const where: Record<string, unknown> = {};
    if (departmentId) where.departmentId = departmentId;

    const requirements = await db.departmentSkillRequirement.findMany({
      where,
      include: { department: { select: { id: true, code: true, name: true } } },
      orderBy: [{ departmentId: "asc" }, { isRequired: "desc" }, { skillName: "asc" }],
    });

    return apiSuccess(requirements);
  } catch (error) {
    console.error("GET /api/department-skills error:", error);
    return apiError("部門スキル要件の取得に失敗しました", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, tenantId } = await getTenantDb();
    const body = await request.json();

    // body: { departmentId, skills: [{ skillName, isRequired, description }] }
    const { departmentId, skills } = body;

    if (!departmentId || !Array.isArray(skills)) {
      return apiError("departmentId と skills[] が必要です", 400);
    }

    // 既存を全削除して再作成
    await db.departmentSkillRequirement.deleteMany({
      where: { departmentId },
    });

    if (skills.length > 0) {
      await db.departmentSkillRequirement.createMany({
        data: skills.map((s: { skillName: string; isRequired?: boolean; description?: string }) => ({
          tenantId,
          departmentId,
          skillName: s.skillName,
          isRequired: s.isRequired !== false,
          description: s.description || null,
        })),
      });
    }

    const updated = await db.departmentSkillRequirement.findMany({
      where: { departmentId },
      include: { department: { select: { id: true, code: true, name: true } } },
      orderBy: [{ isRequired: "desc" }, { skillName: "asc" }],
    });

    return apiSuccess(updated, "部門スキル要件を更新しました");
  } catch (error) {
    console.error("POST /api/department-skills error:", error);
    return apiError("部門スキル要件の更新に失敗しました", 500);
  }
}

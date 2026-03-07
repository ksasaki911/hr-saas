// =============================================================
// 本部応援 API
// GET  - 一覧取得（storeId, startDate, endDate でフィルタ）
// POST - 新規登録
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const url = new URL(request.url);
    const storeId = url.searchParams.get("storeId");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const where: Record<string, unknown> = {};
    if (storeId) where.storeId = storeId;
    if (startDate && endDate) {
      where.supportDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const supports = await db.headquartersSupport.findMany({
      where,
      orderBy: [{ supportDate: "asc" }, { startTime: "asc" }],
    });

    return apiSuccess(supports);
  } catch (error) {
    console.error("GET /api/hq-support error:", error);
    return apiError("本部応援データの取得に失敗しました", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db, tenantId } = await getTenantDb();
    const body = await request.json();

    const {
      storeId, departmentId, supportDate, staffName, staffCode,
      startTime, endTime, breakMinutes, skills, note, status,
    } = body;

    if (!storeId || !supportDate || !staffName || !startTime || !endTime) {
      return apiError("必須項目が不足しています", 400);
    }

    const created = await db.headquartersSupport.create({
      data: {
        tenantId,
        storeId,
        departmentId: departmentId || null,
        supportDate: new Date(supportDate),
        staffName,
        staffCode: staffCode || null,
        startTime,
        endTime,
        breakMinutes: breakMinutes ?? 60,
        skills: skills || [],
        note: note || null,
        status: status || "REQUESTED",
      },
    });

    return apiSuccess(created, "本部応援を登録しました");
  } catch (error) {
    console.error("POST /api/hq-support error:", error);
    return apiError("本部応援の登録に失敗しました", 500);
  }
}

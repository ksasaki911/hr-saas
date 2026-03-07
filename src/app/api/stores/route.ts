// =============================================================
// 店舗一覧 API
// GET /api/stores
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("activeOnly") !== "false";

    const where: Record<string, unknown> = {};
    if (activeOnly) where.isActive = true;

    const stores = await db.store.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        phone: true,
        openTime: true,
        closeTime: true,
        isActive: true,
      },
      orderBy: { code: "asc" },
    });

    return apiSuccess(stores);
  } catch (error) {
    console.error("GET /api/stores error:", error);
    return apiError("店舗一覧の取得に失敗しました", 500);
  }
}

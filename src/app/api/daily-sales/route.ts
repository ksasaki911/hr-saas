// =============================================================
// 日別売上データ API
// GET  /api/daily-sales - 売上一覧取得
// POST /api/daily-sales - 売上登録（手入力・CSV取込）
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { requireAuth, requireRole } from "@/lib/auth-utils";
import { apiSuccess, apiError } from "@/lib/api-response";

// 売上一覧取得
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const requestedStoreId = url.searchParams.get("storeId");

    const auth = await requireAuth(requestedStoreId);
    if (auth.error) return auth.error;

    const { db } = await getTenantDb();
    const storeId = auth.effectiveStoreId || requestedStoreId;
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const departmentId = url.searchParams.get("departmentId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (storeId) where.storeId = storeId;
    if (departmentId) where.departmentId = departmentId;
    if (startDate && endDate) {
      where.salesDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const sales = await db.dailySales.findMany({
      where,
      include: {
        store: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ salesDate: "asc" }, { storeId: "asc" }],
    });

    return apiSuccess(sales);
  } catch (error) {
    console.error("GET /api/daily-sales error:", error);
    return apiError("売上データの取得に失敗しました", 500);
  }
}

// 売上登録（単一 or 一括）
export async function POST(request: NextRequest) {
  try {
    const roleCheck = await requireRole("STORE_MANAGER");
    if (roleCheck.error) return roleCheck.error;

    const { db } = await getTenantDb();
    const body = await request.json();

    // 一括登録（CSV取込用）
    if (Array.isArray(body.records)) {
      const records = body.records.map((r: {
        storeId: string;
        departmentId?: string;
        salesDate: string;
        salesAmount: number;
        grossProfit?: number;
        customerCount?: number;
        note?: string;
      }) => ({
        storeId: r.storeId,
        departmentId: r.departmentId || null,
        salesDate: new Date(r.salesDate),
        salesAmount: r.salesAmount,
        grossProfit: r.grossProfit || null,
        customerCount: r.customerCount || null,
        note: r.note || null,
      }));

      // upsert的に処理（既存があれば更新）
      let created = 0;
      let updated = 0;
      for (const rec of records) {
        const existing = await db.dailySales.findFirst({
          where: {
            storeId: rec.storeId,
            departmentId: rec.departmentId,
            salesDate: rec.salesDate,
          },
        });
        if (existing) {
          await db.dailySales.update({
            where: { id: existing.id },
            data: { salesAmount: rec.salesAmount, grossProfit: rec.grossProfit, customerCount: rec.customerCount, note: rec.note },
          });
          updated++;
        } else {
          await db.dailySales.create({ data: rec });
          created++;
        }
      }
      return apiSuccess({ created, updated, total: records.length });
    }

    // 単一登録
    const { storeId, departmentId, salesDate, salesAmount, grossProfit, customerCount, note } = body;
    if (!storeId || !salesDate || salesAmount == null) {
      return apiError("storeId, salesDate, salesAmount は必須です", 400);
    }

    const existing = await db.dailySales.findFirst({
      where: {
        storeId,
        departmentId: departmentId || null,
        salesDate: new Date(salesDate),
      },
    });

    if (existing) {
      const result = await db.dailySales.update({
        where: { id: existing.id },
        data: { salesAmount, grossProfit: grossProfit || null, customerCount, note },
      });
      return apiSuccess(result);
    }

    const result = await db.dailySales.create({
      data: {
        storeId,
        departmentId: departmentId || null,
        salesDate: new Date(salesDate),
        salesAmount,
        grossProfit: grossProfit || null,
        customerCount: customerCount || null,
        note: note || null,
      },
    });
    return apiSuccess(result, 201);
  } catch (error) {
    console.error("POST /api/daily-sales error:", error);
    return apiError("売上データの登録に失敗しました", 500);
  }
}

// =============================================================
// 月次売上データ Excel取込 API
// POST /api/daily-sales/import-monthly
// - 店別月別集計Excel（店別月別_縦シート）を取り込む
// - 店コードでStoreをマッピング
// - 月の1日付けでDailySalesに upsert
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";
import * as XLSX from "xlsx";

type MonthlyRecord = {
  yearMonth: string;     // "2025-06"
  storeCode: string;     // "5"
  storeName: string;
  salesAmount: number;
  grossProfit: number;
  customerCount: number;
};

export async function POST(request: NextRequest) {
  try {
    const { db, tenantId } = await getTenantDb();
    const contentType = request.headers.get("content-type") || "";

    let records: MonthlyRecord[] = [];

    if (contentType.includes("multipart/form-data")) {
      // Excelファイルアップロード
      const formData = await request.formData();
      const file = formData.get("file") as File;
      if (!file) return apiError("ファイルが指定されていません", 400);

      const buffer = Buffer.from(await file.arrayBuffer());
      const workbook = XLSX.read(buffer, { type: "buffer" });

      // 「店別月別_縦」シートを優先、なければ最初のシート
      const sheetName = workbook.SheetNames.find(n => n.includes("店別月別")) || workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      for (const row of rows) {
        const ym = String(row["年月(YYYY-MM)"] || row["年月"] || "").trim();
        const code = String(row["店コード"] || "").trim();
        const name = String(row["店名"] || "").trim();
        const sales = Number(row["店売上"] || row["売上"] || 0);
        const gp = Number(row["当月荒利金額"] || row["荒利金額"] || row["荒利"] || 0);
        const cust = Number(row["当年客数"] || row["客数"] || 0);

        if (!ym || !code || sales === 0) continue;

        records.push({
          yearMonth: ym,
          storeCode: code,
          storeName: name,
          salesAmount: sales,
          grossProfit: gp,
          customerCount: cust,
        });
      }
    } else {
      // JSON形式（フロント側でパース済み）
      const body = await request.json();
      records = body.records || [];
    }

    if (records.length === 0) {
      return apiError("取込可能なデータがありません", 400);
    }

    // 店舗マスタ取得（コードでマッピング）
    const stores = await db.store.findMany({
      where: { tenantId },
      select: { id: true, code: true, name: true },
    });
    console.log("[import-monthly] tenantId:", tenantId);
    console.log("[import-monthly] DB stores:", JSON.stringify(stores));
    console.log("[import-monthly] Excel records:", records.map(r => `${r.storeCode}:${r.storeName}`));

    // 店コードのマッピング: DB側は "005" (ゼロ埋め), Excel側は "5" (ゼロなし) の場合がある
    // 両方のパターンでマッチできるようにする
    const storeByCode = new Map<string, { id: string; code: string; name: string }>();
    for (const s of stores as Array<{ id: string; code: string; name: string }>) {
      storeByCode.set(s.code, s);
      // ゼロ埋めを除去した版もセット
      const stripped = s.code.replace(/^0+/, "");
      if (stripped !== s.code) storeByCode.set(stripped, s);
      // 名前でもマッチ（コードが異なる場合のフォールバック）
      storeByCode.set(s.name.replace(/店$/, ""), s);
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const rec of records) {
      // Excel側のコードでもゼロ埋め版でも、さらに店名でも検索
      const store = storeByCode.get(rec.storeCode)
        || storeByCode.get(rec.storeCode.padStart(3, "0"))
        || storeByCode.get(rec.storeName)
        || storeByCode.get(rec.storeName.replace(/店$/, ""));
      if (!store) {
        skipped++;
        errors.push(`店コード ${rec.storeCode}（${rec.storeName}）が見つかりません`);
        continue;
      }

      // 月の1日付けで格納
      const salesDate = new Date(`${rec.yearMonth}-01T00:00:00Z`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing: any = await db.dailySales.findFirst({
        where: {
          tenantId,
          storeId: store.id,
          departmentId: null,
          salesDate,
        },
      });

      if (existing) {
        await db.dailySales.update({
          where: { id: existing.id },
          data: {
            salesAmount: rec.salesAmount,
            grossProfit: rec.grossProfit || null,
            customerCount: rec.customerCount || null,
            note: `月次集計取込 ${rec.yearMonth}`,
          },
        });
        updated++;
      } else {
        await db.dailySales.create({
          data: {
            tenantId,
            storeId: store.id,
            departmentId: null,
            salesDate,
            salesAmount: rec.salesAmount,
            grossProfit: rec.grossProfit || null,
            customerCount: rec.customerCount || null,
            note: `月次集計取込 ${rec.yearMonth}`,
          },
        });
        created++;
      }
    }

    console.log(`[import-monthly] result: total=${records.length} created=${created} updated=${updated} skipped=${skipped}`);
    if (errors.length > 0) console.log("[import-monthly] errors:", errors);

    return apiSuccess({
      total: records.length,
      created,
      updated,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      debug: {
        dbStoreCount: (stores as Array<{ id: string; code: string; name: string }>).length,
        dbStoreCodes: (stores as Array<{ id: string; code: string; name: string }>).map(s => s.code),
        mapKeys: Array.from(storeByCode.keys()),
      },
    });
  } catch (error) {
    console.error("POST /api/daily-sales/import-monthly error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return apiError(`月次売上データの取込に失敗しました: ${msg}`, 500);
  }
}

// =============================================================
// 従業員マスタ CSVインポート API
// POST /api/import/employees
//   - JSON形式: { action, rows, defaultStoreId, batchOffset }
//   - クライアント側でCSVパース済みのマッピング済み行を受け取る
// タッチオンタイム「従業員データ[CSV]」対応
// 所属コードから拠点（Store）を自動生成
// ※Department（店舗内部門: 青果、鮮魚等）はタッチオンタイムの
//   所属コードとは別概念のため、ここでは扱わない
// =============================================================

export const maxDuration = 120;

import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";
import {
  type EmployeeCsvRow,
  mapEmploymentType,
  parseDate,
  parseAmount,
  validateEmployeeImport,
} from "@/lib/touchontime-mapper";

/**
 * マルエーうちや様の所属コード → 所属名マッピング
 * タッチオンタイムの「所属グループデータ」から取得
 *
 * 【注意】これらはすべてStore（拠点）として登録する。
 *   - 005〜013: 店舗
 *   - 00550, 00560: 店舗内の独立ユニット（ベーカリー、惣菜PC等）
 *   - 094〜099: プロセスセンター（集中加工施設）※店舗の青果部門とは別物
 *   - 990〜994: 本部部署
 *
 * Department（青果、鮮魚、精肉、惣菜等の売場部門）は
 * タッチオンタイムの所属コードには含まれないため、
 * 別途マスタメンテナンスで管理する。
 */
const SECTION_CODE_NAME_MAP: Record<string, string> = {
  "005": "泉店",
  "00550": "ベーカリー",
  "00560": "惣菜ＰＣ",
  "006": "広面店",
  "007": "旭南店",
  "008": "御所野店",
  "009": "酒田北店",
  "010": "鶴岡店",
  "011": "本荘石脇店",
  "012": "茨島店",
  "013": "鶴岡南店",
  "094": "青果ＰＣ",
  "095": "鮮魚ＰＣ",
  "096": "デリカセンター",
  "097": "精肉ＰＣ",
  "099": "鮮魚ＰＣ（一般 他）",
  "990": "本部管理課",
  "991": "本部商品課",
  "992": "商品課（配送）",
  "993": "店舗運営課",
  "994": "店舗開発課",
};

export async function POST(request: NextRequest) {
  try {
    const { db, tenantId } = await getTenantDb();

    // JSON形式で受け取る（クライアント側でCSVパース・マッピング済み）
    const body = await request.json();
    const action = body.action || "import";
    const rows = body.rows as EmployeeCsvRow[] | undefined;
    const defaultStoreId = body.defaultStoreId as string | null | undefined;

    if (!rows || rows.length === 0) {
      return apiError("データがありません", 400);
    }

    const mappedRows = rows;

    // バリデーション
    const validation = validateEmployeeImport(mappedRows);
    if (!validation.valid) {
      return apiError(`バリデーションエラーがあります: ${validation.errors.slice(0, 5).join(", ")}`, 400);
    }

    // ========== 拠点（Store）マスタの自動生成 ==========
    const usedStoreCodes = new Set<string>();
    mappedRows.forEach((r) => {
      if (r.storeCode) usedStoreCodes.add(r.storeCode);
    });

    const existingStores = await db.store.findMany({
      select: { id: true, code: true, name: true },
    });
    const storeByCode = new Map<string, string>(
      existingStores.map((s: { code: string; id: string }) => [s.code, s.id])
    );

    let storesCreated = 0;
    for (const code of usedStoreCodes) {
      if (!storeByCode.has(code)) {
        const storeName = SECTION_CODE_NAME_MAP[code] || `拠点${code}`;
        const newStore = await db.store.create({
          data: {
            code,
            name: storeName,
            tenantId,
            isActive: true,
          },
        });
        storeByCode.set(code, newStore.id);
        storesCreated++;
      }
    }

    // 職位マスタ取得（部門は自動割当しない）
    const positions = await db.position.findMany({ select: { id: true, name: true } });
    const posByName = new Map<string, string>(
      positions.map((p: { name: string; id: string }) => [p.name, p.id])
    );

    // デフォルト拠点
    const fallbackStoreId = defaultStoreId
      || existingStores[0]?.id
      || storeByCode.values().next().value;
    if (!fallbackStoreId) {
      return apiError("拠点マスタが登録されていません。", 400);
    }

    // 既存従業員の取得（重複判定用）
    const existingEmployees = await db.employee.findMany({
      select: { id: true, code: true },
    });
    const existingCodeMap = new Map<string, string>(
      existingEmployees.map((e: { code: string; id: string }) => [e.code, e.id])
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const importErrors: string[] = [];

    for (let i = 0; i < mappedRows.length; i++) {
      const row = mappedRows[i];
      if (!row.code || !row.lastName) {
        skipped++;
        continue;
      }

      try {
        // 拠点ID解決（所属コード → Store）
        let storeId: string = fallbackStoreId;
        if (row.storeCode && storeByCode.has(row.storeCode)) {
          storeId = storeByCode.get(row.storeCode)!;
        }

        // 職位ID解決
        let positionId: string | null = null;
        if (row.positionName) {
          for (const [name, id] of posByName.entries()) {
            if ((name as string).includes(row.positionName) || row.positionName.includes(name as string)) {
              positionId = id as string;
              break;
            }
          }
        }

        const employeeData = {
          code: row.code.trim(),
          lastName: row.lastName.trim(),
          firstName: row.firstName?.trim() || "",
          lastNameKana: row.lastNameKana?.trim() || null,
          firstNameKana: row.firstNameKana?.trim() || null,
          email: row.email?.trim() || null,
          phone: row.phone?.trim() || null,
          employmentType: mapEmploymentType(row.employmentType) as "FULL_TIME" | "PART_TIME" | "ARBEIT" | "CONTRACT",
          storeId,
          departmentId: null as string | null,  // タッチオンタイムからは部門割当しない
          positionId,
          hireDate: parseDate(row.hireDate) || new Date(),
          hourlyWage: parseAmount(row.hourlyWage),
          monthlySalary: parseAmount(row.monthlySalary),
          isActive: true,
        };

        if (existingCodeMap.has(row.code.trim())) {
          const existingId = existingCodeMap.get(row.code.trim())!;
          await db.employee.update({
            where: { id: existingId },
            data: employeeData,
          });
          updated++;
        } else {
          await db.employee.create({
            data: employeeData,
          });
          created++;
        }
      } catch (err) {
        importErrors.push(`行${i + 2}: ${err instanceof Error ? err.message : "不明なエラー"}`);
        skipped++;
      }
    }

    return apiSuccess({
      created,
      updated,
      skipped,
      storesCreated,
      total: mappedRows.length,
      errors: importErrors,
    });
  } catch (error) {
    console.error("POST /api/import/employees error:", error);
    return apiError("従業員インポートに失敗しました", 500);
  }
}

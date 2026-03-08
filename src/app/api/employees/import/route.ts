// =============================================================
// 従業員マスタ取込 API（給与奉行フォーマット対応）
// POST /api/employees/import
// body: { csvText: string, dryRun?: boolean }
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { requireRole } from "@/lib/auth-utils";
import { apiSuccess, apiError } from "@/lib/api-response";
import {
  parseBugyoEmployeeCsv,
  splitName,
  splitKana,
  warekiToDate,
  salaryTypeToEmploymentType,
} from "@/lib/bugyo-parser";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole("STORE_MANAGER");
    if (auth.error) return auth.error;

    const { db, tenantId } = await getTenantDb();
    const body = await request.json();
    const { csvText, dryRun } = body as { csvText: string; dryRun?: boolean };

    if (!csvText || csvText.trim().length === 0) {
      return apiError("CSVデータがありません", 400);
    }

    // 給与奉行CSVパース
    const rows = parseBugyoEmployeeCsv(csvText);
    if (rows.length === 0) {
      return apiError("有効なデータ行がありません", 400);
    }

    // 店舗コード→ID のマッピング取得
    const stores = await db.store.findMany({
      where: { tenantId },
      select: { id: true, code: true },
    });
    const storeCodeMap = new Map(stores.map((s: { code: string; id: string }) => [s.code, s.id]));

    // 部門コード→ID
    const departments = await db.department.findMany({
      where: { tenantId },
      select: { id: true, code: true },
    });
    const deptCodeMap = new Map(departments.map((d: { code: string; id: string }) => [d.code, d.id]));

    // 既存従業員コード
    const existingEmployees = await db.employee.findMany({
      where: { tenantId },
      select: { id: true, code: true },
    });
    const existingCodeMap = new Map(existingEmployees.map((e: { code: string; id: string }) => [e.code, e.id]));

    const results = {
      total: rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as Array<{ row: number; code: string; message: string }>,
      storesMissing: [] as string[],
    };

    // 不明な所属コードを自動で店舗として登録するためのリスト
    const missingStores = new Map<string, string>(); // code → name

    // 1パス目：不明店舗を検出
    for (const row of rows) {
      if (row.storeCode && !storeCodeMap.has(row.storeCode)) {
        missingStores.set(row.storeCode, row.storeName);
      }
    }

    // 不明店舗を自動登録（dryRunでない場合）
    if (!dryRun && missingStores.size > 0) {
      for (const [code, name] of missingStores) {
        const newStore = await db.store.create({
          data: { tenantId, code, name: name || `店舗${code}` },
        });
        storeCodeMap.set(code, newStore.id);
      }
    }
    results.storesMissing = Array.from(missingStores.entries()).map(([c, n]) => `${c}:${n}`);

    // 2パス目：従業員データ処理
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const storeId = storeCodeMap.get(row.storeCode);
        if (!storeId) {
          if (dryRun) {
            results.errors.push({ row: i + 1, code: row.code, message: `所属「${row.storeName}」(${row.storeCode}) 未登録→自動作成予定` });
          } else {
            results.errors.push({ row: i + 1, code: row.code, message: `所属コード ${row.storeCode} 解決失敗` });
            results.skipped++;
          }
          if (dryRun) {
            if (existingCodeMap.has(row.code)) results.updated++;
            else results.created++;
          }
          continue;
        }

        const { lastName, firstName } = splitName(row.name);
        const { lastNameKana, firstNameKana } = splitKana(row.nameKana);
        const employmentType = salaryTypeToEmploymentType(row.salaryTypeCode, row.positionCode);
        const hireDate = warekiToDate(row.hireDate) || "2020-01-01";
        const terminationDate = warekiToDate(row.terminationDate);

        // 時給・月給計算（給与体系によって異なる）
        // 0001-0003: 正社員 → 基本給は月給。時給 = 月給合計 / 173.8h
        // 0004,0006,0007: パート → partTimePay（パート勤務分）が時給
        // 0011: アルバイト → baseSalary（基本給カラム）が時給
        let hourlyWage: number | null = null;
        let monthlySalary: number | null = null;

        if (row.salaryTypeCode === "0011") {
          // アルバイト: 基本給カラムに時給が入っている
          hourlyWage = Math.round(row.baseSalary);
          monthlySalary = null;
        } else if (row.partTimePay > 0) {
          // パート: パート勤務分が時給
          hourlyWage = Math.round(row.partTimePay);
          monthlySalary = null;
        } else if (row.salaryTypeCode.startsWith("000") && row.baseSalary > 0) {
          // 正社員: 基本給+諸手当が月給、時給は月給÷所定時間
          monthlySalary = Math.round(
            row.baseSalary + row.managerAllowance + row.dutyAllowance + row.experienceAllowance
          );
          hourlyWage = Math.round(monthlySalary / 173.8);
        } else if (row.baseSalary > 0 && row.baseSalary < 5000) {
          // 基本給が5000未満なら時給とみなす（安全策）
          hourlyWage = Math.round(row.baseSalary);
          monthlySalary = null;
        } else if (row.baseSalary > 0) {
          monthlySalary = Math.round(row.baseSalary);
          hourlyWage = Math.round(row.baseSalary / 173.8);
        }

        const data = {
          lastName,
          firstName,
          lastNameKana: lastNameKana || null,
          firstNameKana: firstNameKana || null,
          employmentType,
          storeId,
          departmentId: null as string | null,
          hourlyWage,
          monthlySalary,
          email: row.email || null,
          phone: null as string | null,
          hireDate: new Date(hireDate),
          terminationDate: terminationDate ? new Date(terminationDate) : null,
          isActive: !terminationDate || new Date(terminationDate) > new Date(),
        };

        if (dryRun) {
          if (existingCodeMap.has(row.code)) results.updated++;
          else results.created++;
          continue;
        }

        if (existingCodeMap.has(row.code)) {
          await db.employee.update({
            where: { tenantId_code: { tenantId, code: row.code } },
            data,
          });
          results.updated++;
        } else {
          await db.employee.create({
            data: { ...data, tenantId, code: row.code },
          });
          results.created++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "不明なエラー";
        results.errors.push({ row: i + 1, code: row.code, message: msg });
        results.skipped++;
      }
    }

    return apiSuccess({ ...results, dryRun: !!dryRun });
  } catch (error) {
    console.error("POST /api/employees/import error:", error);
    return apiError("従業員データの取込に失敗しました", 500);
  }
}

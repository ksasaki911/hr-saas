// =============================================================
// 人件費(laborCost)一括修復 API
// POST /api/attendance/fix-labor-cost
// laborCostがNULLの勤怠レコードを再計算
//  - 従業員にhourlyWageがある場合 → そのまま使用
//  - hourlyWageがない場合 → 同じ店舗・雇用形態の平均時給を適用
//  - それでもない場合 → 雇用形態別デフォルト時給を適用
// =============================================================
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";

export const maxDuration = 120;

// 雇用形態別デフォルト時給（秋田県水準）
const DEFAULT_WAGES: Record<string, number> = {
  FULL_TIME: 1200,   // 正社員: 月給200,000÷173.8h ≒ 1,151 → 1,200
  PART_TIME: 950,     // パート
  ARBEIT: 900,        // アルバイト（最低賃金水準）
  CONTRACT: 1100,     // 契約社員
};

export async function POST() {
  try {
    const { db, tenantId } = await getTenantDb();

    // 修復前のNULLレコード数を取得
    const beforeCount = await db.attendanceRecord.count({
      where: {
        tenantId,
        laborCost: null,
        totalWorkMinutes: { gt: 0 },
      },
    });

    // Step 1: hourlyWageが設定済みの従業員のレコードを一括修復
    await db.$executeRaw`
      UPDATE attendance_records ar
      SET "laborCost" = ROUND(e."hourlyWage" * ar."totalWorkMinutes" / 60.0)
      FROM employees e
      WHERE ar."employeeId" = e."id"
        AND ar."tenantId" = ${tenantId}
        AND ar."laborCost" IS NULL
        AND ar."totalWorkMinutes" > 0
        AND e."hourlyWage" IS NOT NULL
        AND e."hourlyWage" > 0
    `;

    // Step 2: hourlyWageが未設定の従業員に、同じ店舗・雇用形態の平均時給を設定
    // まず平均時給を計算
    const avgWages = await db.employee.groupBy({
      by: ["storeId", "employmentType"],
      where: {
        tenantId,
        hourlyWage: { not: null, gt: 0 },
      },
      _avg: { hourlyWage: true },
    });

    const avgWageMap = new Map<string, number>();
    for (const row of avgWages) {
      if (row._avg.hourlyWage) {
        avgWageMap.set(`${row.storeId}|${row.employmentType}`, Math.round(row._avg.hourlyWage));
      }
    }

    // 雇用形態別の全社平均
    const avgByType = await db.employee.groupBy({
      by: ["employmentType"],
      where: {
        tenantId,
        hourlyWage: { not: null, gt: 0 },
      },
      _avg: { hourlyWage: true },
    });
    const typeAvgMap = new Map<string, number>();
    for (const row of avgByType) {
      if (row._avg.hourlyWage) {
        typeAvgMap.set(row.employmentType, Math.round(row._avg.hourlyWage));
      }
    }

    // hourlyWage未設定の従業員を取得
    const noWageEmployees = await db.employee.findMany({
      where: {
        tenantId,
        OR: [
          { hourlyWage: null },
          { hourlyWage: 0 },
        ],
      },
      select: { id: true, storeId: true, employmentType: true },
    });

    // 各従業員に推定時給を設定
    let wageUpdated = 0;
    for (const emp of noWageEmployees) {
      const estimatedWage =
        avgWageMap.get(`${emp.storeId}|${emp.employmentType}`) ||  // 同店舗・同雇用形態の平均
        typeAvgMap.get(emp.employmentType) ||                       // 全社の同雇用形態平均
        DEFAULT_WAGES[emp.employmentType] ||                        // デフォルト
        950;                                                        // 最終フォールバック

      await db.employee.update({
        where: { id: emp.id },
        data: { hourlyWage: estimatedWage },
      });
      wageUpdated++;
    }

    // Step 3: 再度一括UPDATE（今度は全従業員にhourlyWageがある）
    if (wageUpdated > 0) {
      await db.$executeRaw`
        UPDATE attendance_records ar
        SET "laborCost" = ROUND(e."hourlyWage" * ar."totalWorkMinutes" / 60.0)
        FROM employees e
        WHERE ar."employeeId" = e."id"
          AND ar."tenantId" = ${tenantId}
          AND ar."laborCost" IS NULL
          AND ar."totalWorkMinutes" > 0
          AND e."hourlyWage" IS NOT NULL
          AND e."hourlyWage" > 0
      `;
    }

    // 修復後のNULLレコード数を取得
    const afterCount = await db.attendanceRecord.count({
      where: {
        tenantId,
        laborCost: null,
        totalWorkMinutes: { gt: 0 },
      },
    });

    const fixed = beforeCount - afterCount;
    const skipped = afterCount;

    const empWithWage = await db.employee.count({
      where: { tenantId, hourlyWage: { not: null } },
    });

    return apiSuccess({
      totalNullRecords: beforeCount,
      fixed,
      skipped,
      errors: 0,
      employeesWithWage: empWithWage,
      wageEstimated: wageUpdated,
    });
  } catch (error) {
    console.error("POST /api/attendance/fix-labor-cost error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return apiError(`人件費の一括修復に失敗しました: ${msg}`, 500);
  }
}

// 診断用: NULL laborCostの状況を確認
export async function GET() {
  try {
    const { db, tenantId } = await getTenantDb();

    // laborCostがNULLのレコード数（店舗×月別）
    const nullRecords = await db.attendanceRecord.findMany({
      where: {
        tenantId,
        laborCost: null,
        totalWorkMinutes: { gt: 0 },
      },
      select: {
        storeId: true,
        attendanceDate: true,
        employeeId: true,
      },
    });

    // 店舗名マップ
    const stores = await db.store.findMany({
      where: { tenantId },
      select: { id: true, name: true, code: true },
    });
    const storeNameMap = new Map(stores.map((s: { id: string; name: string; code: string }) => [s.id, `${s.code}:${s.name}`]));

    // 店舗×月でグループ化
    const summary = new Map<string, number>();
    for (const r of nullRecords) {
      const d = new Date(r.attendanceDate);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const storeName = storeNameMap.get(r.storeId) || r.storeId;
      const key = `${storeName}|${month}`;
      summary.set(key, (summary.get(key) || 0) + 1);
    }

    // hourlyWageの設定状況
    const employees = await db.employee.findMany({
      where: { tenantId, isActive: true },
      select: { hourlyWage: true, employmentType: true, storeId: true },
    });
    const withWage = employees.filter((e: { hourlyWage: number | null }) => e.hourlyWage !== null && e.hourlyWage > 0).length;
    const withoutWage = employees.filter((e: { hourlyWage: number | null }) => e.hourlyWage === null || e.hourlyWage === 0).length;

    return apiSuccess({
      totalNullLaborCostRecords: nullRecords.length,
      byStoreMonth: Object.fromEntries(
        Array.from(summary.entries())
          .sort(([a], [b]) => a.localeCompare(b))
      ),
      employeeWageStatus: {
        withHourlyWage: withWage,
        withoutHourlyWage: withoutWage,
      },
    });
  } catch (error) {
    console.error("GET /api/attendance/fix-labor-cost error:", error);
    return apiError("診断に失敗しました", 500);
  }
}

// =============================================================
// シードデータ削除 API（一時的な管理用エンドポイント）
// GET /api/admin/cleanup-seed
// テスト用ダミーデータ（E0001-E0005, P0001-P0015, A0001-A0010）を削除
// =============================================================

import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";

const SEED_EMPLOYEE_CODES = [
  "E0001","E0002","E0003","E0004","E0005",
  "P0001","P0002","P0003","P0004","P0005","P0006","P0007","P0008","P0009","P0010","P0011","P0012","P0013","P0014","P0015",
  "A0001","A0002","A0003","A0004","A0005","A0006","A0007","A0008","A0009","A0010"
];

const SEED_STORE_IDS = ["store-honten", "store-ekimae"];
const SEED_DEPT_IDS = [
  "dept-seika","dept-sengyo","dept-seiniku","dept-sozai","dept-bakery",
  "dept-grocery","dept-daily","dept-register","dept-service"
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeDeleteMany(db: any, model: string, where: Record<string, unknown>): Promise<number> {
  try {
    if (db[model]) {
      const result = await db[model].deleteMany({ where });
      return result.count;
    }
  } catch { /* model doesn't exist or error */ }
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeCount(db: any, model: string, where: Record<string, unknown>): Promise<number> {
  try {
    if (db[model]) {
      return await db[model].count({ where });
    }
  } catch { /* ignore */ }
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeDelete(db: any, model: string, where: Record<string, unknown>): Promise<boolean> {
  try {
    if (db[model]) {
      await db[model].delete({ where });
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

export async function GET() {
  try {
    const { db } = await getTenantDb();
    const log: string[] = [];

    // 1. シード従業員のID取得
    const seedEmps = await db.employee.findMany({
      where: { code: { in: SEED_EMPLOYEE_CODES } },
      select: { id: true, code: true, lastName: true, firstName: true },
    });
    log.push(`シード従業員: ${seedEmps.length}名`);

    const seedEmpIds = seedEmps.map((e: { id: string }) => e.id);

    if (seedEmpIds.length === 0) {
      return apiSuccess({ message: "シードデータは既に削除済みです", log });
    }

    // 2. 従業員に紐づく関連データを一括削除
    const relatedModels = [
      { model: "attendanceRecord", label: "勤怠レコード" },
      { model: "shift", label: "シフト" },
      { model: "shiftRecord", label: "シフトレコード" },
      { model: "shiftPattern", label: "シフトパターン" },
      { model: "shiftRequest", label: "シフトリクエスト" },
      { model: "leaveRequest", label: "休暇申請" },
    ];

    for (const { model, label } of relatedModels) {
      const count = await safeDeleteMany(db, model, { employeeId: { in: seedEmpIds } });
      log.push(`${label}削除: ${count}件`);
    }

    // 3. 本部応援削除（staffCodeベース）
    const hqCount = await safeDeleteMany(db, "headquartersSupport", { staffCode: { in: SEED_EMPLOYEE_CODES } });
    log.push(`本部応援削除: ${hqCount}件`);

    // 4. 従業員削除
    const empDel = await db.employee.deleteMany({
      where: { id: { in: seedEmpIds } },
    });
    log.push(`従業員削除: ${empDel.count}名`);

    // 5. シード店舗削除（実データで使われていなければ）
    for (const storeId of SEED_STORE_IDS) {
      const empCount = await db.employee.count({ where: { storeId } });
      if (empCount > 0) {
        log.push(`店舗 ${storeId}: 実データ${empCount}名あり → スキップ`);
      } else {
        // 関連データを先に削除
        await safeDeleteMany(db, "attendanceRecord", { storeId });
        await safeDeleteMany(db, "shiftRecord", { storeId });
        await safeDeleteMany(db, "storeCalendar", { storeId });
        const ok = await safeDelete(db, "store", { id: storeId });
        log.push(ok ? `店舗 ${storeId} 削除完了` : `店舗 ${storeId}: 削除スキップ`);
      }
    }

    // 6. シード部門削除（実データで使われていなければ）
    for (const deptId of SEED_DEPT_IDS) {
      const empCount = await db.employee.count({ where: { departmentId: deptId } });
      if (empCount > 0) {
        log.push(`部門 ${deptId}: 実データ${empCount}名あり → スキップ`);
      } else {
        await safeDeleteMany(db, "departmentSkill", { departmentId: deptId });
        await safeDeleteMany(db, "headquartersSupport", { departmentId: deptId });
        const ok = await safeDelete(db, "department", { id: deptId });
        log.push(ok ? `部門 ${deptId} 削除完了` : `部門 ${deptId}: 削除スキップ`);
      }
    }

    // 7. 雇用ルール（シード用）削除
    const ruleCount = await safeDeleteMany(db, "employmentRule", { id: { startsWith: "rule-" } });
    if (ruleCount > 0) log.push(`雇用ルール削除: ${ruleCount}件`);

    // 残データ確認
    const remaining = {
      employees: await db.employee.count(),
      attendanceRecords: await safeCount(db, "attendanceRecord", {}),
      stores: await db.store.count(),
      departments: await safeCount(db, "department", {}),
    };

    return apiSuccess({ message: "シードデータ削除完了", log, remaining });
  } catch (error) {
    console.error("cleanup-seed error:", error);
    return apiError(`削除エラー: ${error instanceof Error ? error.message : "不明"}`, 500);
  }
}

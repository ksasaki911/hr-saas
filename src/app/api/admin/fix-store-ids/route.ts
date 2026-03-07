// =============================================================
// ストアID不整合修正 API（1回限りのマイグレーション）
// POST /api/admin/fix-store-ids
// =============================================================
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST() {
  try {
    const { db } = await getTenantDb();

    // 1. 実際のストアを取得
    const stores = await db.store.findMany({
      select: { id: true, code: true, name: true },
    });
    console.log("[fix-store-ids] stores:", stores);

    if (stores.length === 0) {
      return apiError("店舗が見つかりません", 404);
    }

    // 本店（最初の店舗）の実際のID
    const realStoreId = stores[0].id;
    console.log("[fix-store-ids] realStoreId:", realStoreId);

    // 2. ハードコードされた可能性のある古いID一覧
    const oldIds = ["store-honten", "store-ekimae"];
    const results: Record<string, number> = {};

    for (const oldId of oldIds) {
      if (oldId === realStoreId) continue; // 同じならスキップ

      // 対応する実際のIDを決定
      const targetId = oldId === "store-honten" ? stores[0]?.id :
                        oldId === "store-ekimae" ? stores[1]?.id : null;
      if (!targetId) continue;

      // staffingRequirement
      const sr = await db.staffingRequirement.updateMany({
        where: { storeId: oldId },
        data: { storeId: targetId },
      });
      results[`staffingRequirement(${oldId}→${targetId})`] = sr.count;

      // shiftRequest
      const shreq = await db.shiftRequest.updateMany({
        where: { storeId: oldId },
        data: { storeId: targetId },
      });
      results[`shiftRequest(${oldId}→${targetId})`] = shreq.count;

      // shift
      const sh = await db.shift.updateMany({
        where: { storeId: oldId },
        data: { storeId: targetId },
      });
      results[`shift(${oldId}→${targetId})`] = sh.count;

      // companyCalendar
      try {
        const cc = await db.companyCalendar.updateMany({
          where: { storeId: oldId },
          data: { storeId: targetId },
        });
        results[`companyCalendar(${oldId}→${targetId})`] = cc.count;
      } catch { /* テーブルにstoreIdがない場合 */ }

      // headquartersSupport
      try {
        const hq = await db.headquartersSupport.updateMany({
          where: { storeId: oldId },
          data: { storeId: targetId },
        });
        results[`headquartersSupport(${oldId}→${targetId})`] = hq.count;
      } catch { /* skip */ }

      // attendanceProfile
      try {
        const ap = await db.attendanceProfile.updateMany({
          where: { storeId: oldId },
          data: { storeId: targetId },
        });
        results[`attendanceProfile(${oldId}→${targetId})`] = ap.count;
      } catch { /* skip */ }

      // departmentSkillRequirement
      try {
        const dsr = await db.departmentSkillRequirement.updateMany({
          where: { storeId: oldId },
          data: { storeId: targetId },
        });
        results[`departmentSkillRequirement(${oldId}→${targetId})`] = dsr.count;
      } catch { /* skip */ }

      // employee（念のため）
      try {
        const emp = await db.employee.updateMany({
          where: { storeId: oldId },
          data: { storeId: targetId },
        });
        results[`employee(${oldId}→${targetId})`] = emp.count;
      } catch { /* skip */ }
    }

    console.log("[fix-store-ids] results:", results);
    return apiSuccess({ message: "ストアID修正完了", realStoreId, results });
  } catch (error) {
    console.error("[fix-store-ids] error:", error);
    return apiError("ストアID修正に失敗しました", 500);
  }
}

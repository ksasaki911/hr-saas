// =============================================================
// シフト自動生成 API
// POST /api/shifts/generate
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { shiftGenerateSchema } from "@/lib/validations/shift";
import { generateShifts } from "@/lib/shift-generator";
import { apiSuccess, apiError, apiValidationError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const body = await request.json();
    const parsed = shiftGenerateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    const config = parsed.data;

    // アルゴリズム実行
    const result = await generateShifts(db, {
      ...config,
      dryRun: config.dryRun,
    });

    // dryRun=true の場合はプレビューのみ返す
    if (config.dryRun) {
      return apiSuccess({
        dryRun: true,
        totalCount: result.totalCount,
        totalCost: result.totalCost,
        daySummaries: result.daySummaries,
        warnings: result.warnings,
        skillAlerts: result.skillAlerts,
        hqSupportUsed: result.hqSupportUsed,
        profilesUsed: result.profilesUsed,
        employeeDetails: result.employeeDetails,
        requestFulfillment: result.requestFulfillment,
      });
    }

    // dryRun=false の場合は実際にシフトを作成

    // 対象週の既存DRAFTシフトを削除（重複回避）
    const weekStart = new Date(config.weekStartDate + "T00:00:00");
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const deleted = await db.shift.deleteMany({
      where: {
        status: "DRAFT",
        shiftDate: { gte: weekStart, lte: weekEnd },
      },
    });
    if (deleted.count > 0) {
      console.log(`[shift-gen] 対象週の既存DRAFTシフト ${deleted.count}件を削除しました`);
    }

    if (result.shifts.length === 0) {
      return apiSuccess({
        dryRun: false,
        createdCount: 0,
        totalCost: 0,
        daySummaries: result.daySummaries,
        warnings: [...result.warnings, "生成対象のシフトがありません"],
      });
    }

    // 一括作成
    const created = await db.shift.createMany({
      data: result.shifts.map((s) => ({
        employeeId: s.employeeId,
        storeId: s.storeId,
        departmentId: s.departmentId,
        shiftDate: new Date(s.shiftDate),
        startTime: s.startTime,
        endTime: s.endTime,
        breakMinutes: s.breakMinutes,
        status: s.status,
        laborCost: s.laborCost,
        isHelpShift: s.isHelpShift,
      })),
      skipDuplicates: true,
    });

    return apiSuccess({
      dryRun: false,
      createdCount: created.count,
      totalCost: result.totalCost,
      daySummaries: result.daySummaries,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("POST /api/shifts/generate error:", error);
    return apiError("シフト自動生成に失敗しました", 500);
  }
}

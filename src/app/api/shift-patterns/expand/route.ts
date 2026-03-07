// =============================================================
// 月間パターン → ShiftRequest 展開 API
// POST /api/shift-patterns/expand
// パターンから指定月の日別ShiftRequestを自動生成
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const body = await request.json();

    const { storeId, yearMonth } = body as {
      storeId: string;
      yearMonth: string; // "2026-03"
    };

    if (!storeId || !yearMonth) {
      return apiError("storeId と yearMonth は必須です", 400);
    }

    const [year, month] = yearMonth.split("-").map(Number);
    if (!year || !month || month < 1 || month > 12) {
      return apiError("yearMonth は YYYY-MM 形式で指定してください", 400);
    }

    // 対象月の全日付を生成
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const dates: Date[] = [];
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }

    // この店舗のアクティブなパターンを全従業員分取得
    const patterns = await db.shiftPattern.findMany({
      where: {
        storeId,
        isActive: true,
      },
    });

    if (patterns.length === 0) {
      return apiSuccess({
        expandedCount: 0,
        skippedCount: 0,
        message: "登録済みのパターンがありません",
      });
    }

    // 既存のShiftRequestを取得（重複チェック用）
    const existingRequests = await db.shiftRequest.findMany({
      where: {
        storeId,
        targetDate: {
          gte: firstDay,
          lte: lastDay,
        },
      },
      select: {
        employeeId: true,
        targetDate: true,
      },
    });

    const existingSet = new Set(
      existingRequests.map(
        (r: { employeeId: string; targetDate: Date }) =>
          `${r.employeeId}_${r.targetDate.toISOString().split("T")[0]}`
      )
    );

    // パターンを曜日でインデックス化
    const patternMap = new Map<string, typeof patterns[0]>();
    for (const p of patterns) {
      patternMap.set(`${p.employeeId}_${p.dayOfWeek}`, p);
    }

    // 日別に展開
    let expandedCount = 0;
    let skippedCount = 0;
    const createData: {
      employeeId: string;
      storeId: string;
      targetDate: Date;
      requestType: string;
      startTime: string | null;
      endTime: string | null;
      note: string | null;
    }[] = [];

    for (const date of dates) {
      const dow = date.getDay();
      const dateStr = date.toISOString().split("T")[0];

      for (const p of patterns) {
        if (p.dayOfWeek !== dow) continue;

        const key = `${p.employeeId}_${dateStr}`;

        // 既に個別登録があればスキップ（例外修正を優先）
        if (existingSet.has(key)) {
          skippedCount++;
          continue;
        }

        createData.push({
          employeeId: p.employeeId,
          storeId: p.storeId,
          targetDate: date,
          requestType: p.requestType,
          startTime: p.startTime,
          endTime: p.endTime,
          note: "パターンから自動展開",
        });
        expandedCount++;
      }
    }

    // 一括挿入
    if (createData.length > 0) {
      await db.shiftRequest.createMany({
        data: createData,
        skipDuplicates: true,
      });
    }

    return apiSuccess({
      expandedCount,
      skippedCount,
      totalDates: dates.length,
      message: `${expandedCount}件のシフト希望を展開しました（${skippedCount}件は既存のためスキップ）`,
    });
  } catch (error) {
    console.error("POST /api/shift-patterns/expand error:", error);
    return apiError("パターン展開に失敗しました", 500);
  }
}

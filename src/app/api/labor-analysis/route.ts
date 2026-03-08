// =============================================================
// 人件費分析 API（勤怠実績ベース）
// GET /api/labor-analysis
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const { db, tenantId } = await getTenantDb();
    const url = new URL(request.url);

    const requestedStoreId = url.searchParams.get("storeId") || undefined;
    const yearMonth = url.searchParams.get("yearMonth");

    // 期間計算
    let periodStart: Date;
    let periodEnd: Date;

    if (yearMonth) {
      const [y, m] = yearMonth.split("-").map(Number);
      periodStart = new Date(y, m - 1, 1);
      periodEnd = new Date(y, m, 0, 23, 59, 59);
    } else {
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    const budgetYearMonth = yearMonth || (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    })();

    // --- 勤怠データ取得 ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attWhere: any = {
      tenantId,
      attendanceDate: { gte: periodStart, lte: periodEnd },
      totalWorkMinutes: { gt: 0 },
    };
    if (requestedStoreId) attWhere.storeId = requestedStoreId;

    const records = await db.attendanceRecord.findMany({
      where: attWhere,
      select: {
        storeId: true,
        employeeId: true,
        attendanceDate: true,
        totalWorkMinutes: true,
        overtimeMinutes: true,
        laborCost: true,
        employee: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            hourlyWage: true,
            employmentType: true,
          },
        },
        store: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    // laborCostがnullの場合hourlyWageから補完
    for (const r of records) {
      if (r.laborCost === null && r.totalWorkMinutes > 0 && r.employee?.hourlyWage) {
        (r as { laborCost: number | null }).laborCost =
          Math.round((r.employee.hourlyWage * r.totalWorkMinutes) / 60);
      }
    }

    // --- 売上データ取得 ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const salesWhere: any = {
      tenantId,
      salesDate: { gte: periodStart, lte: periodEnd },
    };
    if (requestedStoreId) salesWhere.storeId = requestedStoreId;

    const salesData = await db.dailySales.findMany({
      where: salesWhere,
    });

    // --- 予算データ取得 ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const budgetWhere: any = {
      tenantId,
      yearMonth: budgetYearMonth,
    };
    if (requestedStoreId) budgetWhere.storeId = requestedStoreId;

    const budgets = await db.laborBudget.findMany({
      where: budgetWhere,
    });

    // --- 集計ロジック ---
    type StoreData = {
      storeId: string;
      storeName: string;
      storeCode: string;
      totalLaborCost: number;
      totalWorkMinutes: number;
      totalSales: number;
      totalGrossProfit: number;
      totalCustomers: number;
      budgetAmount: number;
      budgetHours: number;
      recordCount: number;
      employeeIds: Set<string>;
      fullTimeMinutes: number;
      fullTimeCost: number;
      partTimeMinutes: number;
      partTimeCost: number;
      dailyData: Map<string, {
        date: string;
        laborCost: number;
        workMinutes: number;
        sales: number;
        grossProfit: number;
        customers: number;
      }>;
    };

    const storeMap = new Map<string, StoreData>();

    const getStore = (storeId: string, storeName: string, storeCode: string): StoreData => {
      if (!storeMap.has(storeId)) {
        storeMap.set(storeId, {
          storeId,
          storeName,
          storeCode,
          totalLaborCost: 0,
          totalWorkMinutes: 0,
          totalSales: 0,
          totalGrossProfit: 0,
          totalCustomers: 0,
          budgetAmount: 0,
          budgetHours: 0,
          recordCount: 0,
          employeeIds: new Set(),
          fullTimeMinutes: 0,
          fullTimeCost: 0,
          partTimeMinutes: 0,
          partTimeCost: 0,
          dailyData: new Map(),
        });
      }
      return storeMap.get(storeId)!;
    };

    // 勤怠データ集計
    for (const r of records) {
      const store = getStore(r.storeId, r.store.name, r.store.code);
      const cost = r.laborCost || 0;

      store.totalLaborCost += cost;
      store.totalWorkMinutes += r.totalWorkMinutes;
      store.recordCount++;
      store.employeeIds.add(r.employeeId);

      // 雇用形態別
      const empType = r.employee?.employmentType;
      if (empType === "FULL_TIME") {
        store.fullTimeMinutes += r.totalWorkMinutes;
        store.fullTimeCost += cost;
      } else {
        store.partTimeMinutes += r.totalWorkMinutes;
        store.partTimeCost += cost;
      }

      // 日別集計
      const dateStr = new Date(r.attendanceDate).toISOString().split("T")[0];
      if (!store.dailyData.has(dateStr)) {
        store.dailyData.set(dateStr, {
          date: dateStr,
          laborCost: 0,
          workMinutes: 0,
          sales: 0,
          grossProfit: 0,
          customers: 0,
        });
      }
      const daily = store.dailyData.get(dateStr)!;
      daily.laborCost += cost;
      daily.workMinutes += r.totalWorkMinutes;
    }

    // 売上データ集計
    for (const sale of salesData) {
      const sid = sale.storeId;
      if (!storeMap.has(sid)) continue;
      const store = storeMap.get(sid)!;
      store.totalSales += sale.salesAmount;
      store.totalGrossProfit += sale.grossProfit || 0;
      store.totalCustomers += sale.customerCount || 0;

      const dateStr = new Date(sale.salesDate).toISOString().split("T")[0];
      if (store.dailyData.has(dateStr)) {
        const daily = store.dailyData.get(dateStr)!;
        daily.sales += sale.salesAmount;
        daily.grossProfit += sale.grossProfit || 0;
        daily.customers += sale.customerCount || 0;
      }
    }

    // 予算データ集計
    for (const budget of budgets) {
      const sid = budget.storeId;
      if (!storeMap.has(sid)) continue;
      const store = storeMap.get(sid)!;
      store.budgetAmount += budget.budgetAmount;
      store.budgetHours += budget.budgetHours || 0;
    }

    // 結果整形
    const storeResults = Array.from(storeMap.values())
      .filter(s => s.recordCount > 0)
      .sort((a, b) => a.storeCode.localeCompare(b.storeCode))
      .map((store) => {
        const totalWorkHours = Math.round(store.totalWorkMinutes / 60 * 10) / 10;
        const laborCostRatio = store.totalSales > 0
          ? Math.round((store.totalLaborCost / store.totalSales) * 1000) / 10
          : null;
        const mhProductivity = totalWorkHours > 0
          ? Math.round(store.totalSales / totalWorkHours)
          : null;
        const budgetVariance = store.budgetAmount > 0
          ? store.budgetAmount - store.totalLaborCost
          : null;
        const avgCustomerSpend = store.totalCustomers > 0
          ? Math.round(store.totalSales / store.totalCustomers)
          : null;

        return {
          storeId: store.storeId,
          storeName: store.storeName,
          storeCode: store.storeCode,
          totalLaborCost: store.totalLaborCost,
          totalWorkHours,
          totalSales: store.totalSales,
          totalGrossProfit: store.totalGrossProfit,
          totalCustomers: store.totalCustomers,
          shiftCount: store.recordCount,
          employeeCount: store.employeeIds.size,
          laborCostRatio,
          mhProductivity,
          avgCustomerSpend,
          budgetAmount: store.budgetAmount,
          budgetHours: store.budgetHours,
          budgetVariance,
          budgetAchievement: store.budgetAmount > 0
            ? Math.round((store.totalLaborCost / store.budgetAmount) * 1000) / 10
            : null,
          fullTime: {
            hours: Math.round(store.fullTimeMinutes / 60 * 10) / 10,
            cost: store.fullTimeCost,
          },
          partTime: {
            hours: Math.round(store.partTimeMinutes / 60 * 10) / 10,
            cost: store.partTimeCost,
          },
          dailyTrend: Array.from(store.dailyData.values())
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((d) => ({
              date: d.date,
              laborCost: d.laborCost,
              workHours: Math.round(d.workMinutes / 60 * 10) / 10,
              sales: d.sales,
              grossProfit: d.grossProfit,
              mhProductivity: d.workMinutes > 0
                ? Math.round((d.grossProfit || d.sales) / (d.workMinutes / 60))
                : null,
              laborCostRatio: d.sales > 0
                ? Math.round((d.laborCost / d.sales) * 1000) / 10
                : null,
            })),
        };
      });

    // 全社合計
    const totals = {
      totalLaborCost: storeResults.reduce((s, r) => s + r.totalLaborCost, 0),
      totalWorkHours: storeResults.reduce((s, r) => s + r.totalWorkHours, 0),
      totalSales: storeResults.reduce((s, r) => s + r.totalSales, 0),
      totalGrossProfit: storeResults.reduce((s, r) => s + r.totalGrossProfit, 0),
      totalCustomers: storeResults.reduce((s, r) => s + r.totalCustomers, 0),
      totalBudget: storeResults.reduce((s, r) => s + r.budgetAmount, 0),
      storeCount: storeResults.length,
      laborCostRatio: null as number | null,
      mhProductivity: null as number | null,
      budgetVariance: null as number | null,
    };

    const totalSales = totals.totalSales;
    const totalHours = totals.totalWorkHours;
    totals.laborCostRatio = totalSales > 0
      ? Math.round((totals.totalLaborCost / totalSales) * 1000) / 10
      : null;
    totals.mhProductivity = totalHours > 0
      ? Math.round(totalSales / totalHours)
      : null;
    totals.budgetVariance = totals.totalBudget > 0
      ? totals.totalBudget - totals.totalLaborCost
      : null;

    return apiSuccess({
      period: {
        start: periodStart.toISOString().split("T")[0],
        end: periodEnd.toISOString().split("T")[0],
        yearMonth: budgetYearMonth,
      },
      totals,
      stores: storeResults,
    });
  } catch (error) {
    console.error("GET /api/labor-analysis error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return apiError(`人件費分析データの取得に失敗しました: ${msg}`, 500);
  }
}

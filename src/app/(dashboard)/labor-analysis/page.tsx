"use client";

import { useState, useEffect, useCallback } from "react";

// ============================================================
// 人件費分析ダッシュボード
// - KPIカード（人件費率・MH生産性・客単価・予算対比）
// - 店舗別比較テーブル
// - 日別推移グラフ
// - 雇用形態別内訳
// ============================================================

type DailyTrend = {
  date: string;
  laborCost: number;
  workHours: number;
  sales: number;
  grossProfit: number;
  mhProductivity: number | null;
  laborCostRatio: number | null;
};

type StoreResult = {
  storeId: string;
  storeName: string;
  storeCode: string;
  totalLaborCost: number;
  totalWorkHours: number;
  totalSales: number;
  totalGrossProfit: number;
  totalCustomers: number;
  shiftCount: number;
  employeeCount: number;
  laborCostRatio: number | null;
  mhProductivity: number | null;
  avgCustomerSpend: number | null;
  budgetAmount: number;
  budgetHours: number;
  budgetVariance: number | null;
  budgetAchievement: number | null;
  fullTime: { hours: number; cost: number };
  partTime: { hours: number; cost: number };
  dailyTrend: DailyTrend[];
};

type MonthlyTrend = {
  yearMonth: string;
  laborCost: number;
  workHours: number;
  sales: number;
  grossProfit: number;
  customers: number;
  laborCostRatio: number | null;
  mhProductivity: number | null;
};

type AnalysisData = {
  period: { start: string; end: string; yearMonth: string };
  totals: {
    totalLaborCost: number;
    totalWorkHours: number;
    totalSales: number;
    totalGrossProfit: number;
    totalCustomers: number;
    totalBudget: number;
    storeCount: number;
    laborCostRatio: number | null;
    mhProductivity: number | null;
    budgetVariance: number | null;
  };
  stores: StoreResult[];
  monthlyTrend: MonthlyTrend[];
};

// 月選択用：過去18ヶ月分のオプション生成
function generateMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
    options.push({ value, label });
  }
  return options;
}

type Store = { id: string; name: string; code: string };

function formatCurrency(val: number): string {
  if (val >= 10000) return `${Math.round(val / 10000).toLocaleString()}万円`;
  return `${val.toLocaleString()}円`;
}

function formatNumber(val: number): string {
  return val.toLocaleString();
}

// ============================================================
// KPIカード
// ============================================================
function KpiCard({
  title,
  value,
  unit,
  subText,
  color,
  icon,
}: {
  title: string;
  value: string;
  unit?: string;
  subText?: string;
  color: string;
  icon: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${color}`}>
          {icon}
        </div>
        <span className="text-sm text-gray-500">{title}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        {unit && <span className="text-sm text-gray-500">{unit}</span>}
      </div>
      {subText && <p className="text-xs text-gray-400 mt-1">{subText}</p>}
    </div>
  );
}

// ============================================================
// 月別推移チャート（Canvas描画）
// ============================================================
function MonthlyTrendChart({
  data,
  metric,
}: {
  data: MonthlyTrend[];
  metric: "laborCost" | "mhProductivity" | "laborCostRatio" | "sales" | "grossProfit";
}) {
  const canvasId = `chart-${metric}`;

  useEffect(() => {
    // データがあるもの（値が0でないもの）だけ表示
    const hasData = data.some((d) => {
      const v = d[metric];
      return v !== null && v !== undefined && v !== 0;
    });
    if (!hasData) return;

    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const pad = { top: 20, right: 20, bottom: 40, left: 70 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    const values = data.map((d) => {
      const v = d[metric];
      return v !== null && v !== undefined ? v : 0;
    });
    const maxVal = Math.max(...values, 1);
    const minVal = Math.min(...values.filter(v => v > 0), 0);
    const range = maxVal - minVal || 1;

    ctx.clearRect(0, 0, W, H);

    // グリッド線
    ctx.strokeStyle = "#f0f0f0";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();

      ctx.fillStyle = "#9ca3af";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      const label = maxVal - (range / 4) * i;
      if (metric === "laborCostRatio") {
        ctx.fillText(`${label.toFixed(1)}%`, pad.left - 8, y + 4);
      } else if (metric === "laborCost" || metric === "sales" || metric === "grossProfit") {
        ctx.fillText(`${Math.round(label / 10000)}万`, pad.left - 8, y + 4);
      } else {
        ctx.fillText(`${Math.round(label).toLocaleString()}`, pad.left - 8, y + 4);
      }
    }

    // X軸ラベル（月）
    ctx.textAlign = "center";
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px sans-serif";
    data.forEach((d, i) => {
      const x = pad.left + (chartW / (data.length - 1 || 1)) * i;
      const parts = d.yearMonth.split("-");
      const monthLabel = `${parts[1]}月`;
      // 1月は年も表示
      const label = parts[1] === "01" ? `${parts[0]}/${parts[1]}` : monthLabel;
      ctx.fillText(label, x, H - pad.bottom + 20);
    });

    // データがある月だけ線を引く（0の月はスキップ）
    const colors: Record<string, string> = {
      laborCost: "#ef4444",
      mhProductivity: "#3b82f6",
      laborCostRatio: "#f59e0b",
      sales: "#10b981",
      grossProfit: "#8b5cf6",
    };
    ctx.strokeStyle = colors[metric] || "#3b82f6";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let started = false;
    values.forEach((v, i) => {
      if (v === 0 && metric !== "laborCostRatio") return;
      const x = pad.left + (chartW / (data.length - 1 || 1)) * i;
      const y = pad.top + chartH - ((v - minVal) / range) * chartH;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // ドット
    ctx.fillStyle = colors[metric] || "#3b82f6";
    values.forEach((v, i) => {
      if (v === 0 && metric !== "laborCostRatio") return;
      const x = pad.left + (chartW / (data.length - 1 || 1)) * i;
      const y = pad.top + chartH - ((v - minVal) / range) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [data, metric, canvasId]);

  const titles: Record<string, string> = {
    laborCost: "人件費推移（月別）",
    mhProductivity: "MH生産性推移（月別）",
    laborCostRatio: "人件費率推移（月別）",
    sales: "売上推移（月別）",
    grossProfit: "荒利推移（月別）",
  };

  const hasData = data.some((d) => {
    const v = d[metric];
    return v !== null && v !== undefined && v !== 0;
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{titles[metric]}</h3>
      {hasData ? (
        <canvas id={canvasId} className="w-full" style={{ height: 200 }} />
      ) : (
        <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
          データがありません
        </div>
      )}
    </div>
  );
}

// ============================================================
// 雇用形態別内訳バー
// ============================================================
function EmploymentTypeBar({ fullTime, partTime }: {
  fullTime: { hours: number; cost: number };
  partTime: { hours: number; cost: number };
}) {
  const totalCost = fullTime.cost + partTime.cost;
  const ftPct = totalCost > 0 ? (fullTime.cost / totalCost) * 100 : 0;
  const ptPct = totalCost > 0 ? (partTime.cost / totalCost) * 100 : 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">雇用形態別人件費内訳</h3>
      {totalCost > 0 ? (
        <>
          <div className="flex rounded-lg overflow-hidden h-8 mb-3">
            <div
              className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${ftPct}%` }}
            >
              {ftPct >= 15 && `${ftPct.toFixed(0)}%`}
            </div>
            <div
              className="bg-orange-400 flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${ptPct}%` }}
            >
              {ptPct >= 15 && `${ptPct.toFixed(0)}%`}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded" />
              <span className="text-gray-600">正社員</span>
              <span className="ml-auto font-medium">{formatCurrency(fullTime.cost)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-400 rounded" />
              <span className="text-gray-600">パート・アルバイト</span>
              <span className="ml-auto font-medium">{formatCurrency(partTime.cost)}</span>
            </div>
            <div className="text-gray-400 text-xs pl-5">{fullTime.hours}h</div>
            <div className="text-gray-400 text-xs pl-5">{partTime.hours}h</div>
          </div>
        </>
      ) : (
        <div className="h-16 flex items-center justify-center text-gray-400 text-sm">
          データがありません
        </div>
      )}
    </div>
  );
}

// ============================================================
// メインページ
// ============================================================
export default function LaborAnalysisPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [yearMonth, setYearMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreResult | null>(null);

  // 店舗リスト取得
  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setStores(res.data);
      })
      .catch(console.error);
  }, []);

  // 分析データ取得
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ yearMonth });
      if (selectedStoreId) params.set("storeId", selectedStoreId);
      const res = await fetch(`/api/labor-analysis?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        // 店舗が1つならそれを選択
        if (json.data.stores.length === 1) {
          setSelectedStore(json.data.stores[0]);
        } else {
          setSelectedStore(null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch labor analysis:", err);
    } finally {
      setLoading(false);
    }
  }, [yearMonth, selectedStoreId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 月別推移データ
  const monthlyTrendData: MonthlyTrend[] = data?.monthlyTrend || [];

  const totals = data?.totals;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">人件費分析</h1>
          <p className="text-sm text-gray-500 mt-1">
            人件費率・MH生産性・予算対比を可視化
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stores.length > 1 && (
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">全店舗</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {generateMonthOptions().map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : !data ? (
        <div className="text-center text-gray-400 py-20">
          データを取得できませんでした
        </div>
      ) : (
        <>
          {/* KPIカード */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard
              title="人件費合計"
              value={formatCurrency(totals?.totalLaborCost || 0)}
              icon="💰"
              color="bg-red-50"
              subText={`投入 ${totals?.totalWorkHours || 0}時間`}
            />
            <KpiCard
              title="人件費率"
              value={totals?.laborCostRatio != null ? `${totals.laborCostRatio}` : "-"}
              unit="%"
              icon="📊"
              color="bg-amber-50"
              subText={totals?.totalSales ? `売上: ${formatCurrency(totals.totalSales)}` : "売上データなし"}
            />
            <KpiCard
              title="人時生産性"
              value={
                totals?.totalGrossProfit && totals.totalWorkHours > 0
                  ? formatNumber(Math.round(totals.totalGrossProfit / totals.totalWorkHours))
                  : totals?.mhProductivity != null ? formatNumber(totals.mhProductivity) : "-"
              }
              unit="円/h"
              icon="⚡"
              color="bg-blue-50"
              subText={
                totals?.totalGrossProfit
                  ? `荒利高: ${formatCurrency(totals.totalGrossProfit)}`
                  : "荒利高 ÷ 投入時間（荒利データ未登録時は売上ベース）"
              }
            />
            <KpiCard
              title="人時売上高"
              value={totals?.mhProductivity != null ? formatNumber(totals.mhProductivity) : "-"}
              unit="円/h"
              icon="📈"
              color="bg-green-50"
              subText="売上高 ÷ 投入時間"
            />
            <KpiCard
              title="予算対比"
              value={
                totals?.budgetVariance != null
                  ? `${totals.budgetVariance >= 0 ? "+" : ""}${formatCurrency(totals.budgetVariance)}`
                  : "-"
              }
              icon="🎯"
              color={totals?.budgetVariance != null && totals.budgetVariance < 0 ? "bg-red-50" : "bg-green-50"}
              subText={totals?.totalBudget ? `予算: ${formatCurrency(totals.totalBudget)}` : "予算未設定"}
            />
          </div>

          {/* 店舗別比較テーブル */}
          {data.stores.length > 1 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">店舗別比較</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">店舗</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">売上</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">人件費</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">人件費率</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">MH生産性</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">投入時間</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">人数</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">予算対比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stores.map((store) => (
                      <tr
                        key={store.storeId}
                        className={`border-t border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors ${
                          selectedStore?.storeId === store.storeId ? "bg-blue-50" : ""
                        }`}
                        onClick={() =>
                          setSelectedStore(
                            selectedStore?.storeId === store.storeId ? null : store
                          )
                        }
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">{store.storeName}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(store.totalSales)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(store.totalLaborCost)}</td>
                        <td className="px-4 py-3 text-right">
                          {store.laborCostRatio != null ? (
                            <span className={store.laborCostRatio > 30 ? "text-red-600 font-semibold" : ""}>
                              {store.laborCostRatio}%
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {store.mhProductivity != null ? `${formatNumber(store.mhProductivity)}円` : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">{store.totalWorkHours}h</td>
                        <td className="px-4 py-3 text-right">{store.employeeCount}名</td>
                        <td className="px-4 py-3 text-right">
                          {store.budgetAchievement != null ? (
                            <span className={store.budgetAchievement > 100 ? "text-red-600 font-semibold" : "text-green-600"}>
                              {store.budgetAchievement}%
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 月別推移チャート */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MonthlyTrendChart data={monthlyTrendData} metric="laborCost" />
            <MonthlyTrendChart data={monthlyTrendData} metric="sales" />
            <MonthlyTrendChart data={monthlyTrendData} metric="grossProfit" />
            <MonthlyTrendChart data={monthlyTrendData} metric="mhProductivity" />
            <MonthlyTrendChart data={monthlyTrendData} metric="laborCostRatio" />
          </div>

          {/* 雇用形態別内訳 */}
          {selectedStore ? (
            <EmploymentTypeBar
              fullTime={selectedStore.fullTime}
              partTime={selectedStore.partTime}
            />
          ) : data.stores.length === 1 ? (
            <EmploymentTypeBar
              fullTime={data.stores[0].fullTime}
              partTime={data.stores[0].partTime}
            />
          ) : (
            <EmploymentTypeBar
              fullTime={{
                hours: data.stores.reduce((s, r) => s + r.fullTime.hours, 0),
                cost: data.stores.reduce((s, r) => s + r.fullTime.cost, 0),
              }}
              partTime={{
                hours: data.stores.reduce((s, r) => s + r.partTime.hours, 0),
                cost: data.stores.reduce((s, r) => s + r.partTime.cost, 0),
              }}
            />
          )}

          {/* 売上データ未登録の案内 */}
          {totals && totals.totalSales === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">
                売上データが未登録です
              </h3>
              <p className="text-sm text-amber-700">
                人件費率やMH生産性を算出するには、日別売上データの登録が必要です。
                「売上入力」メニューから手入力またはCSV取込で登録してください。
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

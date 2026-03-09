"use client";

import { useState, useEffect, useMemo } from "react";
import { Chart, registerables } from "chart.js";

// Chart.jsの全コンポーネントを登録
if (typeof window !== "undefined") {
  Chart.register(...registerables);
}

// ============================================================
// 勤怠ダッシュボード
// 14ヶ月分の勤怠データをKPI・チャート・テーブルで可視化
// ============================================================

interface StoreInfo { id: string; name: string; code: string }
interface MonthlyRow {
  month: string; storeId: string; workHours: number; overtimeHours: number;
  laborCost: number; attendanceDays: number; lateDays: number; uniqueEmployees: number;
}
interface DowRow { dow: number; storeId: string; avgHours: number; totalDays: number }
interface StoreEmpRow {
  storeId: string; storeName: string;
  fullTime: number; partTime: number; arbeit: number; contract: number; total: number;
}
interface DashboardData {
  stores: StoreInfo[];
  summary: { totalEmployees: number; totalStores: number; totalRecords: number; dateRange: { from: string; to: string } };
  monthly: MonthlyRow[];
  byDow: DowRow[];
  storeEmpBreakdown: StoreEmpRow[];
}

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#e11d48", "#a855f7", "#22c55e", "#eab308",
  "#0ea5e9", "#d946ef", "#64748b", "#fb923c", "#2dd4bf", "#facc15",
];

// Chart.jsはnpmパッケージから直接import済み

function formatNum(n: number): string {
  return n.toLocaleString("ja-JP");
}
function formatYen(n: number): string {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}億`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}万`;
  return `¥${n.toLocaleString()}`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStore, setSelectedStore] = useState<string>("ALL");
  const [chartJsReady, setChartJsReady] = useState(false);

  // Chart.js準備完了
  useEffect(() => {
    setChartJsReady(true);
  }, []);

  useEffect(() => {
    fetch("/api/admin/dashboard-data")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // フィルタ済みデータ
  const filtered = useMemo(() => {
    if (!data) return null;
    const monthly = selectedStore === "ALL"
      ? data.monthly
      : data.monthly.filter(r => r.storeId === selectedStore);
    const byDow = selectedStore === "ALL"
      ? data.byDow
      : data.byDow.filter(r => r.storeId === selectedStore);
    return { monthly, byDow };
  }, [data, selectedStore]);

  // 月別集約（全店舗合算）
  const monthlyAgg = useMemo(() => {
    if (!filtered) return [];
    const map = new Map<string, { workHours: number; overtimeHours: number; laborCost: number; attendanceDays: number; lateDays: number; employees: number }>();
    for (const r of filtered.monthly) {
      const prev = map.get(r.month) || { workHours: 0, overtimeHours: 0, laborCost: 0, attendanceDays: 0, lateDays: 0, employees: 0 };
      prev.workHours += r.workHours;
      prev.overtimeHours += r.overtimeHours;
      prev.laborCost += r.laborCost;
      prev.attendanceDays += r.attendanceDays;
      prev.lateDays += r.lateDays;
      prev.employees += r.uniqueEmployees;
      map.set(r.month, prev);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));
  }, [filtered]);

  // 曜日別集約
  const dowAgg = useMemo(() => {
    if (!filtered) return Array(7).fill({ avgHours: 0, totalDays: 0 });
    const agg = Array.from({ length: 7 }, () => ({ totalMinutes: 0, count: 0 }));
    for (const r of filtered.byDow) {
      agg[r.dow].totalMinutes += r.avgHours * r.totalDays * 60;
      agg[r.dow].count += r.totalDays;
    }
    return agg.map(a => ({
      avgHours: a.count > 0 ? Math.round(a.totalMinutes / a.count / 60 * 10) / 10 : 0,
      totalDays: a.count,
    }));
  }, [filtered]);

  // KPI計算
  const kpis = useMemo(() => {
    if (!monthlyAgg.length) return null;
    const totalWorkHours = monthlyAgg.reduce((s, r) => s + r.workHours, 0);
    const totalOvertimeHours = monthlyAgg.reduce((s, r) => s + r.overtimeHours, 0);
    const totalLaborCost = monthlyAgg.reduce((s, r) => s + r.laborCost, 0);
    const totalAttendanceDays = monthlyAgg.reduce((s, r) => s + r.attendanceDays, 0);
    const totalLateDays = monthlyAgg.reduce((s, r) => s + r.lateDays, 0);
    const months = monthlyAgg.length;

    // 前年同月比（最新月 vs 12ヶ月前）
    const latest = monthlyAgg[monthlyAgg.length - 1];
    const latestMonth = latest.month;
    const [y, m] = latestMonth.split("-").map(Number);
    const prevYearMonth = `${y - 1}-${String(m).padStart(2, "0")}`;
    const prevYear = monthlyAgg.find(r => r.month === prevYearMonth);

    return {
      totalWorkHours: Math.round(totalWorkHours),
      avgMonthlyWorkHours: Math.round(totalWorkHours / months),
      totalOvertimeHours: Math.round(totalOvertimeHours),
      overtimeRate: totalWorkHours > 0 ? Math.round(totalOvertimeHours / totalWorkHours * 1000) / 10 : 0,
      totalLaborCost,
      avgMonthlyLaborCost: Math.round(totalLaborCost / months),
      totalAttendanceDays,
      avgDailyHours: totalAttendanceDays > 0 ? Math.round(totalWorkHours / totalAttendanceDays * 10) / 10 : 0,
      lateRate: totalAttendanceDays > 0 ? Math.round(totalLateDays / totalAttendanceDays * 1000) / 10 : 0,
      // 前年比
      yoyLaborCost: prevYear && prevYear.laborCost > 0 ? Math.round((latest.laborCost / prevYear.laborCost - 1) * 1000) / 10 : null,
      yoyWorkHours: prevYear && prevYear.workHours > 0 ? Math.round((latest.workHours / prevYear.workHours - 1) * 1000) / 10 : null,
      latestMonth: latest.month,
    };
  }, [monthlyAgg]);

  // Chart.js描画
  useEffect(() => {
    if (!chartJsReady || !monthlyAgg.length || !data) return;

    // 月別労働時間・人件費チャート
    const ctx1 = document.getElementById("chart-monthly") as HTMLCanvasElement;
    if (ctx1) {
      const existing = Chart.getChart(ctx1);
      if (existing) existing.destroy();
      new Chart(ctx1, {
        type: "bar",
        data: {
          labels: monthlyAgg.map(r => r.month),
          datasets: [
            {
              label: "労働時間(h)",
              data: monthlyAgg.map(r => r.workHours),
              backgroundColor: "rgba(59,130,246,0.7)",
              yAxisID: "y",
            },
            {
              label: "残業時間(h)",
              data: monthlyAgg.map(r => r.overtimeHours),
              backgroundColor: "rgba(239,68,68,0.7)",
              yAxisID: "y",
            },
            {
              label: "人件費(万円)",
              data: monthlyAgg.map(r => Math.round(r.laborCost / 10000)),
              type: "line",
              borderColor: "#10b981",
              backgroundColor: "rgba(16,185,129,0.1)",
              fill: true,
              yAxisID: "y1",
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { position: "top" } },
          scales: {
            y: { position: "left", title: { display: true, text: "時間(h)" } },
            y1: { position: "right", title: { display: true, text: "万円" }, grid: { drawOnChartArea: false } },
          },
        },
      });
    }

    // 曜日別平均労働時間
    const ctx2 = document.getElementById("chart-dow") as HTMLCanvasElement;
    if (ctx2) {
      const existing = Chart.getChart(ctx2);
      if (existing) existing.destroy();
      new Chart(ctx2, {
        type: "bar",
        data: {
          labels: DOW_LABELS,
          datasets: [{
            label: "平均労働時間(h)",
            data: dowAgg.map(d => d.avgHours),
            backgroundColor: DOW_LABELS.map((_, i) => i === 0 ? "rgba(239,68,68,0.7)" : i === 6 ? "rgba(59,130,246,0.7)" : "rgba(107,114,128,0.5)"),
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { title: { display: true, text: "時間(h)" } } },
        },
      });
    }

    // 店舗別従業員構成
    const ctx3 = document.getElementById("chart-emp-breakdown") as HTMLCanvasElement;
    if (ctx3 && data.storeEmpBreakdown.length > 0) {
      const existing = Chart.getChart(ctx3);
      if (existing) existing.destroy();
      const breakdown = data.storeEmpBreakdown.sort((a, b) => b.total - a.total);
      new Chart(ctx3, {
        type: "bar",
        data: {
          labels: breakdown.map(s => s.storeName),
          datasets: [
            { label: "正社員", data: breakdown.map(s => s.fullTime), backgroundColor: "#3b82f6" },
            { label: "パート", data: breakdown.map(s => s.partTime), backgroundColor: "#10b981" },
            { label: "アルバイト", data: breakdown.map(s => s.arbeit), backgroundColor: "#f59e0b" },
            { label: "契約", data: breakdown.map(s => s.contract), backgroundColor: "#8b5cf6" },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: "top" } },
          scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: "人数" } } },
        },
      });
    }

    // 店舗別月次人件費ヒートマップ的チャート（上位10店舗）
    const ctx4 = document.getElementById("chart-store-cost") as HTMLCanvasElement;
    if (ctx4 && data.stores.length > 0) {
      const existing = Chart.getChart(ctx4);
      if (existing) existing.destroy();
      // 店舗別月次人件費
      const storeTotals = new Map<string, number>();
      for (const r of data.monthly) {
        storeTotals.set(r.storeId, (storeTotals.get(r.storeId) || 0) + r.laborCost);
      }
      const topStores = data.stores
        .filter(s => storeTotals.has(s.id))
        .sort((a, b) => (storeTotals.get(b.id) || 0) - (storeTotals.get(a.id) || 0))
        .slice(0, 10);

      const allMonths = [...new Set(data.monthly.map(r => r.month))].sort();

      new Chart(ctx4, {
        type: "line",
        data: {
          labels: allMonths,
          datasets: topStores.map((s, i) => {
            const storeMonthly = new Map(
              data.monthly.filter(r => r.storeId === s.id).map(r => [r.month, r.laborCost])
            );
            return {
              label: s.name,
              data: allMonths.map(m => Math.round((storeMonthly.get(m) || 0) / 10000)),
              borderColor: COLORS[i % COLORS.length],
              backgroundColor: "transparent",
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 1,
            };
          }),
        },
        options: {
          responsive: true,
          plugins: { legend: { position: "right" } },
          scales: { y: { title: { display: true, text: "万円" } } },
        },
      });
    }
  }, [chartJsReady, monthlyAgg, dowAgg, data]);

  if (loading) return <div className="p-8 text-gray-500">データ読み込み中...</div>;
  if (error) return <div className="p-8 text-red-600">エラー: {error}</div>;
  if (!data || !kpis) return <div className="p-8 text-gray-500">データがありません</div>;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">勤怠ダッシュボード</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            {data.summary.dateRange.from?.split("T")[0]} 〜 {data.summary.dateRange.to?.split("T")[0]} |
            {formatNum(data.summary.totalRecords)}件
          </p>
        </div>
        <select
          value={selectedStore}
          onChange={(e) => setSelectedStore(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm w-full sm:w-auto"
        >
          <option value="ALL">全店舗</option>
          {data.stores.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
        <KpiCard label="月平均労働時間" value={`${formatNum(kpis.avgMonthlyWorkHours)}h`}
          sub={`総計 ${formatNum(kpis.totalWorkHours)}h`}
          yoy={kpis.yoyWorkHours} />
        <KpiCard label="月平均人件費" value={formatYen(kpis.avgMonthlyLaborCost)}
          sub={`総計 ${formatYen(kpis.totalLaborCost)}`}
          yoy={kpis.yoyLaborCost} />
        <KpiCard label="残業率" value={`${kpis.overtimeRate}%`}
          sub={`残業 ${formatNum(kpis.totalOvertimeHours)}h`}
          alert={kpis.overtimeRate > 10} />
        <KpiCard label="1日平均労働" value={`${kpis.avgDailyHours}h`}
          sub={`遅刻率 ${kpis.lateRate}%`} />
      </div>

      {/* チャート: 月別推移 */}
      <div className="bg-white rounded-xl shadow-sm border p-3 sm:p-5">
        <h2 className="text-sm sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-4">月別 労働時間・残業・人件費推移</h2>
        <div className="overflow-x-auto -mx-1">
          <div className="min-w-[400px]">
            <canvas id="chart-monthly" height="120" />
          </div>
        </div>
      </div>

      {/* チャート2段 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-3 sm:p-5">
          <h2 className="text-sm sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-4">曜日別 平均労働時間</h2>
          <canvas id="chart-dow" height="160" />
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-3 sm:p-5">
          <h2 className="text-sm sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-4">店舗別 従業員構成</h2>
          <canvas id="chart-emp-breakdown" height="160" />
        </div>
      </div>

      {/* テーブル: 店舗別従業員構成 */}
      {data.storeEmpBreakdown.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-3 sm:p-5">
          <h2 className="text-sm sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-4">店舗別 従業員構成（テーブル）</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-600">店舗</th>
                  <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-600 text-right">正社員</th>
                  <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-600 text-right">パート</th>
                  <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-600 text-right">アルバイト</th>
                  <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-600 text-right">契約</th>
                  <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-600 text-right">合計</th>
                </tr>
              </thead>
              <tbody>
                {data.storeEmpBreakdown
                  .sort((a, b) => b.total - a.total)
                  .map((s, i) => (
                    <tr key={s.storeId} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium">{s.storeName}</td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right">{s.fullTime}</td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right">{s.partTime}</td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right">{s.arbeit}</td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right">{s.contract}</td>
                      <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right font-medium">{s.total}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* チャート: 店舗別人件費推移 */}
      <div className="bg-white rounded-xl shadow-sm border p-3 sm:p-5">
        <h2 className="text-sm sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-4">店舗別 月次人件費推移（上位10店舗）</h2>
        <div className="overflow-x-auto -mx-1">
          <div className="min-w-[400px]">
            <canvas id="chart-store-cost" height="120" />
          </div>
        </div>
      </div>

      {/* テーブル: 店舗別月次サマリ */}
      <div className="bg-white rounded-xl shadow-sm border p-3 sm:p-5">
        <h2 className="text-sm sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-4">月次データ一覧</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-600">月</th>
                <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-600 text-right">出勤人数</th>
                <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-600 text-right">延べ日数</th>
                <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-600 text-right">労働時間</th>
                <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-600 text-right">残業</th>
                <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-600 text-right">残業率</th>
                <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-600 text-right">人件費</th>
                <th className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium text-gray-600 text-right">遅刻</th>
              </tr>
            </thead>
            <tbody>
              {monthlyAgg.map((r, i) => {
                const otRate = r.workHours > 0 ? (r.overtimeHours / r.workHours * 100).toFixed(1) : "0";
                return (
                  <tr key={r.month} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 font-medium whitespace-nowrap">{r.month}</td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right">{formatNum(r.employees)}</td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right">{formatNum(r.attendanceDays)}</td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right">{formatNum(r.workHours)}h</td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right">{formatNum(r.overtimeHours)}h</td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right">{otRate}%</td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right">{formatYen(r.laborCost)}</td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-right">{formatNum(r.lateDays)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, yoy, alert }: {
  label: string; value: string; sub?: string;
  yoy?: number | null; alert?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-3 sm:p-5 ${alert ? "border-red-300" : ""}`}>
      <div className="text-xs sm:text-sm text-gray-500 mb-1">{label}</div>
      <div className={`text-lg sm:text-2xl font-bold ${alert ? "text-red-600" : "text-gray-900"}`}>{value}</div>
      <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-1">
        {sub && <span className="text-[10px] sm:text-xs text-gray-400">{sub}</span>}
        {yoy !== null && yoy !== undefined && (
          <span className={`text-[10px] sm:text-xs font-medium px-1 sm:px-1.5 py-0.5 rounded ${yoy >= 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
            前年比 {yoy >= 0 ? "+" : ""}{yoy}%
          </span>
        )}
      </div>
    </div>
  );
}

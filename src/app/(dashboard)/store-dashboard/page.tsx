"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Chart, registerables } from "chart.js";

// Chart.jsの全コンポーネントを登録
if (typeof window !== "undefined") {
  Chart.register(...registerables);
}

// ============================================================
// 店舗長ダッシュボード
// 自店舗の人時数・人件費・勤怠状況をリアルタイムに把握
// ============================================================

const EMP_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: "正社員", PART_TIME: "パート", ARBEIT: "アルバイト", CONTRACT: "契約", OTHER: "その他",
};
const DOW_SHORT = ["月", "火", "水", "木", "金", "土", "日"];

interface StoreOption { id: string; name: string }
interface PeriodSummary {
  period: string; workHours: number; overtimeHours: number;
  laborCost: number; workingDays: number; lateDays: number;
  uniqueEmployees: number; avgDailyHours: number;
}
interface DailyRow {
  date: string; workHours: number; overtimeHours: number;
  laborCost: number; headcount: number; lateDays: number;
}
interface WeekDayData { clockIn: string | null; clockOut: string | null; workHours: number; overtime: number }
interface WeeklyEmployee {
  code: string; name: string; employmentType: string;
  totalHours: number; days: Record<string, WeekDayData | null>;
}
interface EmpTypeRow { type: string; count: number; workHours: number; laborCost: number }
interface WeeklyDailyRow {
  date: string; dow: number; workHours: number; overtimeHours: number;
  laborCost: number; headcount: number;
}
interface WeeklyTrendRow {
  weekStart: string; weekEnd: string; weekLabel: string;
  workHours: number; overtimeHours: number; laborCost: number; headcount: number;
}
interface AvailableWeek { weekStart: string; label: string }
interface StoreData {
  store: { id: string; name: string };
  employeeCount: number;
  availableWeeks: AvailableWeek[];
  selectedWeekStart: string;
  thisMonth: PeriodSummary;
  lastMonth: PeriodSummary;
  prevYear: PeriodSummary;
  dailyData: DailyRow[];
  weeklyComparison: {
    thisWeek: PeriodSummary;
    lastWeek: PeriodSummary;
    prevYearWeek: PeriodSummary;
  };
  thisWeekDaily: WeeklyDailyRow[];
  lastWeekDaily: WeeklyDailyRow[];
  weeklyTrend: WeeklyTrendRow[];
  weekDates: string[];
  weeklySchedule: WeeklyEmployee[];
  byEmploymentType: EmpTypeRow[];
}

// Chart.jsはnpmパッケージから直接import済み

function fmtNum(n: number) { return n.toLocaleString("ja-JP"); }
function fmtYen(n: number) {
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}万円`;
  return `¥${n.toLocaleString()}`;
}
function pctChange(cur: number, prev: number): { value: string; positive: boolean } | null {
  if (!prev) return null;
  const pct = Math.round((cur / prev - 1) * 1000) / 10;
  return { value: `${pct >= 0 ? "+" : ""}${pct}%`, positive: pct >= 0 };
}

export default function StoreDashboardPage() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // 年月ドロップダウン用の選択肢を生成（過去24ヶ月〜当月）
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i <= 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
      opts.push({ value: val, label });
    }
    return opts;
  }, []);
  const [data, setData] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartJsReady, setChartJsReady] = useState(false);
  const [weekFilter, setWeekFilter] = useState<string>("ALL");
  const [selectedWeek, setSelectedWeek] = useState<string>(""); // weekStart date string

  // Chart.js準備完了
  useEffect(() => {
    setChartJsReady(true);
  }, []);

  // 店舗一覧
  useEffect(() => {
    fetch("/api/stores").then(r => r.json()).then(d => {
      const list = d.data || d || [];
      setStores(Array.isArray(list) ? list : []);
      if (list.length > 0) setSelectedStoreId(list[0].id);
    }).catch(() => {});
  }, []);

  // 月が変わったら週選択をリセット
  useEffect(() => {
    setSelectedWeek("");
  }, [selectedMonth]);

  // 店舗データ取得
  useEffect(() => {
    if (!selectedStoreId) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      storeId: selectedStoreId,
      month: selectedMonth,
    });
    if (selectedWeek) params.set("weekStart", selectedWeek);
    fetch(`/api/admin/store-dashboard?${params}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedStoreId, selectedMonth, selectedWeek]);

  // 週間フィルタ
  const filteredWeekly = useMemo(() => {
    if (!data) return [];
    if (weekFilter === "ALL") return data.weeklySchedule;
    return data.weeklySchedule.filter(e => e.employmentType === weekFilter);
  }, [data, weekFilter]);

  // Chart.js描画
  useEffect(() => {
    if (!chartJsReady || !data) return;

    // 日別人時数チャート
    const ctx1 = document.getElementById("chart-daily") as HTMLCanvasElement;
    if (ctx1 && data.dailyData.length > 0) {
      const existing = Chart.getChart(ctx1);
      if (existing) existing.destroy();
      new Chart(ctx1, {
        type: "bar",
        data: {
          labels: data.dailyData.map(d => {
            const dt = new Date(d.date);
            return `${dt.getMonth() + 1}/${dt.getDate()}(${DOW_SHORT[(dt.getDay() + 6) % 7]})`;
          }),
          datasets: [
            {
              label: "通常(h)",
              data: data.dailyData.map(d => Math.round((d.workHours - d.overtimeHours) * 10) / 10),
              backgroundColor: "rgba(59,130,246,0.7)",
            },
            {
              label: "残業(h)",
              data: data.dailyData.map(d => d.overtimeHours),
              backgroundColor: "rgba(239,68,68,0.7)",
            },
            {
              label: "出勤人数",
              data: data.dailyData.map(d => d.headcount),
              type: "line",
              borderColor: "#10b981",
              backgroundColor: "transparent",
              yAxisID: "y1",
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { position: "top" } },
          scales: {
            x: { stacked: true },
            y: { stacked: true, position: "left", title: { display: true, text: "人時(h)" } },
            y1: { position: "right", title: { display: true, text: "人数" }, grid: { drawOnChartArea: false } },
          },
        },
      });
    }

    // 週次トレンドチャート（8週間）
    const ctx3 = document.getElementById("chart-weekly-trend") as HTMLCanvasElement;
    if (ctx3 && data.weeklyTrend.length > 0) {
      const existing = Chart.getChart(ctx3);
      if (existing) existing.destroy();
      new Chart(ctx3, {
        type: "bar",
        data: {
          labels: data.weeklyTrend.map(w => w.weekLabel),
          datasets: [
            {
              label: "通常(h)",
              data: data.weeklyTrend.map(w => Math.round((w.workHours - w.overtimeHours) * 10) / 10),
              backgroundColor: "rgba(59,130,246,0.7)",
            },
            {
              label: "残業(h)",
              data: data.weeklyTrend.map(w => w.overtimeHours),
              backgroundColor: "rgba(239,68,68,0.7)",
            },
            {
              label: "出勤人数",
              data: data.weeklyTrend.map(w => w.headcount),
              type: "line" as const,
              borderColor: "#10b981",
              backgroundColor: "transparent",
              yAxisID: "y1",
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { position: "top" } },
          scales: {
            x: { stacked: true },
            y: { stacked: true, position: "left", title: { display: true, text: "人時(h)" } },
            y1: { position: "right", title: { display: true, text: "人数" }, grid: { drawOnChartArea: false } },
          },
        },
      });
    }

    // 対象週 vs 前週 曜日別チャート
    const ctx4 = document.getElementById("chart-week-vs-week") as HTMLCanvasElement;
    if (ctx4 && data.thisWeekDaily.length > 0) {
      const existing = Chart.getChart(ctx4);
      if (existing) existing.destroy();
      new Chart(ctx4, {
        type: "bar",
        data: {
          labels: DOW_SHORT,
          datasets: [
            {
              label: "前週",
              data: data.lastWeekDaily.map(d => d.workHours),
              backgroundColor: "rgba(156,163,175,0.5)",
              borderColor: "rgba(156,163,175,1)",
              borderWidth: 1,
            },
            {
              label: "対象週",
              data: data.thisWeekDaily.map(d => d.workHours),
              backgroundColor: "rgba(59,130,246,0.7)",
              borderColor: "rgba(59,130,246,1)",
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: "top" },
            tooltip: {
              callbacks: {
                afterLabel: (ctx: any) => { // eslint-disable-line
                  const ds = ctx.datasetIndex;
                  const i = ctx.dataIndex;
                  const row = ds === 0 ? data.lastWeekDaily[i] : data.thisWeekDaily[i];
                  return row ? `出勤: ${row.headcount}名 / 残業: ${row.overtimeHours}h` : "";
                },
              },
            },
          },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: "人時(h)" } },
          },
        },
      });
    }

    // 雇用区分別構成
    const ctx2 = document.getElementById("chart-emptype") as HTMLCanvasElement;
    if (ctx2 && data.byEmploymentType.length > 0) {
      const existing = Chart.getChart(ctx2);
      if (existing) existing.destroy();
      const colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#6b7280"];
      new Chart(ctx2, {
        type: "doughnut",
        data: {
          labels: data.byEmploymentType.map(t => EMP_TYPE_LABELS[t.type] || t.type),
          datasets: [{
            data: data.byEmploymentType.map(t => t.workHours),
            backgroundColor: data.byEmploymentType.map((_, i) => colors[i % colors.length]),
          }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                label: (ctx: any) => { // eslint-disable-line
                  const idx = ctx.dataIndex;
                  const t = data.byEmploymentType[idx];
                  return `${EMP_TYPE_LABELS[t.type]}: ${fmtNum(t.workHours)}h / ${fmtYen(t.laborCost)}`;
                },
              },
            },
          },
        },
      });
    }
  }, [chartJsReady, data]);

  if (loading && !data) return <div className="p-8 text-gray-500">読み込み中...</div>;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">店舗ダッシュボード</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            {data ? `${data.store.name} | 従業員${data.employeeCount}名` : "店舗を選択してください"}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border rounded-lg px-2 sm:px-3 py-2 text-sm flex-1 sm:flex-none"
          >
            {monthOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="border rounded-lg px-2 sm:px-4 py-2 text-sm flex-1 sm:flex-none"
          >
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>}

      {data && (
        <>
          {/* 期間表示 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 sm:px-4 py-2 sm:py-3 flex flex-wrap items-center gap-2 sm:gap-6 text-xs sm:text-sm">
            <div><span className="text-blue-600 font-medium">対象月:</span> <span className="text-gray-700">{data.thisMonth.period}</span></div>
            <div><span className="text-gray-500 font-medium">前月:</span> <span className="text-gray-700">{data.lastMonth.period}</span></div>
            <div><span className="text-gray-500 font-medium">前年同月:</span> <span className="text-gray-700">{data.prevYear.period}</span></div>
          </div>

          {/* KPIカード: 今月 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4">
            <KpiCard
              label="人時数"
              value={`${fmtNum(data.thisMonth.workHours)}h`}
              change={pctChange(data.thisMonth.workHours, data.lastMonth.workHours)}
              sub={`先月 ${fmtNum(data.lastMonth.workHours)}h`}
            />
            <KpiCard
              label="人件費"
              value={fmtYen(data.thisMonth.laborCost)}
              change={pctChange(data.thisMonth.laborCost, data.lastMonth.laborCost)}
              sub={`先月 ${fmtYen(data.lastMonth.laborCost)}`}
            />
            <KpiCard
              label="残業"
              value={`${fmtNum(data.thisMonth.overtimeHours)}h`}
              change={pctChange(data.thisMonth.overtimeHours, data.lastMonth.overtimeHours)}
              sub={`先月 ${fmtNum(data.lastMonth.overtimeHours)}h`}
              alert={data.thisMonth.overtimeHours > data.lastMonth.overtimeHours * 1.2}
            />
            <KpiCard
              label="出勤人数"
              value={`${data.thisMonth.uniqueEmployees}名`}
              change={pctChange(data.thisMonth.uniqueEmployees, data.prevYear.uniqueEmployees)}
              sub={`前年 ${data.prevYear.uniqueEmployees}名`}
            />
            <KpiCard
              label="遅刻"
              value={`${data.thisMonth.lateDays}件`}
              change={pctChange(data.thisMonth.lateDays, data.lastMonth.lateDays)}
              sub={`先月 ${data.lastMonth.lateDays}件`}
              alert={data.thisMonth.lateDays > 5}
            />
          </div>

          {/* 前年同月比較 */}
          <div className="bg-white rounded-xl shadow-sm border p-3 sm:p-5">
            <h2 className="text-sm sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-3">月次比較</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left font-medium text-gray-600">指標</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">前年同月<br /><span className="text-xs font-normal">{data.prevYear.period.split(" 〜 ")[0].slice(5)}</span></th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">先月<br /><span className="text-xs font-normal">{data.lastMonth.period.split(" 〜 ")[0].slice(5)}</span></th>
                    <th className="px-3 py-2 text-right font-medium text-blue-600">今月<br /><span className="text-xs font-normal">{data.thisMonth.period.split(" 〜 ")[0].slice(5)}</span></th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">前年比</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">前月比</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "人時数(h)", cur: data.thisMonth.workHours, last: data.lastMonth.workHours, prev: data.prevYear.workHours },
                    { label: "残業(h)", cur: data.thisMonth.overtimeHours, last: data.lastMonth.overtimeHours, prev: data.prevYear.overtimeHours },
                    { label: "人件費", cur: data.thisMonth.laborCost, last: data.lastMonth.laborCost, prev: data.prevYear.laborCost, isCost: true },
                    { label: "出勤延べ日数", cur: data.thisMonth.workingDays, last: data.lastMonth.workingDays, prev: data.prevYear.workingDays },
                    { label: "出勤人数", cur: data.thisMonth.uniqueEmployees, last: data.lastMonth.uniqueEmployees, prev: data.prevYear.uniqueEmployees },
                    { label: "日平均労働(h)", cur: data.thisMonth.avgDailyHours, last: data.lastMonth.avgDailyHours, prev: data.prevYear.avgDailyHours },
                  ].map(row => (
                    <tr key={row.label} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium">{row.label}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{row.isCost ? fmtYen(row.prev) : fmtNum(row.prev)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{row.isCost ? fmtYen(row.last) : fmtNum(row.last)}</td>
                      <td className="px-3 py-2 text-right font-bold text-blue-700">{row.isCost ? fmtYen(row.cur) : fmtNum(row.cur)}</td>
                      <td className="px-3 py-2 text-right"><ChangeBadge change={pctChange(row.cur, row.prev)} /></td>
                      <td className="px-3 py-2 text-right"><ChangeBadge change={pctChange(row.cur, row.last)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ===== 週間人時比較セクション ===== */}
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl border border-indigo-200 p-3 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
              <h2 className="text-sm sm:text-lg font-bold text-indigo-800">週間人時管理</h2>
              {data.availableWeeks && data.availableWeeks.length > 0 && (
                <select
                  value={selectedWeek || data.selectedWeekStart}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="border border-indigo-300 rounded-lg px-3 py-1.5 text-sm bg-white"
                >
                  {data.availableWeeks.map(w => (
                    <option key={w.weekStart} value={w.weekStart}>{w.label}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="text-xs text-indigo-500 mb-4 flex flex-wrap gap-4">
              <span>対象週: {data.weeklyComparison.thisWeek.period}</span>
              <span>前週: {data.weeklyComparison.lastWeek.period}</span>
              <span>前年同週: {data.weeklyComparison.prevYearWeek.period}</span>
            </div>

            {/* 週次KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-5">
              <KpiCard
                label="対象週 人時数"
                value={`${fmtNum(data.weeklyComparison.thisWeek.workHours)}h`}
                change={pctChange(data.weeklyComparison.thisWeek.workHours, data.weeklyComparison.lastWeek.workHours)}
                sub={`先週 ${fmtNum(data.weeklyComparison.lastWeek.workHours)}h`}
              />
              <KpiCard
                label="対象週 人件費"
                value={fmtYen(data.weeklyComparison.thisWeek.laborCost)}
                change={pctChange(data.weeklyComparison.thisWeek.laborCost, data.weeklyComparison.lastWeek.laborCost)}
                sub={`先週 ${fmtYen(data.weeklyComparison.lastWeek.laborCost)}`}
              />
              <KpiCard
                label="対象週 残業"
                value={`${fmtNum(data.weeklyComparison.thisWeek.overtimeHours)}h`}
                change={pctChange(data.weeklyComparison.thisWeek.overtimeHours, data.weeklyComparison.lastWeek.overtimeHours)}
                sub={`先週 ${fmtNum(data.weeklyComparison.lastWeek.overtimeHours)}h`}
                alert={data.weeklyComparison.thisWeek.overtimeHours > data.weeklyComparison.lastWeek.overtimeHours * 1.2}
              />
              <KpiCard
                label="対象週 出勤人数"
                value={`${data.weeklyComparison.thisWeek.uniqueEmployees}名`}
                change={pctChange(data.weeklyComparison.thisWeek.uniqueEmployees, data.weeklyComparison.lastWeek.uniqueEmployees)}
                sub={`先週 ${data.weeklyComparison.lastWeek.uniqueEmployees}名`}
              />
            </div>

            {/* 週次比較テーブル */}
            <div className="bg-white rounded-lg border p-3 sm:p-4 mb-3 sm:mb-5">
              <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2">週次比較</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left font-medium text-gray-600">指標</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">前年同週</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">前週</th>
                      <th className="px-3 py-2 text-right font-medium text-indigo-600">対象週</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">前年比</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">前週比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "人時数(h)", cur: data.weeklyComparison.thisWeek.workHours, last: data.weeklyComparison.lastWeek.workHours, prev: data.weeklyComparison.prevYearWeek.workHours },
                      { label: "残業(h)", cur: data.weeklyComparison.thisWeek.overtimeHours, last: data.weeklyComparison.lastWeek.overtimeHours, prev: data.weeklyComparison.prevYearWeek.overtimeHours },
                      { label: "人件費", cur: data.weeklyComparison.thisWeek.laborCost, last: data.weeklyComparison.lastWeek.laborCost, prev: data.weeklyComparison.prevYearWeek.laborCost, isCost: true },
                      { label: "出勤延べ日数", cur: data.weeklyComparison.thisWeek.workingDays, last: data.weeklyComparison.lastWeek.workingDays, prev: data.weeklyComparison.prevYearWeek.workingDays },
                      { label: "出勤人数", cur: data.weeklyComparison.thisWeek.uniqueEmployees, last: data.weeklyComparison.lastWeek.uniqueEmployees, prev: data.weeklyComparison.prevYearWeek.uniqueEmployees },
                      { label: "日平均人時(h)", cur: data.weeklyComparison.thisWeek.avgDailyHours, last: data.weeklyComparison.lastWeek.avgDailyHours, prev: data.weeklyComparison.prevYearWeek.avgDailyHours },
                    ].map(row => (
                      <tr key={row.label} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-medium">{row.label}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{row.isCost ? fmtYen(row.prev) : fmtNum(row.prev)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{row.isCost ? fmtYen(row.last) : fmtNum(row.last)}</td>
                        <td className="px-3 py-2 text-right font-bold text-indigo-700">{row.isCost ? fmtYen(row.cur) : fmtNum(row.cur)}</td>
                        <td className="px-3 py-2 text-right"><ChangeBadge change={pctChange(row.cur, row.prev)} /></td>
                        <td className="px-3 py-2 text-right"><ChangeBadge change={pctChange(row.cur, row.last)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 曜日別 対象週vs前週 + 8週トレンド */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
              <div className="bg-white rounded-lg border p-3 sm:p-4">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2">曜日別人時数（対象週 vs 前週）</h3>
                <canvas id="chart-week-vs-week" height="160" />
              </div>
              <div className="bg-white rounded-lg border p-3 sm:p-4">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2">週次人時トレンド（8週間）</h3>
                <canvas id="chart-weekly-trend" height="160" />
              </div>
            </div>

            {/* 対象週の曜日別詳細テーブル */}
            <div className="bg-white rounded-lg border p-3 sm:p-4">
              <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2">対象週の曜日別詳細</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left font-medium text-gray-600">曜日</th>
                      <th className="px-3 py-2 text-right font-medium text-indigo-600">対象週 人時</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">前週 人時</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">差</th>
                      <th className="px-3 py-2 text-right font-medium text-indigo-600">対象週 出勤</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">前週 出勤</th>
                      <th className="px-3 py-2 text-right font-medium text-indigo-600">対象週 残業</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">前週 残業</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.thisWeekDaily.map((tw, i) => {
                      const lw = data.lastWeekDaily[i];
                      const diff = Math.round((tw.workHours - (lw?.workHours || 0)) * 10) / 10;
                      const isWeekend = tw.dow >= 5;
                      return (
                        <tr key={tw.dow} className={`border-t border-gray-100 ${isWeekend ? "bg-red-50/30" : ""}`}>
                          <td className={`px-3 py-2 font-medium ${isWeekend ? "text-red-600" : ""}`}>
                            {DOW_SHORT[tw.dow]}（{tw.date.slice(5)}）
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-indigo-700">{fmtNum(tw.workHours)}h</td>
                          <td className="px-3 py-2 text-right text-gray-500">{fmtNum(lw?.workHours || 0)}h</td>
                          <td className={`px-3 py-2 text-right font-medium ${diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : "text-gray-400"}`}>
                            {diff > 0 ? "+" : ""}{diff}h
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{tw.headcount}名</td>
                          <td className="px-3 py-2 text-right text-gray-500">{lw?.headcount || 0}名</td>
                          <td className="px-3 py-2 text-right font-medium">{tw.overtimeHours}h</td>
                          <td className="px-3 py-2 text-right text-gray-500">{lw?.overtimeHours || 0}h</td>
                        </tr>
                      );
                    })}
                    {/* 合計行 */}
                    <tr className="border-t-2 border-indigo-200 bg-indigo-50/50 font-bold">
                      <td className="px-3 py-2">合計</td>
                      <td className="px-3 py-2 text-right text-indigo-700">{fmtNum(data.weeklyComparison.thisWeek.workHours)}h</td>
                      <td className="px-3 py-2 text-right text-gray-600">{fmtNum(data.weeklyComparison.lastWeek.workHours)}h</td>
                      <td className={`px-3 py-2 text-right ${
                        data.weeklyComparison.thisWeek.workHours > data.weeklyComparison.lastWeek.workHours ? "text-red-600" : "text-green-600"
                      }`}>
                        {data.weeklyComparison.thisWeek.workHours > data.weeklyComparison.lastWeek.workHours ? "+" : ""}
                        {fmtNum(Math.round((data.weeklyComparison.thisWeek.workHours - data.weeklyComparison.lastWeek.workHours) * 10) / 10)}h
                      </td>
                      <td className="px-3 py-2 text-right">{data.weeklyComparison.thisWeek.uniqueEmployees}名</td>
                      <td className="px-3 py-2 text-right text-gray-600">{data.weeklyComparison.lastWeek.uniqueEmployees}名</td>
                      <td className="px-3 py-2 text-right">{fmtNum(data.weeklyComparison.thisWeek.overtimeHours)}h</td>
                      <td className="px-3 py-2 text-right text-gray-600">{fmtNum(data.weeklyComparison.lastWeek.overtimeHours)}h</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* チャート: 日別人時数 */}
          <div className="bg-white rounded-xl shadow-sm border p-3 sm:p-5">
            <h2 className="text-sm sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-3">今月の日別人時数・出勤人数</h2>
            <div className="overflow-x-auto -mx-1">
              <div className="min-w-[400px]">
                <canvas id="chart-daily" height="120" />
              </div>
            </div>
          </div>

          {/* 2カラム: 雇用区分別 + 対象週スケジュール */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6">
            <div className="bg-white rounded-xl shadow-sm border p-3 sm:p-5">
              <h2 className="text-sm sm:text-lg font-semibold text-gray-800 mb-2 sm:mb-3">雇用区分別 人時構成（今月）</h2>
              <canvas id="chart-emptype" height="200" />
              <div className="mt-4 space-y-2">
                {data.byEmploymentType.map(t => (
                  <div key={t.type} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{EMP_TYPE_LABELS[t.type] || t.type}（{t.count}名）</span>
                    <span className="font-medium">{fmtNum(t.workHours)}h / {fmtYen(t.laborCost)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 対象週の勤務表 */}
            <div className="md:col-span-2 bg-white rounded-xl shadow-sm border p-3 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2 sm:mb-3">
                <h2 className="text-sm sm:text-lg font-semibold text-gray-800">対象週の勤務実績</h2>
                <div className="flex flex-wrap gap-1">
                  {[{ v: "ALL", l: "全て" }, ...Object.entries(EMP_TYPE_LABELS).map(([v, l]) => ({ v, l }))].map(opt => (
                    <button
                      key={opt.v}
                      onClick={() => setWeekFilter(opt.v)}
                      className={`px-2 py-1 rounded text-xs ${weekFilter === opt.v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-2 py-2 text-left font-medium text-gray-600 sticky left-0 bg-gray-50">従業員</th>
                      <th className="px-2 py-2 text-left font-medium text-gray-600">区分</th>
                      {data.weekDates.map(d => {
                        const dt = new Date(d);
                        const dow = (dt.getDay() + 6) % 7;
                        const isWeekend = dow >= 5;
                        return (
                          <th key={d} className={`px-2 py-2 text-center font-medium ${isWeekend ? "text-red-600 bg-red-50" : "text-gray-600"}`}>
                            {dt.getDate()}({DOW_SHORT[dow]})
                          </th>
                        );
                      })}
                      <th className="px-2 py-2 text-right font-medium text-gray-600">週計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWeekly.map(emp => (
                      <tr key={emp.code} className="border-t border-gray-100 hover:bg-blue-50">
                        <td className="px-2 py-1.5 font-medium whitespace-nowrap sticky left-0 bg-white">{emp.name}</td>
                        <td className="px-2 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                            emp.employmentType === "FULL_TIME" ? "bg-blue-100 text-blue-700" :
                            emp.employmentType === "PART_TIME" ? "bg-green-100 text-green-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>
                            {EMP_TYPE_LABELS[emp.employmentType]?.charAt(0) || "他"}
                          </span>
                        </td>
                        {data.weekDates.map(d => {
                          const day = emp.days[d];
                          const dt = new Date(d);
                          const dow = (dt.getDay() + 6) % 7;
                          const isWeekend = dow >= 5;
                          if (!day || day.workHours === 0) {
                            return <td key={d} className={`px-2 py-1.5 text-center text-gray-300 ${isWeekend ? "bg-red-50/50" : ""}`}>-</td>;
                          }
                          return (
                            <td key={d} className={`px-2 py-1.5 text-center ${isWeekend ? "bg-red-50/50" : ""}`}>
                              <div className="text-gray-700">{day.clockIn}〜{day.clockOut}</div>
                              <div className="text-gray-400">{day.workHours}h{day.overtime > 0 ? <span className="text-red-500 ml-1">+{day.overtime}</span> : ""}</div>
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-right font-bold">{emp.totalHours}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredWeekly.length === 0 && (
                <div className="text-center text-gray-400 py-8">対象週の勤務データがありません</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, change, sub, alert }: {
  label: string; value: string; sub?: string;
  change?: { value: string; positive: boolean } | null;
  alert?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-3 sm:p-4 ${alert ? "border-red-300 bg-red-50" : ""}`}>
      <div className="text-[10px] sm:text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-base sm:text-xl font-bold ${alert ? "text-red-600" : "text-gray-900"}`}>{value}</div>
      {change && (
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs text-gray-400">{sub}</span>
          <ChangeBadge change={change} />
        </div>
      )}
    </div>
  );
}

function ChangeBadge({ change }: { change: { value: string; positive: boolean } | null }) {
  if (!change) return <span className="text-xs text-gray-300">-</span>;
  // 人件費・残業は増加=悪い（赤）、減少=良い（緑）
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
      change.positive ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
    }`}>
      {change.value}
    </span>
  );
}

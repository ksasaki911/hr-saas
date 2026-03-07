// =============================================================
// 月次勤怠集計画面
// =============================================================
"use client";

import { useState, useEffect, useCallback } from "react";

interface MonthlySummary {
  yearMonth: string;
  employee: {
    id: string;
    code: string;
    lastName: string;
    firstName: string;
    employmentType: string;
    hourlyWage: number | null;
  };
  totalWorkDays: number;
  totalWorkHours: number;
  totalOvertimeHours: number;
  totalLateDays: number;
  totalAbsentDays: number;
  totalEarlyLeaveDays: number;
  totalLaborCost: number;
}

export default function MonthlyAttendancePage() {
  const [summaries, setSummaries] = useState<MonthlySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearMonth, setYearMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance/monthly-summary?yearMonth=${yearMonth}`);
      const json = await res.json();
      if (json.success) setSummaries(json.data);
    } catch (err) {
      console.error("月次集計取得エラー:", err);
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const moveMonth = (dir: number) => {
    const [y, m] = yearMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const displayMonth = (() => {
    const [y, m] = yearMonth.split("-").map(Number);
    return `${y}年${m}月`;
  })();

  // 全体集計
  const totalHours = summaries.reduce((s, r) => s + r.totalWorkHours, 0);
  const totalOvertime = summaries.reduce((s, r) => s + r.totalOvertimeHours, 0);
  const totalCost = summaries.reduce((s, r) => s + r.totalLaborCost, 0);
  const totalLate = summaries.reduce((s, r) => s + r.totalLateDays, 0);
  const totalAbsent = summaries.reduce((s, r) => s + r.totalAbsentDays, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">月次勤怠集計</h2>
          <p className="text-sm text-gray-500 mt-1">
            従業員ごとの月次勤務実績サマリー
          </p>
        </div>
      </div>

      {/* 月ナビ */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => moveMonth(-1)}
          className="px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50"
        >
          ← 前月
        </button>
        <span className="font-medium text-gray-700">{displayMonth}</span>
        <button
          onClick={() => moveMonth(1)}
          className="px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50"
        >
          翌月 →
        </button>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">対象人数</div>
          <div className="text-xl font-bold text-gray-800 mt-1">{summaries.length}名</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">総勤務時間</div>
          <div className="text-xl font-bold text-gray-800 mt-1">{totalHours.toFixed(1)}h</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">総残業時間</div>
          <div className="text-xl font-bold text-orange-600 mt-1">{totalOvertime.toFixed(1)}h</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">遅刻/欠勤</div>
          <div className="text-xl font-bold text-yellow-600 mt-1">{totalLate}/{totalAbsent}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">総人件費</div>
          <div className="text-xl font-bold text-gray-800 mt-1">¥{totalCost.toLocaleString()}</div>
        </div>
      </div>

      {/* テーブル */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      ) : summaries.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
          この月の勤怠データはありません
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600 border-b">社員番号</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600 border-b">氏名</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600 border-b">雇用形態</th>
                <th className="text-right p-3 text-sm font-medium text-gray-600 border-b">出勤日数</th>
                <th className="text-right p-3 text-sm font-medium text-gray-600 border-b">勤務時間</th>
                <th className="text-right p-3 text-sm font-medium text-gray-600 border-b">残業時間</th>
                <th className="text-right p-3 text-sm font-medium text-gray-600 border-b">遅刻</th>
                <th className="text-right p-3 text-sm font-medium text-gray-600 border-b">欠勤</th>
                <th className="text-right p-3 text-sm font-medium text-gray-600 border-b">早退</th>
                <th className="text-right p-3 text-sm font-medium text-gray-600 border-b">人件費</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => {
                const emp = s.employee;
                const typeLabel = emp.employmentType === "FULL_TIME" ? "正社員"
                  : emp.employmentType === "PART_TIME" ? "パート" : emp.employmentType;
                return (
                  <tr key={emp.id} className="hover:bg-gray-50">
                    <td className="p-3 text-sm border-b">{emp.code}</td>
                    <td className="p-3 text-sm border-b font-medium">
                      {emp.lastName} {emp.firstName}
                    </td>
                    <td className="p-3 text-sm border-b">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        emp.employmentType === "FULL_TIME"
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-teal-100 text-teal-800"
                      }`}>
                        {typeLabel}
                      </span>
                    </td>
                    <td className="p-3 text-sm border-b text-right">{s.totalWorkDays}日</td>
                    <td className="p-3 text-sm border-b text-right">{s.totalWorkHours}h</td>
                    <td className="p-3 text-sm border-b text-right text-orange-600">
                      {s.totalOvertimeHours > 0 ? `${s.totalOvertimeHours}h` : "−"}
                    </td>
                    <td className="p-3 text-sm border-b text-right">
                      {s.totalLateDays > 0 ? <span className="text-yellow-600">{s.totalLateDays}</span> : "−"}
                    </td>
                    <td className="p-3 text-sm border-b text-right">
                      {s.totalAbsentDays > 0 ? <span className="text-red-600">{s.totalAbsentDays}</span> : "−"}
                    </td>
                    <td className="p-3 text-sm border-b text-right">
                      {s.totalEarlyLeaveDays > 0 ? <span className="text-orange-600">{s.totalEarlyLeaveDays}</span> : "−"}
                    </td>
                    <td className="p-3 text-sm border-b text-right font-medium">
                      ¥{s.totalLaborCost.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="p-3 bg-slate-50 border-t text-xs text-gray-600">
            {summaries.length}名の集計 | 総人件費: ¥{totalCost.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

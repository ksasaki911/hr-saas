// =============================================================
// カバレッジサマリーパネル
// 店舗単位で部門×曜日×時間帯の充足状況を表示
// =============================================================
"use client";

import { useState, useEffect, useCallback } from "react";

interface DeptCoverage {
  departmentId: string;
  departmentName: string;
  minStaff: number;
  idealStaff: number;
  assigned: number;
  status: "over" | "ideal" | "minimum" | "short" | "no_req";
}

interface SlotData {
  timeSlot: string;
  departments: DeptCoverage[];
}

interface DayData {
  date: string;
  dayOfWeek: number;
  dayLabel: string;
  slots: SlotData[];
  totalAssigned: number;
  totalRequired: number;
  fillRate: number;
}

interface CoverageData {
  weekStart: string;
  days: DayData[];
  summary: {
    totalAssigned: number;
    totalRequired: number;
    overallFillRate: number;
    shortSlots: number;
  };
}

const STATUS_BG: Record<string, string> = {
  over: "bg-blue-200 text-blue-900",
  ideal: "bg-green-200 text-green-900",
  minimum: "bg-yellow-200 text-yellow-900",
  short: "bg-red-200 text-red-900",
  no_req: "bg-gray-100 text-gray-400",
};

const SLOT_LABELS: Record<string, string> = {
  "09:00-12:00": "午前",
  "12:00-15:00": "昼",
  "15:00-18:00": "午後",
  "18:00-22:00": "夜",
};

interface Props {
  weekStart: string;
  storeId: string;
  refreshKey?: number; // shifts が更新されたら変更する
}

export function CoverageSummary({ weekStart, storeId, refreshKey }: Props) {
  const [data, setData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchCoverage = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ weekStart });
      if (storeId) params.set("storeId", storeId);
      const res = await fetch(`/api/shifts/coverage?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [weekStart, storeId]);

  useEffect(() => {
    fetchCoverage();
  }, [fetchCoverage, refreshKey]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-4 mb-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="h-20 bg-gray-100 rounded" />
      </div>
    );
  }

  if (!data) return null;

  const { summary, days } = data;
  const hasShortage = summary.shortSlots > 0;

  return (
    <div className="bg-white rounded-xl border mb-4 overflow-hidden">
      {/* サマリーヘッダー（常時表示） */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-bold text-gray-700">カバレッジ状況</h3>

          {/* 充足率バッジ */}
          <span
            className={`px-3 py-1 rounded-full text-sm font-bold ${
              summary.overallFillRate >= 100
                ? "bg-green-100 text-green-800"
                : summary.overallFillRate >= 80
                ? "bg-yellow-100 text-yellow-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            充足率 {summary.overallFillRate}%
          </span>

          {hasShortage && (
            <span className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-700">
              {summary.shortSlots}スロット不足
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-500">
          {/* 日別ミニバー */}
          <div className="flex gap-1">
            {days.map((day) => (
              <div
                key={day.date}
                className="flex flex-col items-center"
                title={`${day.dayLabel}曜 ${day.fillRate}%`}
              >
                <span className="text-[10px] text-gray-400">{day.dayLabel}</span>
                <div
                  className={`w-6 h-3 rounded-sm ${
                    day.totalRequired === 0
                      ? "bg-gray-200"
                      : day.fillRate >= 100
                      ? "bg-green-400"
                      : day.fillRate >= 80
                      ? "bg-yellow-400"
                      : "bg-red-400"
                  }`}
                />
              </div>
            ))}
          </div>

          <span className="text-gray-400">{expanded ? "▲ 閉じる" : "▼ 詳細"}</span>
        </div>
      </button>

      {/* 詳細パネル */}
      {expanded && (
        <div className="border-t p-4">
          {/* 凡例 */}
          <div className="flex gap-3 mb-3 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-green-200" /> 適正以上
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-yellow-200" /> 最低限
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-red-200" /> 不足
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-blue-200" /> 余裕
            </span>
          </div>

          {/* テーブル: 行=部門×時間帯, 列=曜日 */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="p-2 text-left border font-medium text-gray-600 w-24">
                    部門
                  </th>
                  <th className="p-2 text-left border font-medium text-gray-600 w-16">
                    時間帯
                  </th>
                  {days.map((day) => (
                    <th
                      key={day.date}
                      className={`p-2 text-center border font-medium min-w-[60px] ${
                        day.dayOfWeek === 0 || day.dayOfWeek === 6
                          ? "text-red-600 bg-red-50/50"
                          : "text-gray-600"
                      }`}
                    >
                      {day.dayLabel}
                      <div className="text-[10px] font-normal">
                        {day.date.slice(5)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // 全部門を集める
                  const allDepts = new Map<string, string>();
                  for (const day of days) {
                    for (const slot of day.slots) {
                      for (const dept of slot.departments) {
                        allDepts.set(dept.departmentId, dept.departmentName);
                      }
                    }
                  }

                  const rows: JSX.Element[] = [];
                  for (const [deptId, deptName] of allDepts) {
                    for (const slot of ["09:00-12:00", "12:00-15:00", "15:00-18:00", "18:00-22:00"]) {
                      rows.push(
                        <tr key={`${deptId}-${slot}`} className="hover:bg-gray-50/50">
                          {slot === "09:00-12:00" ? (
                            <td
                              className="p-1.5 border font-medium text-gray-700"
                              rowSpan={4}
                            >
                              {deptName}
                            </td>
                          ) : null}
                          <td className="p-1.5 border text-gray-500">
                            {SLOT_LABELS[slot] || slot}
                          </td>
                          {days.map((day) => {
                            const slotData = day.slots.find(
                              (s) => s.timeSlot === slot
                            );
                            const deptData = slotData?.departments.find(
                              (d) => d.departmentId === deptId
                            );

                            if (!deptData) {
                              return (
                                <td
                                  key={day.date}
                                  className="p-1.5 border text-center text-gray-300"
                                >
                                  −
                                </td>
                              );
                            }

                            return (
                              <td
                                key={day.date}
                                className={`p-1.5 border text-center font-medium ${STATUS_BG[deptData.status]}`}
                                title={`${deptName} ${day.dayLabel}曜 ${slot}: ${deptData.assigned}名 / 必要${deptData.minStaff}〜理想${deptData.idealStaff}`}
                              >
                                {deptData.assigned}/{deptData.idealStaff}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    }
                  }
                  return rows;
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

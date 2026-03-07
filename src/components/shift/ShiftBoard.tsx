// =============================================================
// 店舗シフトボード（作業スケジュール型 – LSP風ガントチャート）
// 行: 部門×作業  列: 1時間刻みタイムライン  セル: ガントバーで人員配置
// =============================================================
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ShiftWithEmployee } from "@/types/shift";

// ---- 型定義 ----

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

// ---- 定数 ----

// タイムライン: 7:00 ~ 22:00 (15時間)
const TIMELINE_START = 7;
const TIMELINE_END = 22;
const TIMELINE_HOURS = Array.from(
  { length: TIMELINE_END - TIMELINE_START },
  (_, i) => TIMELINE_START + i
);

const TIME_SLOTS = ["09:00-12:00", "12:00-15:00", "15:00-18:00", "18:00-22:00"];

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// 部門カラー
const DEPT_COLORS: Record<number, { bar: string; barLight: string; header: string; text: string; border: string }> = {
  0: { bar: "bg-blue-400",    barLight: "bg-blue-100",    header: "bg-blue-600",    text: "text-white", border: "border-blue-300" },
  1: { bar: "bg-emerald-400", barLight: "bg-emerald-100", header: "bg-emerald-600", text: "text-white", border: "border-emerald-300" },
  2: { bar: "bg-purple-400",  barLight: "bg-purple-100",  header: "bg-purple-600",  text: "text-white", border: "border-purple-300" },
  3: { bar: "bg-amber-400",   barLight: "bg-amber-100",   header: "bg-amber-600",   text: "text-white", border: "border-amber-300" },
  4: { bar: "bg-rose-400",    barLight: "bg-rose-100",    header: "bg-rose-600",    text: "text-white", border: "border-rose-300" },
  5: { bar: "bg-cyan-400",    barLight: "bg-cyan-100",    header: "bg-cyan-600",    text: "text-white", border: "border-cyan-300" },
  6: { bar: "bg-orange-400",  barLight: "bg-orange-100",  header: "bg-orange-600",  text: "text-white", border: "border-orange-300" },
  7: { bar: "bg-indigo-400",  barLight: "bg-indigo-100",  header: "bg-indigo-600",  text: "text-white", border: "border-indigo-300" },
};

// 雇用形態バッジ
const EMP_BADGE: Record<string, { bg: string; label: string }> = {
  FULL_TIME: { bg: "bg-blue-700",   label: "正" },
  PART_TIME: { bg: "bg-green-600",  label: "P" },
  ARBEIT:    { bg: "bg-orange-500", label: "A" },
};

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// ---- Props ----

interface Props {
  weekDates: string[];
  shifts: ShiftWithEmployee[];
  storeId: string;
  weekStart: string;
  selectedDate: string;
  onEditShift: (shift: ShiftWithEmployee) => void;
  onAddShift: (date: string) => void;
  refreshKey?: number;
}

export function ShiftBoard({
  weekDates,
  shifts,
  storeId,
  weekStart,
  selectedDate,
  onEditShift,
  onAddShift,
  refreshKey,
}: Props) {
  const [coverage, setCoverage] = useState<CoverageData | null>(null);
  const [filterDept, setFilterDept] = useState<string>("all");

  // カバレッジ取得
  const fetchCoverage = useCallback(async () => {
    if (!storeId) return;
    try {
      const params = new URLSearchParams({ weekStart, storeId });
      const res = await fetch(`/api/shifts/coverage?${params}`);
      const json = await res.json();
      if (json.success) setCoverage(json.data);
    } catch { /* ignore */ }
  }, [weekStart, storeId]);

  useEffect(() => { fetchCoverage(); }, [fetchCoverage, refreshKey]);

  // この日のシフトだけ抽出
  const dayShifts = useMemo(() => {
    return shifts.filter((s) => {
      const d = typeof s.shiftDate === "string"
        ? s.shiftDate.split("T")[0]
        : localDateStr(new Date(s.shiftDate));
      return d === selectedDate;
    });
  }, [shifts, selectedDate]);

  // 部門一覧
  const departments = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of shifts) {
      if (s.department) map.set(s.department.id, s.department.name);
    }
    if (coverage) {
      for (const day of coverage.days) {
        for (const slot of day.slots) {
          for (const dept of slot.departments) {
            map.set(dept.departmentId, dept.departmentName);
          }
        }
      }
    }
    // 未割当
    const hasUnassigned = shifts.some((s) => !s.departmentId);
    if (hasUnassigned) map.set("__none__", "未配属");
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [shifts, coverage]);

  const visibleDepts = filterDept === "all"
    ? departments
    : departments.filter((d) => d.id === filterDept);

  // 部門別 → その日のシフト一覧
  const shiftsByDept = useMemo(() => {
    const m = new Map<string, ShiftWithEmployee[]>();
    for (const s of dayShifts) {
      const key = s.departmentId || "__none__";
      const arr = m.get(key) || [];
      arr.push(s);
      m.set(key, arr);
    }
    // ソート: startTime 昇順
    for (const [, arr] of m) {
      arr.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    }
    return m;
  }, [dayShifts]);

  // この日のカバレッジ
  const dayCoverage = useMemo(() => {
    if (!coverage) return null;
    return coverage.days.find((d) => d.date === selectedDate) || null;
  }, [coverage, selectedDate]);

  // 日サマリー
  const stats = useMemo(() => {
    const ft = new Set(dayShifts.filter((s) => s.employee.employmentType === "FULL_TIME").map((s) => s.employeeId)).size;
    const pt = new Set(dayShifts.filter((s) => s.employee.employmentType === "PART_TIME").map((s) => s.employeeId)).size;
    const ab = new Set(dayShifts.filter((s) => s.employee.employmentType === "ARBEIT").map((s) => s.employeeId)).size;
    const totalHours = dayShifts.reduce((sum, s) => {
      const mins = timeToMinutes(s.endTime) - timeToMinutes(s.startTime);
      return sum + mins / 60;
    }, 0);
    const cost = dayShifts.reduce((sum, s) => sum + (s.laborCost || 0), 0);
    return { total: dayShifts.length, ft, pt, ab, totalHours: Math.round(totalHours * 10) / 10, cost };
  }, [dayShifts]);

  // タイムラインの 1px あたりの幅（%） — 各時間帯列を等幅に
  const hourWidth = 100 / TIMELINE_HOURS.length;

  /** シフトのバー位置を計算（%ベース） */
  function barStyle(startTime: string, endTime: string) {
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    const tlStartMin = TIMELINE_START * 60;
    const tlEndMin = TIMELINE_END * 60;
    const tlTotal = tlEndMin - tlStartMin;

    const left = Math.max(0, ((startMin - tlStartMin) / tlTotal) * 100);
    const right = Math.min(100, ((endMin - tlStartMin) / tlTotal) * 100);
    const width = right - left;

    return { left: `${left}%`, width: `${Math.max(width, 1)}%` };
  }

  // 日付情報
  const dateObj = new Date(selectedDate + "T00:00:00");
  const dow = dateObj.getDay();
  const dayLabel = `${dateObj.getMonth() + 1}/${dateObj.getDate()}(${DAY_LABELS[dow]})`;

  return (
    <div className="space-y-3">
      {/* ===== サマリーバー ===== */}
      <div className="bg-white rounded-xl border p-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-800">{dayLabel}</span>
          <span className="text-xs text-gray-500">部門:</span>
          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
            className="px-2 py-1 text-xs border rounded bg-white">
            <option value="all">全部門</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span>配置: <strong>{stats.total}</strong>件</span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-700" /> 正社員 {stats.ft}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-green-600" /> パート {stats.pt}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> アルバイト {stats.ab}
          </span>
          <span>総工数: <strong>{stats.totalHours}h</strong></span>
          {stats.cost > 0 && <span>人件費: <strong>¥{stats.cost.toLocaleString()}</strong></span>}
        </div>
      </div>

      {/* ===== メインガントチャート ===== */}
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: "1200px" }}>
          <thead>
            {/* タイムラインヘッダー */}
            <tr className="bg-slate-700 text-white">
              <th className="p-2 text-xs font-bold border-r border-slate-600 w-[60px] sticky left-0 bg-slate-700 z-20 text-center">
                No
              </th>
              <th className="p-2 text-xs font-bold border-r border-slate-600 w-[100px] sticky left-[60px] bg-slate-700 z-20">
                部門
              </th>
              <th className="p-2 text-xs font-bold border-r border-slate-600 w-[110px] sticky left-[160px] bg-slate-700 z-20">
                作業
              </th>
              <th className="p-2 text-xs font-bold border-r border-slate-600 w-[80px] text-center">
                計画
              </th>
              {/* 時間帯ヘッダー */}
              {TIMELINE_HOURS.map((h) => (
                <th key={h}
                  className="p-1 text-[10px] font-medium border-r border-slate-600 text-center"
                  style={{ width: `${hourWidth}%` }}
                >
                  {String(h).padStart(2, "0")}:00
                </th>
              ))}
              <th className="p-2 text-xs font-bold w-[60px] text-center">
                必要
              </th>
              <th className="p-2 text-xs font-bold w-[60px] text-center">
                配置
              </th>
              <th className="p-2 text-xs font-bold w-[50px] text-center">
                差異
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleDepts.length === 0 ? (
              <tr>
                <td colSpan={TIMELINE_HOURS.length + 6} className="p-8 text-center text-gray-400 text-sm">
                  この日のシフトはまだ登録されていません
                </td>
              </tr>
            ) : (
              visibleDepts.map((dept, deptIdx) => {
                const deptColor = DEPT_COLORS[deptIdx % Object.keys(DEPT_COLORS).length];
                const deptShifts = shiftsByDept.get(dept.id) || [];

                // 作業パターン（同じ時間帯をグループ化）
                type TaskGroup = {
                  pattern: string; // "08:00-17:00"
                  shifts: ShiftWithEmployee[];
                };
                const taskGroups: TaskGroup[] = [];
                const patternMap = new Map<string, ShiftWithEmployee[]>();
                for (const s of deptShifts) {
                  const pat = `${s.startTime}-${s.endTime}`;
                  const arr = patternMap.get(pat) || [];
                  arr.push(s);
                  patternMap.set(pat, arr);
                }
                for (const [pattern, ss] of patternMap) {
                  taskGroups.push({ pattern, shifts: ss });
                }
                // ソート: 開始時刻順
                taskGroups.sort((a, b) => {
                  const [aS] = a.pattern.split("-");
                  const [bS] = b.pattern.split("-");
                  return timeToMinutes(aS) - timeToMinutes(bS);
                });

                // 部門サマリー: カバレッジ集計
                let deptRequired = 0;
                let deptAssigned = 0;
                if (dayCoverage) {
                  for (const slot of dayCoverage.slots) {
                    const d = slot.departments.find((x) => x.departmentId === dept.id);
                    if (d) {
                      deptRequired += d.idealStaff;
                      deptAssigned += d.assigned;
                    }
                  }
                }
                const deptDiff = deptAssigned - deptRequired;

                // 各タスクグループを行として描画
                let rowNo = 0;
                const rows = taskGroups.flatMap((tg) => {
                  return tg.shifts.map((shift, idx) => {
                    rowNo++;
                    const emp = shift.employee;
                    const badge = EMP_BADGE[emp.employmentType] || { bg: "bg-gray-400", label: "?" };
                    const bs = barStyle(shift.startTime, shift.endTime);
                    const isFirst = idx === 0;

                    return (
                      <tr key={shift.id}
                        className={`${rowNo % 2 === 0 ? "bg-gray-50/50" : "bg-white"} hover:bg-yellow-50/50 transition-colors group`}
                      >
                        {/* No */}
                        <td className="px-2 py-1 text-[10px] text-gray-400 border-r border-b border-gray-200 text-center sticky left-0 bg-inherit z-10">
                          {rowNo}
                        </td>
                        {/* 部門（最初の行だけ表示） */}
                        {isFirst && rowNo === 1 ? (
                          <td rowSpan={deptShifts.length}
                            className={`px-2 py-1 text-xs font-bold border-r border-b ${deptColor.border} sticky left-[60px] z-10 ${deptColor.barLight}`}
                          >
                            <div className="flex items-center gap-1">
                              <span className={`w-2 h-full min-h-[16px] rounded-sm ${deptColor.bar}`} />
                              <span>{dept.name}</span>
                            </div>
                          </td>
                        ) : isFirst && rowNo !== 1 ? (
                          <td rowSpan={deptShifts.length}
                            className={`px-2 py-1 text-xs font-bold border-r border-b ${deptColor.border} sticky left-[60px] z-10 ${deptColor.barLight}`}
                          >
                            <div className="flex items-center gap-1">
                              <span className={`w-2 h-full min-h-[16px] rounded-sm ${deptColor.bar}`} />
                              <span>{dept.name}</span>
                            </div>
                          </td>
                        ) : null}
                        {/* 作業（従業員名） */}
                        <td className="px-2 py-1 text-[11px] border-r border-b border-gray-200 sticky left-[160px] bg-inherit z-10">
                          <button
                            onClick={() => onEditShift(shift)}
                            className="flex items-center gap-1 hover:underline text-left"
                            title={`${emp.lastName}${emp.firstName} (${emp.employmentType})`}
                          >
                            <span className={`w-3.5 h-3.5 rounded text-[7px] text-white flex items-center justify-center flex-shrink-0 font-bold ${badge.bg}`}>
                              {badge.label}
                            </span>
                            <span className="font-medium text-gray-800 truncate">
                              {emp.lastName}{emp.firstName}
                            </span>
                          </button>
                        </td>
                        {/* 計画時間 */}
                        <td className="px-1 py-1 text-[10px] text-gray-600 border-r border-b border-gray-200 text-center font-mono">
                          {shift.startTime.slice(0, 5)}-{shift.endTime.slice(0, 5)}
                          {shift.status === "DRAFT" && <span className="ml-0.5 text-yellow-500">●</span>}
                        </td>
                        {/* ガントバー: タイムライン列をまとめて1セルに */}
                        <td colSpan={TIMELINE_HOURS.length}
                          className="p-0 border-b border-gray-200 relative"
                          style={{ height: "28px" }}
                        >
                          {/* 時間グリッド線 */}
                          <div className="absolute inset-0 flex">
                            {TIMELINE_HOURS.map((h) => (
                              <div key={h} className="flex-1 border-r border-gray-100" />
                            ))}
                          </div>
                          {/* バー */}
                          <div
                            className={`absolute top-1 bottom-1 rounded-sm ${deptColor.bar} opacity-80 hover:opacity-100 cursor-pointer transition-opacity flex items-center px-1 overflow-hidden`}
                            style={bs}
                            onClick={() => onEditShift(shift)}
                            title={`${emp.lastName}${emp.firstName} ${shift.startTime}〜${shift.endTime}`}
                          >
                            <span className="text-[9px] text-white font-medium truncate drop-shadow-sm">
                              {emp.lastName}{emp.firstName}
                            </span>
                          </div>
                        </td>
                        {/* 必要/配置/差異 (最初の行だけ) */}
                        {isFirst && rowNo === 1 ? (
                          <>
                            <td rowSpan={deptShifts.length}
                              className="px-1 py-1 text-xs text-center border-l border-b border-gray-200 font-medium text-gray-600">
                              {deptRequired > 0 ? deptRequired : "-"}
                            </td>
                            <td rowSpan={deptShifts.length}
                              className="px-1 py-1 text-xs text-center border-b border-gray-200 font-bold text-gray-800">
                              {deptShifts.length}
                            </td>
                            <td rowSpan={deptShifts.length}
                              className={`px-1 py-1 text-xs text-center border-b border-gray-200 font-bold ${
                                deptDiff > 0 ? "text-blue-600" : deptDiff === 0 ? "text-green-600" : "text-red-600"
                              }`}>
                              {deptDiff > 0 ? `+${deptDiff}` : deptDiff === 0 && deptRequired > 0 ? "0" : deptDiff < 0 ? deptDiff : "-"}
                            </td>
                          </>
                        ) : isFirst && rowNo !== 1 ? (
                          <>
                            <td rowSpan={deptShifts.length}
                              className="px-1 py-1 text-xs text-center border-l border-b border-gray-200 font-medium text-gray-600">
                              {deptRequired > 0 ? deptRequired : "-"}
                            </td>
                            <td rowSpan={deptShifts.length}
                              className="px-1 py-1 text-xs text-center border-b border-gray-200 font-bold text-gray-800">
                              {deptShifts.length}
                            </td>
                            <td rowSpan={deptShifts.length}
                              className={`px-1 py-1 text-xs text-center border-b border-gray-200 font-bold ${
                                deptDiff > 0 ? "text-blue-600" : deptDiff === 0 ? "text-green-600" : "text-red-600"
                              }`}>
                              {deptDiff > 0 ? `+${deptDiff}` : deptDiff === 0 && deptRequired > 0 ? "0" : deptDiff < 0 ? deptDiff : "-"}
                            </td>
                          </>
                        ) : null}
                      </tr>
                    );
                  });
                });

                // 部門にシフトがない場合の空行
                if (deptShifts.length === 0) {
                  return (
                    <tr key={dept.id} className="bg-white hover:bg-yellow-50/50">
                      <td className="px-2 py-2 text-[10px] text-gray-400 border-r border-b border-gray-200 text-center sticky left-0 bg-inherit z-10">
                        -
                      </td>
                      <td className={`px-2 py-2 text-xs font-bold border-r border-b ${deptColor.border} sticky left-[60px] z-10 ${deptColor.barLight}`}>
                        <div className="flex items-center gap-1">
                          <span className={`w-2 min-h-[16px] rounded-sm ${deptColor.bar}`} />
                          <span>{dept.name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-[10px] text-gray-400 border-r border-b border-gray-200 sticky left-[160px] bg-inherit z-10">
                        <button onClick={() => onAddShift(selectedDate)}
                          className="text-blue-500 hover:underline">
                          + 人員追加
                        </button>
                      </td>
                      <td className="px-1 py-2 text-[10px] text-gray-400 border-r border-b border-gray-200 text-center">-</td>
                      <td colSpan={TIMELINE_HOURS.length} className="border-b border-gray-200 p-0 relative" style={{ height: "28px" }}>
                        <div className="absolute inset-0 flex">
                          {TIMELINE_HOURS.map((h) => (
                            <div key={h} className="flex-1 border-r border-gray-100" />
                          ))}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-300">
                          未配置
                        </div>
                      </td>
                      <td className="px-1 py-2 text-xs text-center border-l border-b border-gray-200 text-gray-400">
                        {deptRequired > 0 ? deptRequired : "-"}
                      </td>
                      <td className="px-1 py-2 text-xs text-center border-b border-gray-200 text-gray-400">0</td>
                      <td className={`px-1 py-2 text-xs text-center border-b border-gray-200 font-bold ${deptRequired > 0 ? "text-red-600" : "text-gray-400"}`}>
                        {deptRequired > 0 ? `-${deptRequired}` : "-"}
                      </td>
                    </tr>
                  );
                }

                return (
                  <>{rows}</>
                );
              })
            )}

            {/* 合計行 */}
            {dayShifts.length > 0 && (
              <tr className="bg-slate-100 font-bold">
                <td colSpan={3} className="px-2 py-2 text-xs text-gray-700 border-r border-gray-300 sticky left-0 bg-slate-100 z-10">
                  合計
                </td>
                <td className="px-1 py-2 text-xs text-center border-r border-gray-300 text-gray-600">
                  {stats.totalHours}h
                </td>
                <td colSpan={TIMELINE_HOURS.length} className="p-0 relative" style={{ height: "28px" }}>
                  {/* 時間帯別配置人数バー */}
                  <div className="absolute inset-0 flex">
                    {TIMELINE_HOURS.map((h) => {
                      const hourStart = h * 60;
                      const hourEnd = (h + 1) * 60;
                      const count = dayShifts.filter((s) => {
                        const ss = timeToMinutes(s.startTime);
                        const se = timeToMinutes(s.endTime);
                        return ss < hourEnd && se > hourStart;
                      }).length;
                      const maxCount = Math.max(15, ...TIMELINE_HOURS.map((hh) => {
                        const hs = hh * 60;
                        const he = (hh + 1) * 60;
                        return dayShifts.filter((s) => {
                          const ss = timeToMinutes(s.startTime);
                          const se = timeToMinutes(s.endTime);
                          return ss < he && se > hs;
                        }).length;
                      }));
                      const pct = (count / maxCount) * 100;
                      return (
                        <div key={h} className="flex-1 border-r border-gray-200 flex flex-col justify-end items-center relative">
                          <div className="w-[80%] bg-slate-400 rounded-t-sm opacity-60"
                            style={{ height: `${pct}%` }} />
                          <span className="absolute bottom-0.5 text-[8px] text-gray-500">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </td>
                <td className="px-1 py-2 text-xs text-center border-l border-gray-300 text-gray-600">
                  {(() => {
                    let total = 0;
                    if (dayCoverage) {
                      for (const slot of dayCoverage.slots) {
                        for (const d of slot.departments) {
                          total += d.idealStaff;
                        }
                      }
                    }
                    return total > 0 ? total : "-";
                  })()}
                </td>
                <td className="px-1 py-2 text-xs text-center border-gray-300 text-gray-800">
                  {stats.total}
                </td>
                <td className="px-1 py-2 text-xs text-center border-gray-300">
                  {(() => {
                    let totalReq = 0;
                    if (dayCoverage) {
                      for (const slot of dayCoverage.slots) {
                        for (const d of slot.departments) {
                          totalReq += d.idealStaff;
                        }
                      }
                    }
                    const diff = stats.total - totalReq;
                    if (totalReq === 0) return "-";
                    return (
                      <span className={diff >= 0 ? "text-green-600" : "text-red-600"}>
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    );
                  })()}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ===== 凡例 ===== */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500 px-1 flex-wrap">
        <span className="font-medium text-gray-600">凡例:</span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-3 rounded-sm bg-blue-700 text-white text-[7px] flex items-center justify-center font-bold">正</span> 正社員
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-3 rounded-sm bg-green-600 text-white text-[7px] flex items-center justify-center font-bold">P</span> パート
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-3 rounded-sm bg-orange-500 text-white text-[7px] flex items-center justify-center font-bold">A</span> アルバイト
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-yellow-500">●</span> 草案(DRAFT)
        <span className="text-gray-300">|</span>
        <span className="text-green-600 font-bold">0</span> 充足
        <span className="text-red-600 font-bold">-2</span> 不足
        <span className="text-blue-600 font-bold">+1</span> 余剰
      </div>
    </div>
  );
}

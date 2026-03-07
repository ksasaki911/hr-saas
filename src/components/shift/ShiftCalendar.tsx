// =============================================================
// シフトカレンダー（週間表示）
// 行: 従業員、列: 曜日のマトリクス表示
// =============================================================
"use client";

import type { ShiftWithEmployee } from "@/types/shift";

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

// ローカルタイムで YYYY-MM-DD を返す（toISOStringはUTC変換で日付がずれる）
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-yellow-100 border-yellow-300 text-yellow-800",
  PUBLISHED: "bg-blue-100 border-blue-300 text-blue-800",
  CONFIRMED: "bg-green-100 border-green-300 text-green-800",
  CHANGED: "bg-orange-100 border-orange-300 text-orange-800",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草案",
  PUBLISHED: "公開",
  CONFIRMED: "確定",
  CHANGED: "変更",
};

interface Props {
  weekDates: string[];
  shifts: ShiftWithEmployee[];
  onAddShift: (date: string) => void;
  onEditShift: (shift: ShiftWithEmployee) => void;
}

export function ShiftCalendar({
  weekDates,
  shifts,
  onAddShift,
  onEditShift,
}: Props) {
  // 従業員ごとにシフトをグループ化
  const employeeMap = new Map<
    string,
    { employee: ShiftWithEmployee["employee"]; shifts: Map<string, ShiftWithEmployee> }
  >();

  for (const shift of shifts) {
    const empId = shift.employeeId;
    if (!employeeMap.has(empId)) {
      employeeMap.set(empId, {
        employee: shift.employee,
        shifts: new Map(),
      });
    }
    const dateStr =
      typeof shift.shiftDate === "string"
        ? shift.shiftDate.split("T")[0]
        : localDateStr(new Date(shift.shiftDate));
    employeeMap.get(empId)!.shifts.set(dateStr, shift);
  }

  const employees = Array.from(employeeMap.values()).sort((a, b) =>
    a.employee.code.localeCompare(b.employee.code)
  );

  if (employees.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center">
        <p className="text-gray-500 mb-4">
          この週のシフトはまだ登録されていません
        </p>
        <button
          onClick={() => onAddShift(weekDates[0])}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          シフトを作成する
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border overflow-x-auto">
      <table className="w-full border-collapse min-w-[900px]">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left p-3 text-sm font-medium text-gray-600 border-b w-40 sticky left-0 bg-slate-50 z-10">
              従業員
            </th>
            {weekDates.map((date, i) => {
              const d = new Date(date);
              const isWeekend = i >= 5;
              return (
                <th
                  key={date}
                  className={`p-3 text-sm font-medium border-b text-center min-w-[120px] ${
                    isWeekend ? "text-red-600 bg-red-50/50" : "text-gray-600"
                  }`}
                >
                  <div>{DAY_LABELS[i]}</div>
                  <div className="text-xs font-normal">
                    {d.getMonth() + 1}/{d.getDate()}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {employees.map(({ employee, shifts: empShifts }) => (
            <tr key={employee.id} className="hover:bg-gray-50/50">
              <td className="p-3 text-sm border-b sticky left-0 bg-white z-10">
                <div className="font-medium text-gray-800">
                  {employee.lastName} {employee.firstName}
                </div>
                <div className="text-xs text-gray-400">{employee.code}</div>
              </td>
              {weekDates.map((date, i) => {
                const shift = empShifts.get(date);
                const isWeekend = i >= 5;
                return (
                  <td
                    key={date}
                    className={`p-1.5 border-b text-center ${
                      isWeekend ? "bg-red-50/30" : ""
                    }`}
                  >
                    {shift ? (
                      <button
                        onClick={() => onEditShift(shift)}
                        className={`w-full p-1.5 rounded border text-xs ${
                          STATUS_COLORS[shift.status]
                        } hover:opacity-80 transition-opacity`}
                      >
                        <div className="font-medium">
                          {shift.startTime}〜{shift.endTime}
                        </div>
                        {shift.department && (
                          <div className="text-[10px] opacity-70">
                            {shift.department.name}
                          </div>
                        )}
                        <div className="text-[10px] opacity-60">
                          {STATUS_LABELS[shift.status]}
                          {shift.isHelpShift && " 🔄"}
                        </div>
                      </button>
                    ) : (
                      <button
                        onClick={() => onAddShift(date)}
                        className="w-full p-3 text-gray-300 hover:bg-gray-100 rounded transition-colors text-lg"
                        title="シフトを追加"
                      >
                        +
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* サマリー行 */}
      <div className="p-3 bg-slate-50 border-t flex gap-6 text-xs text-gray-600">
        <span>
          合計: <strong>{shifts.length}</strong>件
        </span>
        <span>
          草案:{" "}
          <strong className="text-yellow-600">
            {shifts.filter((s) => s.status === "DRAFT").length}
          </strong>
        </span>
        <span>
          公開:{" "}
          <strong className="text-blue-600">
            {shifts.filter((s) => s.status === "PUBLISHED").length}
          </strong>
        </span>
        <span>
          確定:{" "}
          <strong className="text-green-600">
            {shifts.filter((s) => s.status === "CONFIRMED").length}
          </strong>
        </span>
        {shifts.some((s) => s.laborCost) && (
          <span>
            推定人件費:{" "}
            <strong>
              ¥
              {shifts
                .reduce((sum, s) => sum + (s.laborCost || 0), 0)
                .toLocaleString()}
            </strong>
          </span>
        )}
      </div>
    </div>
  );
}

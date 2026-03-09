// =============================================================
// 打刻画面 - 出勤・退勤の打刻操作
// =============================================================
"use client";

import { useState, useEffect, useCallback } from "react";

interface Employee {
  id: string;
  code: string;
  lastName: string;
  firstName: string;
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  attendanceDate: string;
  clockIn: string | null;
  clockOut: string | null;
  status: string;
  employee: Employee;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "未出勤", color: "bg-gray-100 text-gray-600" },
  CLOCKED_IN: { label: "出勤中", color: "bg-blue-100 text-blue-800" },
  CLOCKED_OUT: { label: "退勤済", color: "bg-green-100 text-green-800" },
  LATE: { label: "遅刻", color: "bg-yellow-100 text-yellow-800" },
  EARLY_LEAVE: { label: "早退", color: "bg-orange-100 text-orange-800" },
  ABSENT: { label: "欠勤", color: "bg-red-100 text-red-800" },
  APPROVED: { label: "承認済", color: "bg-emerald-100 text-emerald-800" },
};

export default function AttendancePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [storeId, setStoreId] = useState<string>("");
  
  // 店舗ID動的取得
  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d) => {
        const list = d.data || d || [];
        if (Array.isArray(list) && list.length > 0) {
          setStoreId(list[0].id);
        }
      })
      .catch(() => {});
  }, []);
  const today = new Date().toISOString().split("T")[0];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, attRes] = await Promise.all([
        fetch("/api/employees"),
        fetch(`/api/attendance?date=${today}`),
      ]);
      const empJson = await empRes.json();
      const attJson = await attRes.json();
      if (empJson.success) setEmployees(empJson.data);
      if (attJson.success) setTodayRecords(attJson.data);
    } catch (err) {
      console.error("データ取得エラー:", err);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClockIn = async () => {
    if (!selectedEmployee) return;
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployee,
          storeId: storeId,
          attendanceDate: today,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: "success", text: "出勤を記録しました" });
        fetchData();
      } else {
        setMessage({ type: "error", text: json.error || "出勤打刻に失敗しました" });
      }
    } catch {
      setMessage({ type: "error", text: "通信エラーが発生しました" });
    } finally {
      setProcessing(false);
    }
  };

  const handleClockOut = async () => {
    if (!selectedEmployee) return;
    setProcessing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/attendance/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployee,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: "success", text: "退勤を記録しました" });
        fetchData();
      } else {
        setMessage({ type: "error", text: json.error || "退勤打刻に失敗しました" });
      }
    } catch {
      setMessage({ type: "error", text: "通信エラーが発生しました" });
    } finally {
      setProcessing(false);
    }
  };

  // 選択中の従業員の今日の打刻状況
  const selectedRecord = todayRecords.find((r) => r.employeeId === selectedEmployee);
  const canClockIn = !selectedRecord || selectedRecord.status === "PENDING";
  const canClockOut = selectedRecord?.status === "CLOCKED_IN" || selectedRecord?.status === "LATE";

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">打刻</h2>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">出勤・退勤の打刻を行います</p>
      </div>

      {/* 打刻操作エリア */}
      <div className="bg-white rounded-xl border p-3 sm:p-6 mb-6">
        <div className="text-center mb-6">
          <div className="text-2xl sm:text-3xl font-bold text-gray-800">{today}</div>
          <div className="text-base sm:text-lg text-gray-500 mt-1">
            {new Date().toLocaleDateString("ja-JP", { weekday: "long" })}
          </div>
        </div>

        <div className="max-w-md mx-auto space-y-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              従業員を選択
            </label>
            <select
              value={selectedEmployee}
              onChange={(e) => {
                setSelectedEmployee(e.target.value);
                setMessage(null);
              }}
              className="w-full sm:w-auto border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm"
            >
              <option value="">-- 選択してください --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.code} - {emp.lastName} {emp.firstName}
                </option>
              ))}
            </select>
          </div>

          {selectedEmployee && selectedRecord && (
            <div className="text-center text-xs sm:text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
              現在のステータス:{" "}
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_LABELS[selectedRecord.status]?.color || ""}`}>
                {STATUS_LABELS[selectedRecord.status]?.label || selectedRecord.status}
              </span>
              {selectedRecord.clockIn && (
                <span className="block sm:inline ml-0 sm:ml-3 mt-1 sm:mt-0">
                  出勤: {new Date(selectedRecord.clockIn).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              {selectedRecord.clockOut && (
                <span className="block sm:inline ml-0 sm:ml-3 mt-1 sm:mt-0">
                  退勤: {new Date(selectedRecord.clockOut).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:justify-center gap-2 sm:gap-4">
            <button
              onClick={handleClockIn}
              disabled={!selectedEmployee || !canClockIn || processing}
              className="px-4 sm:px-8 py-2 sm:py-3 bg-blue-600 text-white rounded-xl font-medium text-xs sm:text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              出勤
            </button>
            <button
              onClick={handleClockOut}
              disabled={!selectedEmployee || !canClockOut || processing}
              className="px-4 sm:px-8 py-2 sm:py-3 bg-orange-600 text-white rounded-xl font-medium text-xs sm:text-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              退勤
            </button>
          </div>

          {message && (
            <div
              className={`text-center p-3 rounded-lg text-xs sm:text-sm ${
                message.type === "success"
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}
        </div>
      </div>

      {/* 本日の打刻状況一覧 */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-3 sm:p-4 border-b bg-slate-50">
          <h3 className="font-medium text-sm sm:text-base text-gray-700">本日の打刻状況</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-500">読み込み中...</div>
          </div>
        ) : todayRecords.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            本日の打刻データはまだありません
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">社員番号</th>
                <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">氏名</th>
                <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">出勤時刻</th>
                <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">退勤時刻</th>
                <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">ステータス</th>
              </tr>
            </thead>
            <tbody>
              {todayRecords.map((rec) => {
                const statusInfo = STATUS_LABELS[rec.status] || { label: rec.status, color: "" };
                return (
                  <tr key={rec.id} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b">{rec.employee.code}</td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b font-medium">
                      {rec.employee.lastName} {rec.employee.firstName}
                    </td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b">
                      {rec.clockIn
                        ? new Date(rec.clockIn).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
                        : "−"}
                    </td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b">
                      {rec.clockOut
                        ? new Date(rec.clockOut).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
                        : "−"}
                    </td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

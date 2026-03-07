// =============================================================
// 勤怠実績一覧画面（ページネーション対応）
// =============================================================
"use client";

import { useState, useEffect, useCallback } from "react";

interface AttendanceRecord {
  id: string;
  employeeId: string;
  attendanceDate: string;
  clockIn: string | null;
  clockOut: string | null;
  totalWorkMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  breakMinutes: number;
  status: string;
  laborCost: number | null;
  employee: {
    id: string;
    code: string;
    lastName: string;
    firstName: string;
  };
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

const PAGE_SIZE = 500;

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export default function AttendanceRecordsPage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    const lastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return last.toISOString().split("T")[0];
  });

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/attendance?${params}`);
      const json = await res.json();
      if (json.success) {
        setRecords(json.data);
        if (json.pagination) setPagination(json.pagination);
      }
    } catch (err) {
      console.error("勤怠データ取得エラー:", err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, page]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // 日付変更時はページ1に戻す
  const handleDateChange = (type: "start" | "end", value: string) => {
    if (type === "start") setStartDate(value);
    else setEndDate(value);
    setPage(1);
  };

  // 集計
  const totalWorkMinutes = records.reduce((sum, r) => sum + r.totalWorkMinutes, 0);
  const totalOvertimeMinutes = records.reduce((sum, r) => sum + r.overtimeMinutes, 0);
  const totalLaborCost = records.reduce((sum, r) => sum + (r.laborCost || 0), 0);
  const lateDays = records.filter((r) => r.lateMinutes > 0).length;
  const absentDays = records.filter((r) => r.status === "ABSENT").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">勤怠実績一覧</h2>
          <p className="text-sm text-gray-500 mt-1">
            全従業員の勤怠記録
            {pagination && ` | ${pagination.total.toLocaleString()}件中 ${((page - 1) * PAGE_SIZE + 1).toLocaleString()}〜${Math.min(page * PAGE_SIZE, pagination.total).toLocaleString()}件`}
          </p>
        </div>
      </div>

      {/* フィルター */}
      <div className="flex items-center gap-4 mb-4">
        <div>
          <label className="text-xs text-gray-500">開始日</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleDateChange("start", e.target.value)}
            className="block border rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">終了日</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => handleDateChange("end", e.target.value)}
            className="block border rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">総勤務時間（このページ）</div>
          <div className="text-xl font-bold text-gray-800 mt-1">{formatMinutes(totalWorkMinutes)}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">総残業時間</div>
          <div className="text-xl font-bold text-orange-600 mt-1">{formatMinutes(totalOvertimeMinutes)}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">遅刻回数</div>
          <div className="text-xl font-bold text-yellow-600 mt-1">{lateDays}回</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">欠勤回数</div>
          <div className="text-xl font-bold text-red-600 mt-1">{absentDays}回</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">総人件費</div>
          <div className="text-xl font-bold text-gray-800 mt-1">¥{totalLaborCost.toLocaleString()}</div>
        </div>
      </div>

      {/* テーブル */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
          この期間の勤怠データはありません
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600 border-b">日付</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600 border-b">従業員</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600 border-b">出勤</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600 border-b">退勤</th>
                <th className="text-right p-3 text-sm font-medium text-gray-600 border-b">勤務時間</th>
                <th className="text-right p-3 text-sm font-medium text-gray-600 border-b">残業</th>
                <th className="text-right p-3 text-sm font-medium text-gray-600 border-b">遅刻(分)</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600 border-b">ステータス</th>
                <th className="text-right p-3 text-sm font-medium text-gray-600 border-b">人件費</th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => {
                const statusInfo = STATUS_LABELS[rec.status] || { label: rec.status, color: "" };
                return (
                  <tr key={rec.id} className="hover:bg-gray-50">
                    <td className="p-3 text-sm border-b">
                      {new Date(rec.attendanceDate).toLocaleDateString("ja-JP")}
                    </td>
                    <td className="p-3 text-sm border-b">
                      <span className="font-medium">{rec.employee.lastName} {rec.employee.firstName}</span>
                      <span className="text-xs text-gray-400 ml-2">{rec.employee.code}</span>
                    </td>
                    <td className="p-3 text-sm border-b">
                      {rec.clockIn ? new Date(rec.clockIn).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "−"}
                    </td>
                    <td className="p-3 text-sm border-b">
                      {rec.clockOut ? new Date(rec.clockOut).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "−"}
                    </td>
                    <td className="p-3 text-sm border-b text-right">{formatMinutes(rec.totalWorkMinutes)}</td>
                    <td className="p-3 text-sm border-b text-right text-orange-600">
                      {rec.overtimeMinutes > 0 ? formatMinutes(rec.overtimeMinutes) : "−"}
                    </td>
                    <td className="p-3 text-sm border-b text-right">
                      {rec.lateMinutes > 0 ? <span className="text-yellow-600">{rec.lateMinutes}</span> : "−"}
                    </td>
                    <td className="p-3 text-sm border-b">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="p-3 text-sm border-b text-right">
                      {rec.laborCost ? `¥${rec.laborCost.toLocaleString()}` : "−"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ページネーション */}
          <div className="p-3 bg-slate-50 border-t flex items-center justify-between">
            <span className="text-xs text-gray-600">
              全{pagination?.total.toLocaleString() || records.length}件
              {pagination && pagination.totalPages > 1 && ` | ページ ${page} / ${pagination.totalPages}`}
            </span>
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  前へ
                </button>
                {/* ページ番号ボタン */}
                {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
                  let p: number;
                  if (pagination.totalPages <= 7) {
                    p = i + 1;
                  } else if (page <= 4) {
                    p = i + 1;
                  } else if (page >= pagination.totalPages - 3) {
                    p = pagination.totalPages - 6 + i;
                  } else {
                    p = page - 3 + i;
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`px-3 py-1 text-sm border rounded-lg ${
                        page === p ? "bg-blue-600 text-white border-blue-600" : "hover:bg-gray-100"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  次へ
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

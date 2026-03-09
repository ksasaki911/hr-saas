// =============================================================
// 休暇管理画面 - 休暇申請一覧 + 承認/却下
// =============================================================
"use client";

import { useState, useEffect, useCallback } from "react";

interface Employee {
  id: string;
  code: string;
  lastName: string;
  firstName: string;
}

interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  status: string;
  createdAt: string;
  employee: Employee;
}

const TYPE_LABELS: Record<string, string> = {
  PAID_LEAVE: "有給休暇",
  SICK_LEAVE: "病気休暇",
  SPECIAL_LEAVE: "特別休暇",
  ABSENCE: "欠勤届",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "申請中", color: "bg-yellow-100 text-yellow-800" },
  APPROVED: { label: "承認", color: "bg-green-100 text-green-800" },
  REJECTED: { label: "却下", color: "bg-red-100 text-red-800" },
};

export default function LeaveRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  // フォーム
  const [formData, setFormData] = useState({
    employeeId: "",
    leaveType: "PAID_LEAVE",
    startDate: "",
    endDate: "",
    reason: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);

      const [reqRes, empRes] = await Promise.all([
        fetch(`/api/leave-requests?${params}`),
        fetch("/api/employees"),
      ]);
      const reqJson = await reqRes.json();
      const empJson = await empRes.json();
      if (reqJson.success) setRequests(reqJson.data);
      if (empJson.success) setEmployees(empJson.data);
    } catch (err) {
      console.error("データ取得エラー:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    if (!formData.employeeId || !formData.startDate || !formData.endDate) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setShowForm(false);
        setFormData({ employeeId: "", leaveType: "PAID_LEAVE", startDate: "", endDate: "", reason: "" });
        fetchData();
      } else {
        alert(json.error || "申請に失敗しました");
      }
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setProcessing(false);
    }
  };

  const handleAction = async (id: string, status: "APPROVED" | "REJECTED") => {
    const label = status === "APPROVED" ? "承認" : "却下";
    if (!confirm(`この申請を${label}しますか？`)) return;
    try {
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        fetchData();
      } else {
        alert(json.error || `${label}に失敗しました`);
      }
    } catch {
      alert("通信エラーが発生しました");
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-2 sm:gap-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">休暇管理</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">休暇申請の管理と承認</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg text-xs sm:text-sm hover:bg-blue-700 transition-colors"
        >
          {showForm ? "閉じる" : "+ 休暇申請"}
        </button>
      </div>

      {/* 申請フォーム */}
      {showForm && (
        <div className="bg-white rounded-xl border p-3 sm:p-6 mb-6">
          <h3 className="text-sm sm:text-base font-medium text-gray-700 mb-2 sm:mb-4">新規休暇申請</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">従業員</label>
              <select
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-xs sm:text-sm"
              >
                <option value="">-- 選択 --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.code} - {emp.lastName} {emp.firstName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">休暇種別</label>
              <select
                value={formData.leaveType}
                onChange={(e) => setFormData({ ...formData, leaveType: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-xs sm:text-sm"
              >
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">開始日</label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-xs sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">終了日</label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-xs sm:text-sm"
              />
            </div>
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">理由</label>
              <input
                type="text"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="任意"
                className="w-full border rounded-lg px-3 py-2 text-xs sm:text-sm"
              />
            </div>
          </div>
          <div className="mt-2 sm:mt-4 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={processing || !formData.employeeId || !formData.startDate || !formData.endDate}
              className="w-full sm:w-auto px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg text-xs sm:text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {processing ? "送信中..." : "申請する"}
            </button>
          </div>
        </div>
      )}

      {/* フィルター */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-4">
        <span className="text-xs sm:text-sm text-gray-500">ステータス:</span>
        {[
          { value: "", label: "すべて" },
          { value: "PENDING", label: "申請中" },
          { value: "APPROVED", label: "承認済" },
          { value: "REJECTED", label: "却下" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1 text-xs rounded-full border ${
              statusFilter === opt.value
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* テーブル */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
          休暇申請はありません
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">申請日</th>
                <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">従業員</th>
                <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">種別</th>
                <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">期間</th>
                <th className="text-right px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">日数</th>
                <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">理由</th>
                <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">ステータス</th>
                <th className="text-center px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">操作</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => {
                const statusInfo = STATUS_LABELS[req.status] || { label: req.status, color: "" };
                return (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b">
                      {new Date(req.createdAt).toLocaleDateString("ja-JP")}
                    </td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b">
                      <span className="font-medium">{req.employee.lastName} {req.employee.firstName}</span>
                      <span className="text-xs text-gray-400 ml-2">{req.employee.code}</span>
                    </td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b">{TYPE_LABELS[req.leaveType] || req.leaveType}</td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b">
                      {new Date(req.startDate).toLocaleDateString("ja-JP")}
                      {req.startDate !== req.endDate && ` 〜 ${new Date(req.endDate).toLocaleDateString("ja-JP")}`}
                    </td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b text-right">{req.totalDays}日</td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b text-gray-500">{req.reason || "−"}</td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b text-center">
                      {req.status === "PENDING" ? (
                        <div className="flex gap-0.5 sm:gap-1 justify-center">
                          <button
                            onClick={() => handleAction(req.id, "APPROVED")}
                            className="px-1.5 sm:px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                          >
                            承認
                          </button>
                          <button
                            onClick={() => handleAction(req.id, "REJECTED")}
                            className="px-1.5 sm:px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                          >
                            却下
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">処理済</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-2 sm:px-3 py-2 bg-slate-50 border-t text-xs text-gray-600">
            合計: {requests.length}件
            {requests.filter((r) => r.status === "PENDING").length > 0 && (
              <span className="ml-2 text-yellow-600">
                （未処理: {requests.filter((r) => r.status === "PENDING").length}件）
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

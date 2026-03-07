// =============================================================
// シフト作成・編集モーダル
// =============================================================
"use client";

import { useState, useEffect } from "react";
import type { ShiftWithEmployee } from "@/types/shift";

interface Employee {
  id: string;
  code: string;
  lastName: string;
  firstName: string;
  employmentType: string;
  departmentId: string | null;
}

interface Props {
  shift: ShiftWithEmployee | null; // null = 新規作成
  defaultDate: string | null;
  storeId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ShiftFormModal({
  shift,
  defaultDate,
  storeId,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!shift;

  const [form, setForm] = useState({
    employeeId: shift?.employeeId || "",
    shiftDate: shift?.shiftDate?.toString().split("T")[0] || defaultDate || "",
    startTime: shift?.startTime || "09:00",
    endTime: shift?.endTime || "17:00",
    breakMinutes: shift?.breakMinutes ?? 60,
    departmentId: shift?.departmentId || "",
    isHelpShift: shift?.isHelpShift || false,
    note: shift?.note || "",
  });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 従業員リスト取得
  useEffect(() => {
    fetch(`/api/employees?storeId=${storeId}&limit=200`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setEmployees(json.data);
      })
      .catch(console.error);
  }, [storeId]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked :
        type === "number" ? parseInt(value) || 0 :
        value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const url = isEdit ? `/api/shifts/${shift.id}` : "/api/shifts";
      const method = isEdit ? "PATCH" : "POST";

      const body = {
        ...form,
        storeId,
        departmentId: form.departmentId || undefined,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!json.success) {
        setError(json.error || "保存に失敗しました");
        return;
      }

      onSaved();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!shift || !confirm("このシフトを削除しますか？")) return;
    try {
      const res = await fetch(`/api/shifts/${shift.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "削除に失敗しました");
        return;
      }
      onSaved();
    } catch {
      setError("通信エラーが発生しました");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800">
            {isEdit ? "シフト編集" : "シフト追加"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* 従業員選択 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              従業員
            </label>
            <select
              name="employeeId"
              value={form.employeeId}
              onChange={handleChange}
              required
              disabled={isEdit}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            >
              <option value="">選択してください</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.code} - {emp.lastName} {emp.firstName}（
                  {emp.employmentType === "FULL_TIME"
                    ? "正社員"
                    : emp.employmentType === "PART_TIME"
                    ? "パート"
                    : emp.employmentType === "ARBEIT"
                    ? "アルバイト"
                    : "契約"}
                  ）
                </option>
              ))}
            </select>
          </div>

          {/* 日付 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              シフト日
            </label>
            <input
              type="date"
              name="shiftDate"
              value={form.shiftDate}
              onChange={handleChange}
              required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 時間帯 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                開始時刻
              </label>
              <input
                type="time"
                name="startTime"
                value={form.startTime}
                onChange={handleChange}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                終了時刻
              </label>
              <input
                type="time"
                name="endTime"
                value={form.endTime}
                onChange={handleChange}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                休憩（分）
              </label>
              <input
                type="number"
                name="breakMinutes"
                value={form.breakMinutes}
                onChange={handleChange}
                min={0}
                max={480}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* オプション */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isHelpShift"
                checked={form.isHelpShift}
                onChange={handleChange}
                className="rounded border-gray-300"
              />
              他店舗応援
            </label>
          </div>

          {/* 備考 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              備考
            </label>
            <textarea
              name="note"
              value={form.note}
              onChange={handleChange}
              rows={2}
              maxLength={500}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="任意のメモ..."
            />
          </div>

          {/* ボタン */}
          <div className="flex justify-between pt-2">
            {isEdit && shift.status !== "CONFIRMED" && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                削除
              </button>
            )}
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "保存中..." : isEdit ? "更新" : "作成"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

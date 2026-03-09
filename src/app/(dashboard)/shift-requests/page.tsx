// =============================================================
// シフト希望画面（月間パターン登録 + 月展開 + 例外一覧）
// =============================================================
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

interface Employee {
  id: string;
  code: string;
  lastName: string;
  firstName: string;
  employmentType: string;
}

interface ShiftPattern {
  id: string;
  employeeId: string;
  dayOfWeek: number;
  requestType: string;
  startTime: string | null;
  endTime: string | null;
  employee: Employee;
}

interface ShiftRequest {
  id: string;
  employeeId: string;
  targetDate: string;
  requestType: string;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  employee: Employee;
}

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const TYPE_OPTIONS = [
  { value: "AVAILABLE", label: "出勤可", color: "bg-green-100 text-green-800 border-green-300" },
  { value: "UNAVAILABLE", label: "休み", color: "bg-red-100 text-red-800 border-red-300" },
  { value: "PREFERRED", label: "希望", color: "bg-blue-100 text-blue-800 border-blue-300" },
];

const TYPE_COLORS: Record<string, string> = {
  AVAILABLE: "bg-green-100 text-green-800",
  UNAVAILABLE: "bg-red-100 text-red-800",
  PREFERRED: "bg-blue-100 text-blue-800",
};

type PatternEdit = {
  requestType: string;
  startTime: string;
  endTime: string;
};

export default function ShiftRequestsPage() {
  const [tab, setTab] = useState<"pattern" | "requests">("pattern");

  // --- パターンタブ ---
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [patterns, setPatterns] = useState<ShiftPattern[]>([]);
  const [editPatterns, setEditPatterns] = useState<Record<number, PatternEdit>>({});
  const [saving, setSaving] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [storeId, setStoreId] = useState<string>("");
  // --- 一覧タブ ---
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [yearMonth, setYearMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  // 年月ドロップダウン用の選択肢（過去12ヶ月〜6ヶ月先）
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = -6; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
      opts.push({ value: val, label });
    }
    return opts;
  }, []);

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

  // 従業員取得
  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          // パート・アルバイトのみ（正社員は固定シフト）
          const pts = json.data.filter(
            (e: Employee) => e.employmentType === "PART_TIME" || e.employmentType === "ARBEIT"
          );
          setEmployees(pts);
        }
      });
  }, []);

  // パターン取得
  const fetchPatterns = useCallback(async () => {
    if (!selectedEmployee) return;
    try {
      const res = await fetch(`/api/shift-patterns?employeeId=${selectedEmployee}`);
      const json = await res.json();
      if (json.success) {
        setPatterns(json.data);
        // 編集用に展開
        const edits: Record<number, PatternEdit> = {};
        for (let dow = 0; dow < 7; dow++) {
          const existing = json.data.find((p: ShiftPattern) => p.dayOfWeek === dow);
          edits[dow] = existing
            ? {
                requestType: existing.requestType,
                startTime: existing.startTime || "",
                endTime: existing.endTime || "",
              }
            : { requestType: "UNAVAILABLE", startTime: "", endTime: "" };
        }
        setEditPatterns(edits);
      }
    } catch (err) {
      console.error("パターン取得エラー:", err);
    }
  }, [selectedEmployee]);

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  // パターン保存
  const handleSavePatterns = async () => {
    if (!selectedEmployee) return;
    setSaving(true);
    setMessage(null);
    try {
      const patternsToSave = Object.entries(editPatterns).map(([dow, p]) => ({
        dayOfWeek: Number(dow),
        requestType: p.requestType,
        startTime: p.startTime || null,
        endTime: p.endTime || null,
      }));

      const res = await fetch("/api/shift-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployee,
          storeId: storeId,
          patterns: patternsToSave,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: "success", text: "パターンを保存しました" });
        fetchPatterns();
      } else {
        setMessage({ type: "error", text: json.error || "保存に失敗しました" });
      }
    } catch {
      setMessage({ type: "error", text: "通信エラー" });
    } finally {
      setSaving(false);
    }
  };

  // 月展開
  const handleExpand = async () => {
    setExpanding(true);
    setMessage(null);
    try {
      const res = await fetch("/api/shift-patterns/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: storeId,
          yearMonth,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({
          type: "success",
          text: json.data.message,
        });
        // 一覧も更新
        fetchRequests();
      } else {
        setMessage({ type: "error", text: json.error || "展開に失敗しました" });
      }
    } catch {
      setMessage({ type: "error", text: "通信エラー" });
    } finally {
      setExpanding(false);
    }
  };

  // シフト希望一覧取得
  const fetchRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const [y, m] = yearMonth.split("-").map(Number);
      const start = `${yearMonth}-01`;
      const end = new Date(y, m, 0).toISOString().split("T")[0];
      const params = new URLSearchParams({ startDate: start, endDate: end });
      const res = await fetch(`/api/shift-requests?${params}`);
      const json = await res.json();
      if (json.success) setRequests(json.data);
    } catch (err) {
      console.error("シフト希望取得エラー:", err);
    } finally {
      setLoadingRequests(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    if (tab === "requests") fetchRequests();
  }, [tab, fetchRequests]);

  const moveMonth = (dir: number) => {
    const [y, m] = yearMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const displayMonth = (() => {
    const [y, m] = yearMonth.split("-").map(Number);
    return `${y}年${m}月`;
  })();

  const updatePattern = (dow: number, field: keyof PatternEdit, value: string) => {
    setEditPatterns((prev) => ({
      ...prev,
      [dow]: { ...prev[dow], [field]: value },
    }));
  };

  // 従業員名取得
  const empName = (id: string) => {
    const e = employees.find((e) => e.id === id);
    return e ? `${e.lastName} ${e.firstName}` : id;
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-2 sm:gap-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">シフト希望</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            月間パターン登録と日別シフト希望の管理
          </p>
        </div>
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("pattern")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "pattern"
              ? "bg-white text-gray-800 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          月間パターン登録
        </button>
        <button
          onClick={() => setTab("requests")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "requests"
              ? "bg-white text-gray-800 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          展開済み一覧
        </button>
      </div>

      {/* ====== パターンタブ ====== */}
      {tab === "pattern" && (
        <div className="space-y-4">
          {/* 従業員選択 + 月展開 */}
          <div className="flex flex-col sm:flex-row items-end gap-2 sm:gap-4">
            <div className="flex-1 w-full">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">従業員</label>
              <select
                value={selectedEmployee}
                onChange={(e) => {
                  setSelectedEmployee(e.target.value);
                  setMessage(null);
                }}
                className="w-full border rounded-lg px-3 py-2 text-xs sm:text-sm"
              >
                <option value="">-- パート/アルバイトを選択 --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.code} - {emp.lastName} {emp.firstName}
                    （{emp.employmentType === "PART_TIME" ? "パート" : "アルバイト"}）
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-auto">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">展開対象月</label>
              <select
                value={yearMonth}
                onChange={(e) => setYearMonth(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-xs sm:text-sm"
              >
                {monthOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleExpand}
              disabled={expanding}
              className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs sm:text-sm hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
            >
              {expanding ? "展開中..." : "全員パターン展開"}
            </button>
          </div>

          {message && (
            <div
              className={`p-3 rounded-lg text-sm ${
                message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* パターン編集テーブル */}
          {selectedEmployee && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="p-3 sm:p-4 border-b bg-slate-50">
                <h3 className="text-sm sm:text-base font-medium text-gray-700">
                  {empName(selectedEmployee)} の週間パターン
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  曜日ごとの出勤パターンを設定します。「希望」の場合は時間帯も入力できます。
                </p>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-xs sm:text-sm font-medium text-gray-600 border-b w-20">曜日</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-xs sm:text-sm font-medium text-gray-600 border-b">種別</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-xs sm:text-sm font-medium text-gray-600 border-b">開始時刻</th>
                    <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-xs sm:text-sm font-medium text-gray-600 border-b">終了時刻</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                    const p = editPatterns[dow];
                    if (!p) return null;
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <tr
                        key={dow}
                        className={`hover:bg-gray-50 ${isWeekend ? "bg-orange-50/30" : ""}`}
                      >
                        <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b font-medium">
                          <span className={isWeekend ? "text-red-600" : ""}>{DOW_LABELS[dow]}曜</span>
                        </td>
                        <td className="px-2 sm:px-3 py-1.5 sm:py-2 border-b">
                          <div className="flex gap-1">
                            {TYPE_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => updatePattern(dow, "requestType", opt.value)}
                                className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                  p.requestType === opt.value
                                    ? opt.color
                                    : "bg-gray-50 text-gray-400 border-gray-200"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 py-1.5 sm:py-2 border-b">
                          {p.requestType !== "UNAVAILABLE" ? (
                            <input
                              type="time"
                              value={p.startTime}
                              onChange={(e) => updatePattern(dow, "startTime", e.target.value)}
                              className="border rounded px-2 py-1 text-xs sm:text-sm"
                            />
                          ) : (
                            <span className="text-gray-300 text-xs sm:text-sm">−</span>
                          )}
                        </td>
                        <td className="px-2 sm:px-3 py-1.5 sm:py-2 border-b">
                          {p.requestType !== "UNAVAILABLE" ? (
                            <input
                              type="time"
                              value={p.endTime}
                              onChange={(e) => updatePattern(dow, "endTime", e.target.value)}
                              className="border rounded px-2 py-1 text-xs sm:text-sm"
                            />
                          ) : (
                            <span className="text-gray-300 text-xs sm:text-sm">−</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-3 sm:p-4 border-t flex justify-end">
                <button
                  onClick={handleSavePatterns}
                  disabled={saving}
                  className="px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg text-xs sm:text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "パターンを保存"}
                </button>
              </div>
            </div>
          )}

          {!selectedEmployee && (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
              従業員を選択すると、曜日別の出勤パターンを設定できます
            </div>
          )}

          {/* 運用フロー説明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <div className="font-medium mb-2">運用フロー</div>
            <div className="space-y-1 text-blue-700">
              <p>1. 各パート/アルバイトの曜日別パターンを登録</p>
              <p>2. 「全員パターン展開」で対象月のシフト希望を自動生成</p>
              <p>3. 「展開済み一覧」タブで個別に例外修正（この週だけ休み等）</p>
              <p>4. シフト管理画面で「自動生成」を実行</p>
            </div>
          </div>
        </div>
      )}

      {/* ====== 展開済み一覧タブ ====== */}
      {tab === "requests" && (
        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 mb-4">
            <button
              onClick={() => moveMonth(-1)}
              className="w-full sm:w-auto px-3 py-1.5 text-xs sm:text-sm bg-white border rounded-lg hover:bg-gray-50"
            >
              ← 前月
            </button>
            <span className="font-medium text-gray-700">{displayMonth}</span>
            <button
              onClick={() => moveMonth(1)}
              className="w-full sm:w-auto px-3 py-1.5 text-xs sm:text-sm bg-white border rounded-lg hover:bg-gray-50"
            >
              翌月 →
            </button>
          </div>

          {loadingRequests ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500">読み込み中...</div>
            </div>
          ) : requests.length === 0 ? (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
              この月のシフト希望はまだありません。「月間パターン登録」タブでパターンを登録し、展開してください。
            </div>
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">日付</th>
                    <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">曜日</th>
                    <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">従業員</th>
                    <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">種別</th>
                    <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">時間帯</th>
                    <th className="text-left px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 border-b">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => {
                    const d = new Date(req.targetDate);
                    const dow = d.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <tr key={req.id} className={`hover:bg-gray-50 ${isWeekend ? "bg-orange-50/30" : ""}`}>
                        <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b">
                          {d.toLocaleDateString("ja-JP")}
                        </td>
                        <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b">
                          <span className={isWeekend ? "text-red-600 font-medium" : ""}>
                            {DOW_LABELS[dow]}
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b">
                          <span className="font-medium">
                            {req.employee.lastName} {req.employee.firstName}
                          </span>
                          <span className="text-xs text-gray-400 ml-2">{req.employee.code}</span>
                        </td>
                        <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[req.requestType] || ""}`}>
                            {TYPE_OPTIONS.find((o) => o.value === req.requestType)?.label || req.requestType}
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b text-gray-600">
                          {req.startTime && req.endTime
                            ? `${req.startTime}〜${req.endTime}`
                            : "−"}
                        </td>
                        <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm border-b text-gray-500">{req.note || "−"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-2 sm:px-3 py-2 bg-slate-50 border-t text-xs text-gray-600">
                合計: {requests.length}件
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

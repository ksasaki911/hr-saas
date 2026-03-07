// =============================================================
// シフト自動生成モーダル
// =============================================================
"use client";

import { useState, useEffect, useCallback } from "react";

interface Department {
  id: string;
  code: string;
  name: string;
}

interface DeptCoverage {
  departmentId: string;
  timeSlot: string;
  minStaff: number;
  idealStaff: number;
  assigned: number;
  status: "over" | "ideal" | "minimum" | "short";
}

interface DaySummary {
  date: string;
  dayOfWeek: number;
  dayLabel: string;
  shiftsGenerated: number;
  estimatedCost: number;
  coverage: DeptCoverage[];
}

interface SkillAlert {
  departmentId: string;
  date: string;
  timeSlot: string;
  missingSkill: string;
  assignedEmployees: string[];
  severity: "critical" | "warning";
}

interface EmployeeAssignmentDetail {
  employeeId: string;
  employeeName: string;
  employmentType: string;
  assignedDays: number;
  totalHours: number;
  profileMatchScore: number | null;
  requestFulfilled: number;
  requestTotal: number;
}

interface RequestFulfillment {
  totalRequests: number;
  preferredFulfilled: number;
  availableFulfilled: number;
  unavailableRespected: number;
  fulfillmentRate: number;
}

interface PreviewResult {
  totalCount: number;
  totalCost: number;
  daySummaries: DaySummary[];
  warnings: string[];
  skillAlerts?: SkillAlert[];
  hqSupportUsed?: number;
  profilesUsed?: number;
  employeeDetails?: EmployeeAssignmentDetail[];
  requestFulfillment?: RequestFulfillment;
}

interface Props {
  storeId: string;
  onClose: () => void;
  onGenerated: (generatedWeekStart?: string) => void;
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getNextMonday(): string {
  const d = new Date();
  const dow = d.getDay();
  const diff = dow === 0 ? 1 : 8 - dow;
  d.setDate(d.getDate() + diff);
  return localDateStr(d);
}

function getWeekRange(mondayStr: string): string {
  const mon = new Date(mondayStr + "T00:00:00");
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  const format = (d: Date) =>
    `${d.getMonth() + 1}/${d.getDate()}`;
  return `${format(mon)}（月）〜 ${format(sun)}（日）`;
}

const COVERAGE_COLORS: Record<string, string> = {
  over: "bg-blue-100 text-blue-800",
  ideal: "bg-green-100 text-green-800",
  minimum: "bg-yellow-100 text-yellow-800",
  short: "bg-red-100 text-red-800",
};

const COVERAGE_LABELS: Record<string, string> = {
  over: "余裕",
  ideal: "適正",
  minimum: "最低",
  short: "不足",
};

export default function ShiftGenerateModal({ storeId, onClose, onGenerated }: Props) {
  // ---- 設定 ----
  const [weekStartDate, setWeekStartDate] = useState(getNextMonday);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set());
  const [autoAssignFullTime, setAutoAssignFullTime] = useState(true);
  const [priorityStrategy, setPriorityStrategy] = useState<"cost" | "balanced" | "profile">("cost");
  const [useAttendanceProfile, setUseAttendanceProfile] = useState(false);

  // ---- 状態 ----
  const [step, setStep] = useState<"config" | "preview" | "loading" | "success" | "error">("config");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [processing, setProcessing] = useState(false);

  // 部門一覧取得（全staffing requirementsから部門を抽出）
  useEffect(() => {
    fetch(`/api/staffing-requirements`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          const deptMap = new Map<string, string>();
          for (const req of json.data) {
            if (req.departmentId && req.department?.name) {
              deptMap.set(req.departmentId, req.department.name);
            }
          }
          const depts: Department[] = Array.from(deptMap.entries()).map(([id, name]) => ({
            id,
            code: id,
            name,
          }));
          setDepartments(depts);
          setSelectedDepts(new Set(depts.map((d) => d.id)));
        }
      })
      .catch(() => {});
  }, []);

  const moveWeek = (dir: number) => {
    const d = new Date(weekStartDate + "T00:00:00");
    d.setDate(d.getDate() + 7 * dir);
    setWeekStartDate(localDateStr(d));
    setStep("config");
    setPreview(null);
  };

  const toggleDept = (id: string) => {
    setSelectedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllDepts = () => {
    if (selectedDepts.size === departments.length) {
      setSelectedDepts(new Set());
    } else {
      setSelectedDepts(new Set(departments.map((d) => d.id)));
    }
  };

  // プレビュー実行
  const handlePreview = useCallback(async () => {
    setProcessing(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/shifts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          weekStartDate,
          departmentFilter: selectedDepts.size < departments.length
            ? Array.from(selectedDepts)
            : undefined,
          autoAssignFullTime,
          priorityStrategy,
          useAttendanceProfile,
          dryRun: true,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setPreview(json.data);
        setStep("preview");
      } else {
        setErrorMsg(json.error || "プレビュー取得に失敗しました");
      }
    } catch {
      setErrorMsg("通信エラーが発生しました");
    } finally {
      setProcessing(false);
    }
  }, [storeId, weekStartDate, selectedDepts, departments.length, autoAssignFullTime, priorityStrategy, useAttendanceProfile]);

  // 実行
  const handleExecute = async () => {
    setStep("loading");
    try {
      const res = await fetch("/api/shifts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          weekStartDate,
          departmentFilter: selectedDepts.size < departments.length
            ? Array.from(selectedDepts)
            : undefined,
          autoAssignFullTime,
          priorityStrategy,
          useAttendanceProfile,
          dryRun: false,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setCreatedCount(json.data.createdCount);
        setStep("success");
      } else {
        setErrorMsg(json.error || "シフト生成に失敗しました");
        setStep("error");
      }
    } catch {
      setErrorMsg("通信エラーが発生しました");
      setStep("error");
    }
  };

  // 部門名ルックアップ
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name || id;

  // ---- レンダリング ----

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[900px] max-h-[85vh] overflow-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-800">自動シフト生成</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* ====== 設定パネル ====== */}
          {(step === "config" || step === "preview") && (
            <>
              {/* 対象週 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">対象週</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => moveWeek(-1)}
                    className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    ← 前週
                  </button>
                  <span className="font-medium text-gray-800">{getWeekRange(weekStartDate)}</span>
                  <button
                    onClick={() => moveWeek(1)}
                    className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    翌週 →
                  </button>
                </div>
              </div>

              {/* 部門フィルタ */}
              {departments.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">対象部門</label>
                    <button
                      onClick={toggleAllDepts}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {selectedDepts.size === departments.length ? "全解除" : "全選択"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {departments.map((dept) => (
                      <label
                        key={dept.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer border ${
                          selectedDepts.has(dept.id)
                            ? "bg-blue-50 border-blue-300 text-blue-800"
                            : "bg-gray-50 border-gray-200 text-gray-500"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDepts.has(dept.id)}
                          onChange={() => toggleDept(dept.id)}
                          className="sr-only"
                        />
                        {dept.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* 設定 */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={autoAssignFullTime}
                      onChange={(e) => setAutoAssignFullTime(e.target.checked)}
                      className="rounded"
                    />
                    正社員の固定シフト自動割当
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={useAttendanceProfile}
                      onChange={(e) => {
                        setUseAttendanceProfile(e.target.checked);
                        if (e.target.checked && priorityStrategy !== "profile") {
                          setPriorityStrategy("profile");
                        }
                      }}
                      className="rounded"
                    />
                    実績プロファイルを使用
                  </label>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-600">優先戦略:</span>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="strategy"
                      checked={priorityStrategy === "cost"}
                      onChange={() => setPriorityStrategy("cost")}
                    />
                    人件費最小化
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="strategy"
                      checked={priorityStrategy === "balanced"}
                      onChange={() => setPriorityStrategy("balanced")}
                    />
                    バランス重視
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="strategy"
                      checked={priorityStrategy === "profile"}
                      onChange={() => { setPriorityStrategy("profile"); setUseAttendanceProfile(true); }}
                    />
                    <span className="text-purple-700 font-medium">実績ベース</span>
                  </label>
                </div>
                {useAttendanceProfile && (
                  <div className="bg-purple-50 border border-purple-200 rounded p-2 text-xs text-purple-700">
                    過去の打刻データから学習したパターンを元に、各従業員の出勤確率・典型時間帯を考慮してシフトを生成します。
                    会社カレンダー（休業日・繁忙日）と就業規則の制約も自動適用されます。
                  </div>
                )}
              </div>

              {/* ボタン */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={handlePreview}
                  disabled={processing || selectedDepts.size === 0}
                  className="px-5 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50"
                >
                  {processing ? "計算中..." : "プレビュー表示"}
                </button>
                {step === "preview" && (
                  <button
                    onClick={handleExecute}
                    className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                  >
                    実行（DRAFTで生成）
                  </button>
                )}
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{errorMsg}</div>
              )}
            </>
          )}

          {/* ====== プレビュー結果 ====== */}
          {step === "preview" && preview && (
            <div className="space-y-4">
              {/* サマリーカード - 上段 */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-blue-600">生成シフト数</div>
                  <div className="text-2xl font-bold text-blue-800">{preview.totalCount}件</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-green-600">推定人件費</div>
                  <div className="text-2xl font-bold text-green-800">
                    ¥{preview.totalCost.toLocaleString()}
                  </div>
                </div>
                <div className={`rounded-lg p-3 text-center ${
                  (preview.skillAlerts?.length || 0) > 0 ? "bg-red-50" : "bg-orange-50"
                }`}>
                  <div className={`text-xs ${(preview.skillAlerts?.length || 0) > 0 ? "text-red-600" : "text-orange-600"}`}>
                    スキルアラート
                  </div>
                  <div className={`text-2xl font-bold ${(preview.skillAlerts?.length || 0) > 0 ? "text-red-800" : "text-orange-800"}`}>
                    {preview.skillAlerts?.length || 0}件
                  </div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-purple-600">本部応援</div>
                  <div className="text-2xl font-bold text-purple-800">
                    {preview.hqSupportUsed || 0}名
                  </div>
                </div>
              </div>

              {/* サマリーカード - 下段（v4: プロファイル活用・希望充足） */}
              <div className="grid grid-cols-3 gap-3">
                {(preview.profilesUsed ?? 0) > 0 && (
                  <div className="bg-indigo-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-indigo-600">プロファイル活用</div>
                    <div className="text-2xl font-bold text-indigo-800">{preview.profilesUsed}名</div>
                    {preview.employeeDetails && (() => {
                      const withProfile = preview.employeeDetails.filter((d) => d.profileMatchScore !== null);
                      if (withProfile.length === 0) return null;
                      const avgMatch = Math.round(withProfile.reduce((s, d) => s + (d.profileMatchScore || 0), 0) / withProfile.length);
                      return (
                        <div className="text-xs text-indigo-500 mt-1">平均適合度 {avgMatch}%</div>
                      );
                    })()}
                  </div>
                )}
                {preview.requestFulfillment && preview.requestFulfillment.totalRequests > 0 && (
                  <div className={`rounded-lg p-3 text-center ${
                    preview.requestFulfillment.fulfillmentRate >= 0.8 ? "bg-teal-50" : "bg-amber-50"
                  }`}>
                    <div className={`text-xs ${
                      preview.requestFulfillment.fulfillmentRate >= 0.8 ? "text-teal-600" : "text-amber-600"
                    }`}>希望充足率</div>
                    <div className={`text-2xl font-bold ${
                      preview.requestFulfillment.fulfillmentRate >= 0.8 ? "text-teal-800" : "text-amber-800"
                    }`}>
                      {Math.round(preview.requestFulfillment.fulfillmentRate * 100)}%
                    </div>
                    <div className={`text-xs mt-1 ${
                      preview.requestFulfillment.fulfillmentRate >= 0.8 ? "text-teal-500" : "text-amber-500"
                    }`}>
                      {preview.requestFulfillment.totalRequests}件中
                    </div>
                  </div>
                )}
                {preview.requestFulfillment && preview.requestFulfillment.totalRequests > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-600 mb-1.5">希望内訳</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-green-700">希望出勤</span>
                        <span className="font-medium">{preview.requestFulfillment.preferredFulfilled}件</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-700">出勤可能</span>
                        <span className="font-medium">{preview.requestFulfillment.availableFulfilled}件</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-red-700">休み回避</span>
                        <span className="font-medium">{preview.requestFulfillment.unavailableRespected}件</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 日別カバレッジ */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="p-2 text-left border-b font-medium">日</th>
                      <th className="p-2 text-right border-b font-medium">シフト数</th>
                      <th className="p-2 text-right border-b font-medium">人件費</th>
                      <th className="p-2 text-left border-b font-medium">カバレッジ状況</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.daySummaries.map((day) => {
                      const shortCount = day.coverage.filter((c) => c.status === "short").length;
                      const totalSlots = day.coverage.length;
                      return (
                        <tr key={day.date} className="hover:bg-gray-50">
                          <td className="p-2 border-b font-medium">
                            {day.date.slice(5)} ({day.dayLabel})
                          </td>
                          <td className="p-2 border-b text-right">{day.shiftsGenerated}</td>
                          <td className="p-2 border-b text-right">
                            ¥{day.estimatedCost.toLocaleString()}
                          </td>
                          <td className="p-2 border-b">
                            {totalSlots === 0 ? (
                              <span className="text-gray-400">−</span>
                            ) : shortCount > 0 ? (
                              <span className="text-red-600 font-medium">
                                {shortCount}スロット不足
                              </span>
                            ) : (
                              <span className="text-green-600">充足</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 部門×時間帯 詳細 */}
              {preview.daySummaries.some((d) => d.coverage.length > 0) && (
                <details className="border rounded-lg">
                  <summary className="p-3 cursor-pointer text-sm font-medium text-gray-700 bg-slate-50 hover:bg-slate-100">
                    部門×時間帯 詳細カバレッジ
                  </summary>
                  <div className="p-3 space-y-3 max-h-60 overflow-auto">
                    {preview.daySummaries
                      .filter((d) => d.coverage.length > 0)
                      .map((day) => (
                        <div key={day.date}>
                          <div className="text-xs font-medium text-gray-600 mb-1">
                            {day.date.slice(5)} ({day.dayLabel})
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {day.coverage.map((c) => (
                              <span
                                key={`${c.departmentId}-${c.timeSlot}`}
                                className={`px-2 py-0.5 rounded text-xs ${COVERAGE_COLORS[c.status]}`}
                                title={`${deptName(c.departmentId)} ${c.timeSlot}: ${c.assigned}/${c.idealStaff}`}
                              >
                                {deptName(c.departmentId).slice(0, 3)} {c.timeSlot.slice(0, 5)}:
                                {c.assigned}/{c.idealStaff} {COVERAGE_LABELS[c.status]}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </details>
              )}

              {/* v4: 従業員別割当詳細 */}
              {preview.employeeDetails && preview.employeeDetails.length > 0 && (
                <details className="border rounded-lg">
                  <summary className="p-3 cursor-pointer text-sm font-medium text-gray-700 bg-slate-50 hover:bg-slate-100">
                    従業員別 割当詳細（{preview.employeeDetails.length}名）
                  </summary>
                  <div className="max-h-60 overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-100 sticky top-0">
                          <th className="p-2 text-left border-b font-medium">従業員</th>
                          <th className="p-2 text-left border-b font-medium">区分</th>
                          <th className="p-2 text-right border-b font-medium">日数</th>
                          <th className="p-2 text-right border-b font-medium">時間</th>
                          <th className="p-2 text-center border-b font-medium">適合度</th>
                          <th className="p-2 text-center border-b font-medium">希望充足</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.employeeDetails
                          .sort((a, b) => b.assignedDays - a.assignedDays)
                          .map((d) => (
                          <tr key={d.employeeId} className="hover:bg-gray-50">
                            <td className="p-2 border-b font-medium">{d.employeeName}</td>
                            <td className="p-2 border-b">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${
                                d.employmentType === "FULL_TIME"
                                  ? "bg-blue-100 text-blue-700"
                                  : d.employmentType === "PART_TIME"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-orange-100 text-orange-700"
                              }`}>
                                {d.employmentType === "FULL_TIME" ? "正社員"
                                  : d.employmentType === "PART_TIME" ? "パート"
                                  : "アルバイト"}
                              </span>
                            </td>
                            <td className="p-2 border-b text-right">{d.assignedDays}日</td>
                            <td className="p-2 border-b text-right">{d.totalHours}h</td>
                            <td className="p-2 border-b text-center">
                              {d.profileMatchScore !== null ? (
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                  d.profileMatchScore >= 70
                                    ? "bg-green-100 text-green-700"
                                    : d.profileMatchScore >= 40
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-red-100 text-red-700"
                                }`}>
                                  {d.profileMatchScore}%
                                </span>
                              ) : (
                                <span className="text-gray-300">−</span>
                              )}
                            </td>
                            <td className="p-2 border-b text-center">
                              {d.requestTotal > 0 ? (
                                <span className={`text-xs ${
                                  d.requestFulfilled === d.requestTotal
                                    ? "text-green-600"
                                    : "text-amber-600"
                                }`}>
                                  {d.requestFulfilled}/{d.requestTotal}
                                </span>
                              ) : (
                                <span className="text-gray-300">−</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {/* スキルアラート */}
              {(preview.skillAlerts?.length || 0) > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="text-sm font-medium text-red-800 mb-2">
                    ⚠ スキル不足アラート（{preview.skillAlerts!.length}件）
                  </div>
                  <div className="text-xs text-red-600 mb-1">
                    以下の部門×時間帯で必須スキル保有者がいません。本部応援の手配またはシフト調整が必要です。
                  </div>
                  <div className="space-y-1 max-h-32 overflow-auto">
                    {preview.skillAlerts!.map((alert, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded ${
                          alert.severity === "critical"
                            ? "bg-red-200 text-red-800"
                            : "bg-yellow-200 text-yellow-800"
                        }`}>
                          {alert.severity === "critical" ? "必須" : "推奨"}
                        </span>
                        <span>{alert.date.slice(5)} {alert.timeSlot}</span>
                        <span className="font-medium">{deptName(alert.departmentId)}</span>
                        <span className="text-red-700">不足: {alert.missingSkill}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 警告 */}
              {preview.warnings.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <div className="text-sm font-medium text-orange-800 mb-1">警告</div>
                  <ul className="text-xs text-orange-700 space-y-0.5">
                    {preview.warnings.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ====== 実行中 ====== */}
          {step === "loading" && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
              <div className="text-gray-600">シフトを生成中...</div>
            </div>
          )}

          {/* ====== 成功 ====== */}
          {step === "success" && (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-lg font-bold text-gray-800 mb-2">
                {createdCount}件のシフトを生成しました
              </div>
              <p className="text-sm text-gray-500 mb-6">
                DRAFT状態で作成されました。確認後「一括公開」してください。
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => {
                    onGenerated(weekStartDate);
                    onClose();
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  シフト一覧を表示
                </button>
              </div>
            </div>
          )}

          {/* ====== エラー ====== */}
          {step === "error" && (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">❌</div>
              <div className="text-lg font-bold text-red-700 mb-2">生成に失敗しました</div>
              <p className="text-sm text-red-600 mb-6">{errorMsg}</p>
              <button
                onClick={() => setStep("config")}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700"
              >
                設定に戻る
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================
// 出勤パターン分析ページ
// 実績データから従業員の出勤パターンを自動学習・表示
// =============================================================
"use client";

import { useState, useEffect, useCallback } from "react";

interface Profile {
  id: string;
  employeeId: string;
  analyzedFrom: string;
  analyzedTo: string;
  totalRecordDays: number;
  dayOfWeekProb: number[];
  avgClockInMinute: number | null;
  stdClockInMinute: number | null;
  avgClockOutMinute: number | null;
  stdClockOutMinute: number | null;
  avgMonthlyDays: number | null;
  avgDailyHours: number | null;
  typicalStartTime: string | null;
  typicalEndTime: string | null;
  typicalBreakMin: number | null;
  confidenceScore: number;
  // v4拡張
  timeSlotProb: number[];
  dowTimeSlotProb: number[];
  preferredPatterns: string[];
  avgConsecutiveDays: number | null;
  typicalWeeklyHours: number | null;
  scheduleAdherence: number | null;
  employee: {
    code: string;
    lastName: string;
    firstName: string;
    employmentType: string;
    departmentId: string | null;
  };
}

interface StoreOption {
  id: string;
  name: string;
}

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const TIME_SLOT_LABELS = ["09-12", "12-15", "15-18", "18-22"];
const PATTERN_LABELS: Record<string, string> = {
  full: "フル", morning: "午前", day: "日勤", afternoon: "午後", late: "遅番", evening: "夜間",
};
const EMP_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: "正社員", PART_TIME: "パート", ARBEIT: "アルバイト", CONTRACT: "契約",
};

function formatMinuteToTime(min: number | null): string {
  if (min === null) return "-";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function AttendanceProfilePage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [monthsBack, setMonthsBack] = useState(12);
  const [analysisResult, setAnalysisResult] = useState<{ analyzedEmployees: number; generatedProfiles: number } | null>(null);
  const [filterType, setFilterType] = useState<string>("ALL");

  // 店舗一覧取得
  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d) => {
        const list = d.data || d || [];
        setStores(Array.isArray(list) ? list : []);
        if (list.length > 0) setSelectedStoreId(list[0].id);
      })
      .catch(() => {});
  }, []);

  const fetchProfiles = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance-profile?storeId=${selectedStoreId}`);
      const data = await res.json();
      setProfiles(Array.isArray(data) ? data : []);
    } catch {
      console.error("取得エラー");
    }
    setLoading(false);
  }, [selectedStoreId]);

  useEffect(() => {
    if (selectedStoreId) fetchProfiles();
  }, [selectedStoreId, fetchProfiles]);

  const runAnalysis = async () => {
    if (!selectedStoreId) return;
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const res = await fetch("/api/attendance-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStoreId, monthsBack }),
      });
      const data = await res.json();
      if (data.error) {
        alert(`分析エラー: ${data.error}`);
      } else {
        setAnalysisResult({
          analyzedEmployees: data.analyzedEmployees,
          generatedProfiles: data.generatedProfiles,
        });
        fetchProfiles();
      }
    } catch {
      alert("分析に失敗しました");
    }
    setAnalyzing(false);
  };

  // 全店舗一括分析
  const runAllStoresAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisResult(null);
    let totalAnalyzed = 0;
    let totalGenerated = 0;

    for (const store of stores) {
      try {
        const res = await fetch("/api/attendance-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId: store.id, monthsBack }),
        });
        const data = await res.json();
        if (!data.error) {
          totalAnalyzed += data.analyzedEmployees || 0;
          totalGenerated += data.generatedProfiles || 0;
        }
      } catch { /* continue */ }
    }

    setAnalysisResult({ analyzedEmployees: totalAnalyzed, generatedProfiles: totalGenerated });
    fetchProfiles();
    setAnalyzing(false);
  };

  const filteredProfiles = filterType === "ALL"
    ? profiles
    : profiles.filter((p) => p.employee.employmentType === filterType);

  const getProbColor = (prob: number) => {
    if (prob >= 0.8) return "bg-green-600 text-white";
    if (prob >= 0.5) return "bg-green-300 text-green-900";
    if (prob >= 0.2) return "bg-yellow-200 text-yellow-800";
    if (prob > 0) return "bg-gray-200 text-gray-600";
    return "bg-gray-50 text-gray-300";
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 0.8) return { label: "高", color: "bg-green-100 text-green-800" };
    if (score >= 0.5) return { label: "中", color: "bg-yellow-100 text-yellow-800" };
    return { label: "低", color: "bg-red-100 text-red-800" };
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">出勤パターン分析</h1>
          <p className="text-sm text-gray-500 mt-1">過去の打刻データから従業員の出勤パターンを自動学習</p>
        </div>
      </div>

      {/* 分析実行パネル */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">店舗:</label>
            <select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm">
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">分析期間:</label>
            <select value={monthsBack} onChange={(e) => setMonthsBack(Number(e.target.value))}
              className="border rounded px-3 py-1.5 text-sm">
              <option value={1}>過去1ヶ月</option>
              <option value={3}>過去3ヶ月</option>
              <option value={6}>過去6ヶ月</option>
              <option value={12}>過去12ヶ月</option>
              <option value={14}>全期間（14ヶ月）</option>
            </select>
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing || !selectedStoreId}
            className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm"
          >
            {analyzing ? "分析中..." : "この店舗を分析"}
          </button>
          <button
            onClick={runAllStoresAnalysis}
            disabled={analyzing}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
          >
            {analyzing ? "分析中..." : "全店舗一括分析"}
          </button>
        </div>
        {analysisResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
            分析完了: 対象 <span className="font-bold">{analysisResult.analyzedEmployees}名</span> →
            プロファイル <span className="font-bold">{analysisResult.generatedProfiles}件</span> 生成
          </div>
        )}
      </div>

      {/* フィルタ */}
      {profiles.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-gray-600">表示:</span>
          {[
            { value: "ALL", label: `全て (${profiles.length})` },
            ...Object.entries(EMP_TYPE_LABELS).map(([k, v]) => {
              const count = profiles.filter((p) => p.employee.employmentType === k).length;
              return count > 0 ? { value: k, label: `${v} (${count})` } : null;
            }).filter(Boolean) as { value: string; label: string }[],
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterType(opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                filterType === opt.value
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* プロファイル一覧 */}
      {loading ? (
        <div className="text-gray-500 p-8">読込中...</div>
      ) : profiles.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
          <p className="text-lg mb-2">プロファイルがありません</p>
          <p className="text-sm">店舗を選択し「この店舗を分析」または「全店舗一括分析」を実行してください。</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-gray-500">{filteredProfiles.length}名のプロファイル</div>
          {filteredProfiles.map((p) => {
            const conf = getConfidenceBadge(p.confidenceScore);
            return (
              <div key={p.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-900">
                      {p.employee.lastName} {p.employee.firstName}
                    </span>
                    <span className="text-xs text-gray-500">{p.employee.code}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                      {EMP_TYPE_LABELS[p.employee.employmentType] || p.employee.employmentType}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${conf.color}`}>
                      信頼度: {conf.label} ({Math.round(p.confidenceScore * 100)}%)
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    データ: {p.totalRecordDays}日分 ({p.analyzedFrom.split("T")[0]} 〜 {p.analyzedTo.split("T")[0]})
                  </span>
                </div>
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-6">
                    {/* 曜日別出勤確率 */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">曜日別出勤確率</h4>
                      <div className="flex gap-1">
                        {p.dayOfWeekProb.map((prob, i) => (
                          <div key={i} className="flex-1 text-center">
                            <div className="text-xs text-gray-500 mb-1">{DOW_LABELS[i]}</div>
                            <div className={`rounded py-1 text-xs font-medium ${getProbColor(prob)}`}>
                              {Math.round(prob * 100)}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* サマリー情報 */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500">平均出勤:</span>
                        <span className="ml-2 font-medium">{formatMinuteToTime(p.avgClockInMinute)}</span>
                        {p.stdClockInMinute != null && (
                          <span className="text-xs text-gray-400 ml-1">(±{Math.round(p.stdClockInMinute)}分)</span>
                        )}
                      </div>
                      <div>
                        <span className="text-gray-500">平均退勤:</span>
                        <span className="ml-2 font-medium">{formatMinuteToTime(p.avgClockOutMinute)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">典型時間帯:</span>
                        <span className="ml-2 font-medium">{p.typicalStartTime || "-"} 〜 {p.typicalEndTime || "-"}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">月平均出勤:</span>
                        <span className="ml-2 font-medium">{p.avgMonthlyDays?.toFixed(1) || "-"}日</span>
                      </div>
                      <div>
                        <span className="text-gray-500">日平均労働:</span>
                        <span className="ml-2 font-medium">{p.avgDailyHours?.toFixed(1) || "-"}時間</span>
                      </div>
                      <div>
                        <span className="text-gray-500">休憩時間:</span>
                        <span className="ml-2 font-medium">{p.typicalBreakMin ?? "-"}分</span>
                      </div>
                    </div>
                  </div>

                  {/* v4: 曜日×時間帯ヒートマップ */}
                  {p.dowTimeSlotProb && p.dowTimeSlotProb.length === 28 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">曜日×時間帯 ヒートマップ</h4>
                      <div className="overflow-x-auto">
                        <table className="text-xs border-collapse">
                          <thead>
                            <tr>
                              <th className="p-1.5 text-gray-500 font-medium"></th>
                              {TIME_SLOT_LABELS.map((sl) => (
                                <th key={sl} className="p-1.5 text-gray-500 font-medium text-center">{sl}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {DOW_LABELS.map((dow, di) => (
                              <tr key={di}>
                                <td className="p-1.5 text-gray-600 font-medium">{dow}</td>
                                {[0, 1, 2, 3].map((si) => {
                                  const prob = p.dowTimeSlotProb[di * 4 + si] || 0;
                                  const pct = Math.round(prob * 100);
                                  // ヒートマップカラー
                                  const bg = prob >= 0.8 ? "bg-purple-600 text-white"
                                    : prob >= 0.6 ? "bg-purple-400 text-white"
                                    : prob >= 0.4 ? "bg-purple-300 text-purple-900"
                                    : prob >= 0.2 ? "bg-purple-100 text-purple-700"
                                    : prob > 0 ? "bg-purple-50 text-purple-500"
                                    : "bg-gray-50 text-gray-300";
                                  return (
                                    <td key={si} className={`p-1.5 text-center rounded ${bg} font-medium`}
                                      style={{ minWidth: 48 }}>
                                      {pct}%
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* v4: 追加情報（パターン・連勤・週間時間・遵守率） */}
                  <div className="flex flex-wrap gap-4 text-sm">
                    {p.preferredPatterns && p.preferredPatterns.length > 0 && (
                      <div>
                        <span className="text-gray-500">よく入るパターン:</span>
                        <span className="ml-2">
                          {p.preferredPatterns.map((pat) => (
                            <span key={pat} className="inline-block px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs mr-1">
                              {PATTERN_LABELS[pat] || pat}
                            </span>
                          ))}
                        </span>
                      </div>
                    )}
                    {p.avgConsecutiveDays != null && (
                      <div>
                        <span className="text-gray-500">平均連勤:</span>
                        <span className="ml-2 font-medium">{p.avgConsecutiveDays}日</span>
                      </div>
                    )}
                    {p.typicalWeeklyHours != null && (
                      <div>
                        <span className="text-gray-500">週間労働:</span>
                        <span className="ml-2 font-medium">{p.typicalWeeklyHours}時間</span>
                      </div>
                    )}
                    {p.scheduleAdherence != null && (
                      <div>
                        <span className="text-gray-500">シフト遵守率:</span>
                        <span className={`ml-2 font-medium ${
                          p.scheduleAdherence >= 0.9 ? "text-green-700"
                            : p.scheduleAdherence >= 0.7 ? "text-yellow-700"
                            : "text-red-700"
                        }`}>
                          {Math.round(p.scheduleAdherence * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

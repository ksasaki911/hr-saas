// =============================================================
// 本部応援管理画面
// 本部からの応援要員を登録・管理
// =============================================================
"use client";

import { useState, useEffect, useCallback } from "react";

interface HQSupport {
  id: string;
  storeId: string;
  departmentId: string | null;
  supportDate: string;
  staffName: string;
  staffCode: string | null;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  skills: string[];
  note: string | null;
  status: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  REQUESTED: { label: "要請中", color: "bg-yellow-100 text-yellow-700" },
  CONFIRMED: { label: "確定", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "キャンセル", color: "bg-gray-100 text-gray-500" },
};

const DEPT_NAMES: Record<string, string> = {
  "dept-seika": "青果", "dept-sengyo": "鮮魚", "dept-seiniku": "精肉",
  "dept-sozai": "惣菜", "dept-bakery": "ベーカリー", "dept-grocery": "グロサリー",
  "dept-daily": "日配", "dept-register": "レジ", "dept-service": "サービスカウンター",
};

export default function HQSupportPage() {
  const [supports, setSupports] = useState<HQSupport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().split("T")[0];
  });

  // フォーム state
  const [formDate, setFormDate] = useState("");
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formDept, setFormDept] = useState("");
  const [formStart, setFormStart] = useState("09:00");
  const [formEnd, setFormEnd] = useState("17:00");
  const [formBreak, setFormBreak] = useState(60);
  const [formSkills, setFormSkills] = useState("");
  const [formNote, setFormNote] = useState("");
  const [saving, setSaving] = useState(false);

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
  const fetchSupports = useCallback(async () => {
    setLoading(true);
    try {
      const endDate = new Date(weekStart);
      endDate.setDate(endDate.getDate() + 13); // 2週間分表示
      const params = new URLSearchParams({
        storeId: storeId,
        startDate: weekStart,
        endDate: endDate.toISOString().split("T")[0],
      });
      const res = await fetch(`/api/hq-support?${params}`);
      const json = await res.json();
      if (json.success) setSupports(json.data);
    } catch (err) {
      console.error("取得エラー:", err);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    fetchSupports();
  }, [fetchSupports]);

  // 登録
  const handleSubmit = async () => {
    if (!formDate || !formName || !formStart || !formEnd) return;
    setSaving(true);
    try {
      const res = await fetch("/api/hq-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: storeId,
          departmentId: formDept || null,
          supportDate: formDate,
          staffName: formName,
          staffCode: formCode || null,
          startTime: formStart,
          endTime: formEnd,
          breakMinutes: formBreak,
          skills: formSkills ? formSkills.split(",").map((s) => s.trim()) : [],
          note: formNote || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowForm(false);
        resetForm();
        fetchSupports();
      }
    } catch (err) {
      console.error("登録エラー:", err);
    } finally {
      setSaving(false);
    }
  };

  // ステータス更新
  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`/api/hq-support/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchSupports();
    } catch (err) {
      console.error("更新エラー:", err);
    }
  };

  // 削除
  const handleDelete = async (id: string) => {
    if (!confirm("この本部応援を削除しますか？")) return;
    try {
      await fetch(`/api/hq-support/${id}`, { method: "DELETE" });
      fetchSupports();
    } catch (err) {
      console.error("削除エラー:", err);
    }
  };

  const resetForm = () => {
    setFormDate("");
    setFormName("");
    setFormCode("");
    setFormDept("");
    setFormStart("09:00");
    setFormEnd("17:00");
    setFormBreak(60);
    setFormSkills("");
    setFormNote("");
  };

  // 週ナビ
  const moveWeek = (dir: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d.toISOString().split("T")[0]);
  };

  // 日別グルーピング
  const dayLabels = ["日", "月", "火", "水", "木", "金", "土"];
  const dateRange: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dateRange.push(d.toISOString().split("T")[0]);
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-2 sm:gap-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">本部応援管理</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            本部からの応援要員を登録・管理
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg text-xs sm:text-sm hover:bg-blue-700"
        >
          + 応援登録
        </button>
      </div>

      {/* 週ナビ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 mb-4">
        <button onClick={() => moveWeek(-1)} className="w-full sm:w-auto px-3 py-1.5 text-xs sm:text-sm bg-white border rounded-lg hover:bg-gray-50">
          ← 前週
        </button>
        <span className="font-medium text-gray-700 text-xs sm:text-sm">
          {weekStart} ～ {dateRange[dateRange.length - 1]}
        </span>
        <button onClick={() => moveWeek(1)} className="w-full sm:w-auto px-3 py-1.5 text-xs sm:text-sm bg-white border rounded-lg hover:bg-gray-50">
          翌週 →
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      ) : supports.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500 text-sm">
          この期間に本部応援の登録はありません
        </div>
      ) : (
        <div className="space-y-3">
          {dateRange.map((date) => {
            const daySupports = supports.filter(
              (s) => s.supportDate.split("T")[0] === date
            );
            if (daySupports.length === 0) return null;
            const dow = new Date(date).getDay();
            return (
              <div key={date} className="bg-white rounded-xl border overflow-hidden">
                <div className={`p-2 sm:p-3 border-b ${dow === 0 ? "bg-red-50" : dow === 6 ? "bg-blue-50" : "bg-slate-50"}`}>
                  <span className="text-xs sm:text-sm font-semibold text-gray-700">
                    {date} ({dayLabels[dow]}曜)
                  </span>
                  <span className="ml-2 text-xs text-gray-500">{daySupports.length}名</span>
                </div>
                {daySupports.map((sup) => (
                  <div key={sup.id} className="p-2 sm:p-3 border-b last:border-b-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-xs sm:text-sm">{sup.staffName}</span>
                        {sup.staffCode && (
                          <span className="text-xs text-gray-500 font-mono">{sup.staffCode}</span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LABELS[sup.status]?.color || ""}`}>
                          {STATUS_LABELS[sup.status]?.label || sup.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1 flex gap-1 sm:gap-3 flex-wrap">
                        <span>{sup.startTime}～{sup.endTime}</span>
                        {sup.departmentId && <span>部門: {DEPT_NAMES[sup.departmentId] || sup.departmentId}</span>}
                        {sup.note && <span className="text-gray-500">({sup.note})</span>}
                      </div>
                      {sup.skills.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {sup.skills.map((sk) => (
                            <span key={sk} className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">
                              {sk}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-0.5 sm:gap-1 flex-wrap">
                      {sup.status === "REQUESTED" && (
                        <button
                          onClick={() => updateStatus(sup.id, "CONFIRMED")}
                          className="px-1.5 sm:px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                        >
                          確定
                        </button>
                      )}
                      {sup.status !== "CANCELLED" && (
                        <button
                          onClick={() => updateStatus(sup.id, "CANCELLED")}
                          className="px-1.5 sm:px-2 py-1 border text-gray-600 rounded text-xs hover:bg-gray-50"
                        >
                          取消
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(sup.id)}
                        className="px-1.5 sm:px-2 py-1 text-red-600 rounded text-xs hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* 登録モーダル */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="p-4 sm:p-6 border-b">
              <h3 className="text-base sm:text-lg font-bold">本部応援登録</h3>
            </div>
            <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">応援日 *</label>
                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">応援者名 *</label>
                  <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                    placeholder="本部 山田太郎" className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">社員番号</label>
                  <input type="text" value={formCode} onChange={(e) => setFormCode(e.target.value)}
                    placeholder="H0001" className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">応援先部門</label>
                <select value={formDept} onChange={(e) => setFormDept(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">全体応援</option>
                  {Object.entries(DEPT_NAMES).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">開始 *</label>
                  <input type="time" value={formStart} onChange={(e) => setFormStart(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">終了 *</label>
                  <input type="time" value={formEnd} onChange={(e) => setFormEnd(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">休憩(分)</label>
                  <input type="number" value={formBreak} onChange={(e) => setFormBreak(Number(e.target.value))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  保有スキル <span className="text-gray-400">(カンマ区切り)</span>
                </label>
                <input type="text" value={formSkills} onChange={(e) => setFormSkills(e.target.value)}
                  placeholder="包丁技術, レジ操作, 発注" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">備考</label>
                <input type="text" value={formNote} onChange={(e) => setFormNote(e.target.value)}
                  placeholder="棚卸応援, 繁忙期応援 等" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="p-4 sm:p-6 border-t flex flex-col sm:flex-row justify-end gap-2">
              <button onClick={() => { setShowForm(false); resetForm(); }}
                className="w-full sm:w-auto px-4 py-2 border rounded-lg text-xs sm:text-sm">
                キャンセル
              </button>
              <button onClick={handleSubmit} disabled={saving || !formDate || !formName}
                className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-xs sm:text-sm disabled:opacity-50">
                {saving ? "登録中..." : "登録"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================
// 会社カレンダー管理ページ
// =============================================================
"use client";

import { useState, useEffect, useCallback } from "react";

interface CalendarEntry {
  id: string;
  storeId: string | null;
  calendarDate: string;
  dayType: string;
  name: string | null;
  note: string | null;
  store?: { name: string } | null;
}

const DAY_TYPES = [
  { value: "HOLIDAY", label: "休業日", color: "bg-red-100 text-red-800" },
  { value: "SPECIAL_OPEN", label: "特別営業日", color: "bg-blue-100 text-blue-800" },
  { value: "REDUCED_HOURS", label: "短縮営業", color: "bg-yellow-100 text-yellow-800" },
  { value: "INVENTORY", label: "棚卸日", color: "bg-purple-100 text-purple-800" },
  { value: "BUSY_DAY", label: "繁忙日", color: "bg-orange-100 text-orange-800" },
];

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export default function CompanyCalendarPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // 新規登録フォーム
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formType, setFormType] = useState("HOLIDAY");
  const [formName, setFormName] = useState("");
  const [formNote, setFormNote] = useState("");

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/company-calendar?year=${year}`);
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      console.error("カレンダー取得エラー");
    }
    setLoading(false);
  }, [year]);

  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

  // 月のカレンダーグリッド生成
  const generateCalendarDays = () => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDow = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const days: (number | null)[] = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  };

  const getEntryForDate = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return entries.find((e) => e.calendarDate.startsWith(dateStr));
  };

  const getDayTypeInfo = (type: string) =>
    DAY_TYPES.find((t) => t.value === type) || DAY_TYPES[0];

  const handleSave = async () => {
    if (!selectedDate) return;
    try {
      await fetch("/api/company-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [{
            calendarDate: selectedDate,
            dayType: formType,
            name: formName || null,
            note: formNote || null,
          }],
        }),
      });
      setSelectedDate(null);
      setFormName("");
      setFormNote("");
      fetchCalendar();
    } catch {
      alert("保存に失敗しました");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この日程を削除しますか？")) return;
    try {
      await fetch(`/api/company-calendar/${id}`, { method: "DELETE" });
      fetchCalendar();
    } catch {
      alert("削除に失敗しました");
    }
  };

  const days = generateCalendarDays();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">会社カレンダー</h1>
        <div className="text-sm text-gray-500">休業日・繁忙日・特別営業日を管理</div>
      </div>

      {/* 凡例 */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-4 flex flex-wrap gap-3">
        {DAY_TYPES.map((t) => (
          <span key={t.value} className={`px-2 py-1 rounded text-xs font-medium ${t.color}`}>
            {t.label}
          </span>
        ))}
      </div>

      {/* 年月選択 */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-4 flex items-center gap-4">
        <button
          onClick={() => { if (month === 1) { setYear(year - 1); setMonth(12); } else setMonth(month - 1); }}
          className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
        >◀</button>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border rounded px-2 py-1">
          {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border rounded px-2 py-1">
          {MONTHS.map((m) => <option key={m} value={m}>{m}月</option>)}
        </select>
        <button
          onClick={() => { if (month === 12) { setYear(year + 1); setMonth(1); } else setMonth(month + 1); }}
          className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
        >▶</button>
        <span className="ml-4 text-sm text-gray-500">
          {loading ? "読込中..." : `登録済み: ${entries.filter(e => {
            const d = new Date(e.calendarDate);
            return d.getFullYear() === year && d.getMonth() + 1 === month;
          }).length}件`}
        </span>
      </div>

      {/* カレンダーグリッド */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {/* 曜日ヘッダ */}
        <div className="grid grid-cols-7 border-b">
          {WEEKDAY_LABELS.map((label, i) => (
            <div key={label} className={`py-2 text-center text-sm font-medium ${
              i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : "text-gray-600"
            }`}>
              {label}
            </div>
          ))}
        </div>

        {/* 日付セル */}
        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            if (day === null) return <div key={idx} className="min-h-[80px] bg-gray-50 border-b border-r" />;

            const entry = getEntryForDate(day);
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dow = new Date(year, month - 1, day).getDay();

            return (
              <div
                key={idx}
                className={`min-h-[80px] border-b border-r p-1 cursor-pointer hover:bg-blue-50 transition ${
                  entry ? "bg-opacity-50" : ""
                }`}
                onClick={() => { setSelectedDate(dateStr); if (entry) { setFormType(entry.dayType); setFormName(entry.name || ""); setFormNote(entry.note || ""); } else { setFormType("HOLIDAY"); setFormName(""); setFormNote(""); }}}
              >
                <div className={`text-sm font-medium ${
                  dow === 0 ? "text-red-600" : dow === 6 ? "text-blue-600" : "text-gray-800"
                }`}>
                  {day}
                </div>
                {entry && (
                  <div className="mt-1">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${getDayTypeInfo(entry.dayType).color}`}>
                      {getDayTypeInfo(entry.dayType).label}
                    </span>
                    {entry.name && (
                      <div className="text-xs text-gray-600 mt-0.5 truncate">{entry.name}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 登録モーダル */}
      {selectedDate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelectedDate(null)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{selectedDate} の設定</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日程タイプ</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  {DAY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例: 元旦, 棚卸, 初売り"
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                <input
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={handleSave} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">保存</button>
              {entries.find(e => e.calendarDate.startsWith(selectedDate)) && (
                <button
                  onClick={() => {
                    const entry = entries.find(e => e.calendarDate.startsWith(selectedDate));
                    if (entry) handleDelete(entry.id);
                    setSelectedDate(null);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >削除</button>
              )}
              <button onClick={() => setSelectedDate(null)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* 年間一覧 */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mt-4">
        <h2 className="text-lg font-bold mb-3">{year}年 登録一覧</h2>
        {entries.length === 0 ? (
          <p className="text-gray-500 text-sm">登録された日程はありません</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">日付</th>
                <th className="px-3 py-2 text-left">タイプ</th>
                <th className="px-3 py-2 text-left">名称</th>
                <th className="px-3 py-2 text-left">備考</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2">{e.calendarDate.split("T")[0]}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${getDayTypeInfo(e.dayType).color}`}>
                      {getDayTypeInfo(e.dayType).label}
                    </span>
                  </td>
                  <td className="px-3 py-2">{e.name || "-"}</td>
                  <td className="px-3 py-2">{e.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

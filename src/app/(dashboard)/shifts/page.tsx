// =============================================================
// シフト管理画面（ボードビュー + リストビュー切替）
// ボード: LSP風ガントチャート（1日単位）
// リスト: 週カレンダー形式
// =============================================================
"use client";

import { useState, useEffect, useCallback } from "react";
import { ShiftCalendar } from "@/components/shift/ShiftCalendar";
import { ShiftBoard } from "@/components/shift/ShiftBoard";
import { ShiftFormModal } from "@/components/shift/ShiftFormModal";
import ShiftGenerateModal from "@/components/shifts/ShiftGenerateModal";
import type { ShiftWithEmployee } from "@/types/shift";

// ローカルタイムで YYYY-MM-DD を返す（toISOStringはUTC変換で日付がずれる）
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

type ViewMode = "board" | "list";

export default function ShiftsPage() {
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1); // 月曜始まり
    return localDateStr(d);
  });
  const [selectedDate, setSelectedDate] = useState(() => localDateStr(new Date()));
  const [shifts, setShifts] = useState<ShiftWithEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftWithEmployee | null>(null);
  const [formDate, setFormDate] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [storeId, setStoreId] = useState<string>("");
  const [storeName, setStoreName] = useState<string>("");
  const [coverageKey, setCoverageKey] = useState(0);
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("board");

  // 店舗一覧取得
  useEffect(() => {
    fetch("/api/stores?activeOnly=false")
      .then((r) => r.json())
      .then((d) => {
        const list = d.data || d || [];
        if (Array.isArray(list) && list.length > 0) {
          setStores(
            list.map((s: { id: string; name: string }) => ({
              id: s.id,
              name: s.name || "",
            }))
          );
          setStoreId(list[0].id);
          setStoreName(list[0].name || "");
        }
      })
      .catch(() => {});
  }, []);

  const fetchShifts = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const endDate = new Date(weekStart + "T00:00:00");
      endDate.setDate(endDate.getDate() + 6);
      const params = new URLSearchParams({
        storeId,
        startDate: weekStart,
        endDate: localDateStr(endDate),
        limit: "5000",
      });
      const res = await fetch(`/api/shifts?${params}`);
      const json = await res.json();
      if (json.success) {
        setShifts(json.data);
        setCoverageKey((k) => k + 1);
      }
    } catch (err) {
      console.error("シフト取得エラー:", err);
    } finally {
      setLoading(false);
    }
  }, [weekStart, storeId]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  const moveWeek = (direction: number) => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + direction * 7);
    const newWS = localDateStr(d);
    setWeekStart(newWS);
    // 選択日も同じ方向に移動
    const sd = new Date(selectedDate + "T00:00:00");
    sd.setDate(sd.getDate() + direction * 7);
    setSelectedDate(localDateStr(sd));
  };

  const handleAddShift = (date?: string) => {
    setEditingShift(null);
    setFormDate(date || selectedDate);
    setShowForm(true);
  };

  const handleEditShift = (shift: ShiftWithEmployee) => {
    setEditingShift(shift);
    setFormDate(null);
    setShowForm(true);
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditingShift(null);
    fetchShifts();
  };

  const handlePublishAll = async () => {
    const draftIds = shifts
      .filter((s) => s.status === "DRAFT")
      .map((s) => s.id);
    if (draftIds.length === 0) return;
    if (!confirm(`${draftIds.length}件のシフトを公開しますか？`)) return;

    try {
      await fetch("/api/shifts/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftIds: draftIds, status: "PUBLISHED" }),
      });
      fetchShifts();
    } catch (err) {
      console.error("一括公開エラー:", err);
    }
  };

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + i);
    return localDateStr(d);
  });

  const draftCount = shifts.filter((s) => s.status === "DRAFT").length;

  // 曜日ごとのシフト数
  const shiftCountByDate = (date: string) => {
    return shifts.filter((s) => {
      const d = typeof s.shiftDate === "string"
        ? s.shiftDate.split("T")[0]
        : localDateStr(new Date(s.shiftDate));
      return d === date;
    }).length;
  };

  return (
    <div>
      {/* ===== ヘッダー ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-4">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800">シフト管理</h2>
            {/* 店舗セレクター */}
            {stores.length > 1 ? (
              <select
                value={storeId}
                onChange={(e) => {
                  const selected = stores.find((s) => s.id === e.target.value);
                  setStoreId(e.target.value);
                  setStoreName(selected?.name || "");
                }}
                className="w-full sm:w-auto px-3 py-1.5 text-sm border rounded-lg bg-white text-gray-700 font-medium"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : storeName ? (
              <span className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg text-gray-700 font-medium">
                {storeName}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          {/* ビュー切り替え */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("board")}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                viewMode === "board"
                  ? "bg-white text-gray-800 shadow-sm font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              作業スケジュール
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                viewMode === "list"
                  ? "bg-white text-gray-800 shadow-sm font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              週カレンダー
            </button>
          </div>

          {draftCount > 0 && (
            <button
              onClick={handlePublishAll}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs sm:text-sm hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              一括公開（{draftCount}件）
            </button>
          )}
          <button
            onClick={() => setShowGenerate(true)}
            disabled={!storeId}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm transition-colors whitespace-nowrap ${
              storeId
                ? "bg-purple-600 text-white hover:bg-purple-700"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            自動生成
          </button>
          <button
            onClick={() => handleAddShift()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs sm:text-sm hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            + シフト追加
          </button>
        </div>
      </div>

      {/* ===== 週ナビゲーション + 日付セレクター ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
        <button
          onClick={() => moveWeek(-1)}
          className="px-3 py-1.5 text-xs sm:text-sm bg-white border rounded-lg hover:bg-gray-50 whitespace-nowrap"
        >
          ← 前週
        </button>

        {/* 曜日タブ（ボードモード時のみ） */}
        {viewMode === "board" ? (
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 overflow-x-auto">
            {weekDates.map((date) => {
              const d = new Date(date + "T00:00:00");
              const dow = d.getDay();
              const isSelected = date === selectedDate;
              const isWeekend = dow === 0 || dow === 6;
              const count = shiftCountByDate(date);
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`px-2 sm:px-3 py-1.5 text-xs rounded-md transition-colors min-w-[50px] sm:min-w-[60px] flex-shrink-0 ${
                    isSelected
                      ? "bg-white text-gray-800 shadow-sm font-bold"
                      : isWeekend
                      ? "text-red-500 hover:bg-white/50"
                      : "text-gray-600 hover:bg-white/50"
                  }`}
                >
                  <div className={`${isWeekend && !isSelected ? "text-red-500" : ""}`}>
                    {d.getMonth() + 1}/{d.getDate()}
                  </div>
                  <div className={`text-[10px] ${isSelected ? "text-gray-600" : "text-gray-400"}`}>
                    {DAY_LABELS[dow]}
                    {count > 0 && <span className="ml-0.5 text-blue-500">({count})</span>}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <span className="font-medium text-xs sm:text-sm text-gray-700 whitespace-nowrap">
            {weekDates[0]} ～ {weekDates[6]}
          </span>
        )}

        <button
          onClick={() => moveWeek(1)}
          className="px-3 py-1.5 text-xs sm:text-sm bg-white border rounded-lg hover:bg-gray-50 whitespace-nowrap"
        >
          翌週 →
        </button>
        <button
          onClick={() => {
            const d = new Date();
            d.setDate(d.getDate() - d.getDay() + 1);
            setWeekStart(localDateStr(d));
            setSelectedDate(localDateStr(new Date()));
          }}
          className="px-3 py-1.5 text-xs sm:text-sm text-blue-600 hover:underline whitespace-nowrap"
        >
          今日
        </button>
      </div>

      {/* ===== メインコンテンツ ===== */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      ) : viewMode === "board" ? (
        <ShiftBoard
          weekDates={weekDates}
          shifts={shifts}
          storeId={storeId}
          weekStart={weekStart}
          selectedDate={selectedDate}
          onEditShift={handleEditShift}
          onAddShift={handleAddShift}
          refreshKey={coverageKey}
        />
      ) : (
        <ShiftCalendar
          weekDates={weekDates}
          shifts={shifts}
          onAddShift={handleAddShift}
          onEditShift={handleEditShift}
        />
      )}

      {/* ===== モーダル ===== */}
      {showForm && (
        <ShiftFormModal
          shift={editingShift}
          defaultDate={formDate}
          storeId={storeId}
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}

      {showGenerate && storeId && (
        <ShiftGenerateModal
          storeId={storeId}
          onClose={() => setShowGenerate(false)}
          onGenerated={(generatedWeekStart?: string) => {
            if (generatedWeekStart) {
              setWeekStart(generatedWeekStart);
            }
            fetchShifts();
          }}
        />
      )}
    </div>
  );
}

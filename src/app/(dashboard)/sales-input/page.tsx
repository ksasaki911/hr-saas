"use client";

import { useState, useEffect, useCallback } from "react";

// ============================================================
// 売上データ入力画面
// - 手入力フォーム（店舗・日付・金額・客数）
// - CSV取込機能
// - 既存データの一覧・確認
// ============================================================

type Store = { id: string; name: string; code: string };

type SalesRecord = {
  id: string;
  storeId: string;
  salesDate: string;
  salesAmount: number;
  grossProfit: number | null;
  customerCount: number | null;
  note: string | null;
  store: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export default function SalesInputPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [salesData, setSalesData] = useState<SalesRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"list" | "input" | "csv" | "excel">("list");

  // フォーム状態
  const [formDate, setFormDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [formAmount, setFormAmount] = useState("");
  const [formGrossProfit, setFormGrossProfit] = useState("");
  const [formCustomers, setFormCustomers] = useState("");
  const [formNote, setFormNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Excel取込
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelPreview, setExcelPreview] = useState<Array<{
    yearMonth: string; storeCode: string; storeName: string;
    salesAmount: number; grossProfit: number; customerCount: number;
  }>>([]);
  const [excelImporting, setExcelImporting] = useState(false);

  // CSV取込
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<Array<{ date: string; amount: number; grossProfit: number; customers: number; note: string }>>([]);
  const [csvImporting, setCsvImporting] = useState(false);

  // 一覧表示期間
  const [listMonth, setListMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // 店舗リスト取得
  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data.length > 0) {
          setStores(res.data);
          if (!selectedStoreId) setSelectedStoreId(res.data[0].id);
        }
      })
      .catch(console.error);
  }, [selectedStoreId]);

  // 売上データ取得
  const fetchSales = useCallback(async () => {
    if (!selectedStoreId || !listMonth) return;
    setLoading(true);
    try {
      const [y, m] = listMonth.split("-").map(Number);
      const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
      const endDay = new Date(y, m, 0).getDate();
      const endDate = `${y}-${String(m).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
      const params = new URLSearchParams({ storeId: selectedStoreId, startDate, endDate });
      const res = await fetch(`/api/daily-sales?${params}`);
      const json = await res.json();
      if (json.success) setSalesData(json.data);
    } catch (err) {
      console.error("Failed to fetch sales:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, listMonth]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // 手入力保存
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId || !formDate || !formAmount) return;

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/daily-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStoreId,
          salesDate: formDate,
          salesAmount: Number(formAmount),
          grossProfit: formGrossProfit ? Number(formGrossProfit) : null,
          customerCount: formCustomers ? Number(formCustomers) : null,
          note: formNote || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: "success", text: "売上データを保存しました" });
        setFormAmount("");
        setFormGrossProfit("");
        setFormCustomers("");
        setFormNote("");
        fetchSales();
      } else {
        setMessage({ type: "error", text: json.error || "保存に失敗しました" });
      }
    } catch {
      setMessage({ type: "error", text: "通信エラーが発生しました" });
    } finally {
      setSaving(false);
    }
  };

  // CSVパース
  const handleCsvParse = () => {
    const lines = csvText.trim().split("\n");
    const records: typeof csvPreview = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      // ヘッダー行をスキップ
      if (line.includes("日付") || line.toLowerCase().includes("date")) continue;
      const cols = line.split(",").map((c) => c.trim());
      if (cols.length < 2) continue;
      records.push({
        date: cols[0],
        amount: Number(cols[1]) || 0,
        grossProfit: Number(cols[2]) || 0,
        customers: Number(cols[3]) || 0,
        note: cols[4] || "",
      });
    }
    setCsvPreview(records);
  };

  // CSV一括取込
  const handleCsvImport = async () => {
    if (!selectedStoreId || csvPreview.length === 0) return;
    setCsvImporting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/daily-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: csvPreview.map((r) => ({
            storeId: selectedStoreId,
            salesDate: r.date,
            salesAmount: r.amount,
            grossProfit: r.grossProfit || null,
            customerCount: r.customers || null,
            note: r.note || null,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({
          type: "success",
          text: `${json.data.total}件処理（新規${json.data.created}件、更新${json.data.updated}件）`,
        });
        setCsvText("");
        setCsvPreview([]);
        fetchSales();
      } else {
        setMessage({ type: "error", text: json.error || "取込に失敗しました" });
      }
    } catch {
      setMessage({ type: "error", text: "通信エラーが発生しました" });
    } finally {
      setCsvImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">売上データ入力</h1>
          <p className="text-sm text-gray-500 mt-1">日別売上の手入力・CSV取込</p>
        </div>
        <div className="flex items-center gap-3">
          {stores.length > 1 && (
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* タブ */}
      <div className="flex border-b border-gray-200">
        {[
          { key: "list" as const, label: "売上一覧" },
          { key: "input" as const, label: "手入力" },
          { key: "csv" as const, label: "CSV取込" },
          { key: "excel" as const, label: "Excel取込" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setMessage(null); }}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* メッセージ */}
      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 売上一覧 */}
      {tab === "list" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              {stores.find((s) => s.id === selectedStoreId)?.name || ""} 売上一覧
            </h3>
            <select
              value={listMonth}
              onChange={(e) => setListMonth(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              {(() => {
                const opts = [];
                const now = new Date();
                for (let i = 0; i < 18; i++) {
                  const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                  const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                  opts.push(<option key={v} value={v}>{d.getFullYear()}年{d.getMonth() + 1}月</option>);
                }
                return opts;
              })()}
            </select>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : salesData.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              この期間の売上データはありません
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">日付</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">売上金額</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">荒利高</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">荒利率</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">客数</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">客単価</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">備考</th>
                </tr>
              </thead>
              <tbody>
                {salesData.map((s) => {
                  const unitPrice = s.customerCount && s.customerCount > 0
                    ? Math.round(s.salesAmount / s.customerCount)
                    : null;
                  const grossMarginRate = s.grossProfit && s.salesAmount > 0
                    ? Math.round((s.grossProfit / s.salesAmount) * 1000) / 10
                    : null;
                  return (
                    <tr key={s.id} className="border-t border-gray-50">
                      <td className="px-4 py-3">{formatDate(s.salesDate)}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {s.salesAmount.toLocaleString()}円
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.grossProfit != null ? `${s.grossProfit.toLocaleString()}円` : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {grossMarginRate != null ? `${grossMarginRate}%` : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.customerCount != null ? `${s.customerCount}人` : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {unitPrice != null ? `${unitPrice.toLocaleString()}円` : "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{s.note || ""}</td>
                    </tr>
                  );
                })}
                {/* 合計行 */}
                {(() => {
                  const totalSales = salesData.reduce((s, r) => s + r.salesAmount, 0);
                  const totalGP = salesData.reduce((s, r) => s + (r.grossProfit || 0), 0);
                  const totalCust = salesData.reduce((s, r) => s + (r.customerCount || 0), 0);
                  const gpRate = totalGP > 0 && totalSales > 0 ? Math.round((totalGP / totalSales) * 1000) / 10 : null;
                  return (
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                      <td className="px-4 py-3">合計</td>
                      <td className="px-4 py-3 text-right">{totalSales.toLocaleString()}円</td>
                      <td className="px-4 py-3 text-right">{totalGP > 0 ? `${totalGP.toLocaleString()}円` : "-"}</td>
                      <td className="px-4 py-3 text-right">{gpRate != null ? `${gpRate}%` : "-"}</td>
                      <td className="px-4 py-3 text-right">{totalCust.toLocaleString()}人</td>
                      <td className="px-4 py-3 text-right">-</td>
                      <td className="px-4 py-3">{salesData.length}日分</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 手入力フォーム */}
      {tab === "input" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-lg">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">売上データ手入力</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">日付 *</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">売上金額 *</label>
              <input
                type="number"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                required
                min="0"
                placeholder="例: 1500000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">荒利高</label>
              <input
                type="number"
                value={formGrossProfit}
                onChange={(e) => setFormGrossProfit(e.target.value)}
                min="0"
                placeholder="例: 450000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">客数</label>
              <input
                type="number"
                value={formCustomers}
                onChange={(e) => setFormCustomers(e.target.value)}
                min="0"
                placeholder="例: 450"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">備考</label>
              <input
                type="text"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="特記事項があれば"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !formAmount}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "保存中..." : "保存（既存データは上書き更新）"}
            </button>
            <p className="text-xs text-gray-400">
              同じ日付・店舗のデータが既にある場合は更新されます。
            </p>
          </form>
        </div>
      )}

      {/* CSV取込 */}
      {tab === "csv" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">CSV形式で取込</h3>
            <p className="text-xs text-gray-500 mb-3">
              CSVフォーマット: 日付,売上金額,荒利高,客数,備考（1行目にヘッダーがあればスキップされます）
            </p>
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <p className="text-xs text-gray-500 mb-1">CSVサンプル:</p>
              <code className="text-xs text-gray-600 block whitespace-pre">
{`日付,売上金額,荒利高,客数,備考
2026-03-01,1520000,456000,430,
2026-03-02,1680000,504000,485,日曜特売
2026-03-03,980000,294000,310,`}
              </code>
            </div>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={8}
              placeholder="CSVデータを貼り付けてください"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
            />
            <button
              onClick={handleCsvParse}
              disabled={!csvText.trim()}
              className="mt-3 bg-gray-800 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-900 disabled:opacity-50 transition-colors"
            >
              プレビュー
            </button>
          </div>

          {csvPreview.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">
                  取込プレビュー（{csvPreview.length}件）
                </h3>
                <button
                  onClick={handleCsvImport}
                  disabled={csvImporting}
                  className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {csvImporting ? "取込中..." : "一括取込"}
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">日付</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">売上金額</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">荒利高</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">客数</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.map((r, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-4 py-2">{r.date}</td>
                      <td className="px-4 py-2 text-right">{r.amount.toLocaleString()}円</td>
                      <td className="px-4 py-2 text-right">{r.grossProfit ? `${r.grossProfit.toLocaleString()}円` : "-"}</td>
                      <td className="px-4 py-2 text-right">{r.customers || "-"}</td>
                      <td className="px-4 py-2 text-gray-500">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* Excel取込 */}
      {tab === "excel" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">店別月別集計Excel取込</h3>
            <p className="text-xs text-gray-500 mb-3">
              「店別月別_縦」シートから売上・荒利・客数を取り込みます。店コードで店舗をマッピングし、月の1日付けで登録します。
            </p>
            <div className="bg-blue-50 rounded-lg p-3 mb-4 text-xs text-blue-700">
              <p className="font-medium mb-1">対応フォーマット:</p>
              <p>列: 年月(YYYY-MM), 店コード, 店名, 店売上, 当月荒利金額, 当年客数</p>
              <p className="mt-1">※ 全店舗の月次集計データを一括で取り込めます</p>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setExcelFile(f);
                  setExcelPreview([]);
                  // クライアント側プレビュー: FormDataでサーバに送る前にSheetJSで表示
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    try {
                      // dynamic import不要: xlsx はビルド時にバンドルされる
                      import("xlsx").then((XLSX) => {
                        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                        const wb = XLSX.read(data, { type: "array" });
                        const sheetName = wb.SheetNames.find((n: string) => n.includes("店別月別")) || wb.SheetNames[0];
                        const sheet = wb.Sheets[sheetName];
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const rows = XLSX.utils.sheet_to_json<any>(sheet);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const parsed = rows.map((row: any) => ({
                          yearMonth: String(row["年月(YYYY-MM)"] || row["年月"] || "").trim(),
                          storeCode: String(row["店コード"] || "").trim(),
                          storeName: String(row["店名"] || "").trim(),
                          salesAmount: Number(row["店売上"] || row["売上"] || 0),
                          grossProfit: Number(row["当月荒利金額"] || row["荒利金額"] || row["荒利"] || 0),
                          customerCount: Number(row["当年客数"] || row["客数"] || 0),
                        })).filter((r: { yearMonth: string; salesAmount: number }) => r.yearMonth && r.salesAmount > 0);
                        setExcelPreview(parsed);
                      });
                    } catch (err) {
                      console.error("Excel parse error:", err);
                    }
                  };
                  reader.readAsArrayBuffer(f);
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {excelPreview.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">
                  取込プレビュー（{excelPreview.length}件）
                </h3>
                <button
                  onClick={async () => {
                    if (!excelFile) return;
                    setExcelImporting(true);
                    setMessage(null);
                    try {
                      const formData = new FormData();
                      formData.append("file", excelFile);
                      const res = await fetch("/api/daily-sales/import-monthly", {
                        method: "POST",
                        body: formData,
                      });
                      const json = await res.json();
                      if (json.success) {
                        const d = json.data;
                        let text = `${d.total}件処理（新規${d.created}件、更新${d.updated}件`;
                        if (d.skipped > 0) text += `、スキップ${d.skipped}件`;
                        text += "）";
                        if (d.errors?.length > 0) text += "\n" + d.errors.join("\n");
                        if (d.debug) text += `\nDB店舗コード: ${d.debug.dbStoreCodes?.join(", ")}`;
                        if (d.debug) text += `\nマップキー: ${d.debug.mapKeys?.join(", ")}`;
                        setMessage({ type: d.skipped > 0 ? "error" : "success", text });
                        if (d.created > 0 || d.updated > 0) fetchSales();
                      } else {
                        setMessage({ type: "error", text: json.error || "取込に失敗しました" });
                      }
                    } catch {
                      setMessage({ type: "error", text: "通信エラーが発生しました" });
                    } finally {
                      setExcelImporting(false);
                    }
                  }}
                  disabled={excelImporting}
                  className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {excelImporting ? "取込中..." : "一括取込"}
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">年月</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">店コード</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">店名</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">売上</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">荒利</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">荒利率</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">客数</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">客単価</th>
                  </tr>
                </thead>
                <tbody>
                  {excelPreview.map((r, i) => {
                    const gpRate = r.grossProfit && r.salesAmount > 0
                      ? Math.round((r.grossProfit / r.salesAmount) * 1000) / 10 : null;
                    const unitPrice = r.customerCount > 0
                      ? Math.round(r.salesAmount / r.customerCount) : null;
                    return (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-4 py-2">{r.yearMonth}</td>
                        <td className="px-4 py-2">{r.storeCode}</td>
                        <td className="px-4 py-2">{r.storeName}</td>
                        <td className="px-4 py-2 text-right font-medium">{r.salesAmount.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">{r.grossProfit.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">{gpRate != null ? `${gpRate}%` : "-"}</td>
                        <td className="px-4 py-2 text-right">{r.customerCount.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">{unitPrice != null ? `${unitPrice.toLocaleString()}円` : "-"}</td>
                      </tr>
                    );
                  })}
                  {/* 合計行 */}
                  {(() => {
                    const totalSales = excelPreview.reduce((s, r) => s + r.salesAmount, 0);
                    const totalGP = excelPreview.reduce((s, r) => s + r.grossProfit, 0);
                    const totalCust = excelPreview.reduce((s, r) => s + r.customerCount, 0);
                    const gpRate = totalSales > 0 ? Math.round((totalGP / totalSales) * 1000) / 10 : null;
                    return (
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                        <td className="px-4 py-2" colSpan={3}>合計（{excelPreview.length}店舗）</td>
                        <td className="px-4 py-2 text-right">{totalSales.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">{totalGP.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">{gpRate != null ? `${gpRate}%` : "-"}</td>
                        <td className="px-4 py-2 text-right">{totalCust.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">
                          {totalCust > 0 ? `${Math.round(totalSales / totalCust).toLocaleString()}円` : "-"}
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

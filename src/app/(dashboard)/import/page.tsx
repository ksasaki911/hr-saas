"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// =============================================================
// タッチオンタイム CSVインポート画面
// 大容量CSV対応: クライアント側でパース → 必要列のみJSON送信
// ステップ: ファイル選択 → カラムマッピング → プレビュー → インポート実行
// =============================================================

type ImportType = "employees" | "attendance";
type Step = "select" | "mapping" | "preview" | "result";

interface MappingPreset {
  systemField: string;
  label: string;
}

const EMPLOYEE_FIELDS: MappingPreset[] = [
  { systemField: "code", label: "従業員コード *" },
  { systemField: "lastName", label: "姓 *" },
  { systemField: "firstName", label: "名" },
  { systemField: "lastNameKana", label: "姓（カナ）" },
  { systemField: "firstNameKana", label: "名（カナ）" },
  { systemField: "email", label: "メールアドレス" },
  { systemField: "phone", label: "電話番号" },
  { systemField: "storeName", label: "所属拠点名" },
  { systemField: "storeCode", label: "拠点コード" },
  { systemField: "departmentName", label: "部門名" },
  { systemField: "departmentCode", label: "部門コード" },
  { systemField: "employmentType", label: "雇用区分" },
  { systemField: "positionName", label: "役職" },
  { systemField: "hireDate", label: "入社日" },
  { systemField: "hourlyWage", label: "時給" },
  { systemField: "monthlySalary", label: "月給" },
];

const ATTENDANCE_FIELDS: MappingPreset[] = [
  { systemField: "employeeCode", label: "従業員コード *" },
  { systemField: "employeeName", label: "氏名" },
  { systemField: "date", label: "日付 *" },
  { systemField: "clockIn", label: "出勤時刻" },
  { systemField: "clockOut", label: "退勤時刻" },
  { systemField: "breakTime", label: "休憩時間" },
  { systemField: "totalWork", label: "実働時間" },
  { systemField: "overtime", label: "残業時間" },
  { systemField: "nightOvertime", label: "深夜残業" },
  { systemField: "lateMinutes", label: "遅刻時間" },
  { systemField: "earlyLeave", label: "早退時間" },
  { systemField: "holidayWork", label: "休日出勤" },
  { systemField: "storeName", label: "拠点名" },
  { systemField: "departmentName", label: "部門名" },
  { systemField: "note", label: "備考" },
];

// ============================================
// 勤怠データ自動マッピングパターン
// ============================================
const ATTENDANCE_AUTO_MAP: { systemField: string; patterns: string[] }[] = [
  { systemField: "employeeCode", patterns: ["従業員コード", "社員番号", "従業員番号"] },
  { systemField: "employeeName", patterns: ["氏名", "名前", "従業員名"] },
  { systemField: "date", patterns: ["日時（曜日なし）", "日付", "勤務日", "出勤日"] },
  { systemField: "clockIn", patterns: ["出勤時刻(時刻のみ)", "出勤時刻", "出勤"] },
  { systemField: "clockOut", patterns: ["退勤時刻(時刻のみ)", "退勤時刻", "退勤"] },
  { systemField: "breakTime", patterns: ["休憩時間"] },
  { systemField: "totalWork", patterns: ["労働合計時間", "実働時間", "労働時間"] },
  { systemField: "overtime", patterns: ["残業時間"] },
  { systemField: "nightOvertime", patterns: ["深夜残業時間", "深夜残業"] },
  { systemField: "lateMinutes", patterns: ["遅刻時間"] },
  { systemField: "earlyLeave", patterns: ["早退時間"] },
  { systemField: "holidayWork", patterns: ["休日所定時間", "休日出勤"] },
  { systemField: "storeName", patterns: ["所属名", "出勤先所属"] },
  { systemField: "departmentName", patterns: ["部門", "部門名"] },
  { systemField: "note", patterns: ["備考(スケジュール)", "備考"] },
];

const EMPLOYEE_AUTO_MAP: { systemField: string; patterns: string[] }[] = [
  { systemField: "code", patterns: ["従業員コード", "社員番号", "社員コード"] },
  { systemField: "lastName", patterns: ["姓", "氏名（姓）"] },
  { systemField: "firstName", patterns: ["名", "氏名（名）"] },
  { systemField: "lastNameKana", patterns: ["姓（カナ）", "姓カナ", "セイ"] },
  { systemField: "firstNameKana", patterns: ["名（カナ）", "名カナ", "メイ"] },
  { systemField: "email", patterns: ["メールアドレス", "メール"] },
  { systemField: "phone", patterns: ["電話番号", "電話"] },
  { systemField: "storeName", patterns: ["所属", "拠点", "所属拠点", "店舗名"] },
  { systemField: "storeCode", patterns: ["拠点コード", "所属コード", "店舗コード"] },
  { systemField: "departmentName", patterns: ["部門", "部門名"] },
  { systemField: "departmentCode", patterns: ["部門コード", "部署コード"] },
  { systemField: "employmentType", patterns: ["雇用区分コード", "雇用区分", "給与体系コード", "給与体系", "パート区分コード", "パート区分", "雇用形態", "勤務形態", "従業員区分"] },
  { systemField: "positionName", patterns: ["役職", "職位"] },
  { systemField: "hireDate", patterns: ["入社日", "入社年月日"] },
  { systemField: "hourlyWage", patterns: ["時給"] },
  { systemField: "monthlySalary", patterns: ["月給", "基本給"] },
];

// ============================================
// クライアント側CSVパーサー
// ============================================

/** cp932/Shift-JIS/UTF-8 自動判別デコード */
function decodeCSVBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // BOM check
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buffer);
  }
  try {
    const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    if (!utf8.includes("\ufffd")) return utf8;
  } catch { /* not UTF-8 */ }
  return new TextDecoder("shift-jis", { fatal: false }).decode(buffer);
}

/** CSV行パーサー（ダブルクォート対応） */
function parseCSVRows(text: string): string[][] {
  const lines: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { current.push(field.trim()); field = ""; }
      else if (ch === "\r" && next === "\n") {
        current.push(field.trim());
        if (current.some(c => c !== "")) lines.push(current);
        current = []; field = ""; i++;
      } else if (ch === "\n") {
        current.push(field.trim());
        if (current.some(c => c !== "")) lines.push(current);
        current = []; field = "";
      } else { field += ch; }
    }
  }
  if (field || current.length > 0) {
    current.push(field.trim());
    if (current.some(c => c !== "")) lines.push(current);
  }
  return lines;
}

/** ヘッダー重複対処 */
function deduplicateHeaders(raw: string[]): string[] {
  const count: Record<string, number> = {};
  return raw.map(h => {
    if (!count[h]) { count[h] = 1; return h; }
    count[h]++;
    return `${h}_${count[h]}`;
  });
}

/** 自動マッピング（完全一致優先、使用済み除外） */
function autoDetect(
  headers: string[],
  presets: { systemField: string; patterns: string[] }[]
): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const used = new Set<string>();

  for (const p of presets) {
    let matched: string | null = null;
    // Pass 1: 完全一致
    for (const pat of p.patterns) {
      const f = headers.find(h => h === pat && !used.has(h));
      if (f) { matched = f; break; }
    }
    // Pass 2: 前方一致
    if (!matched) {
      for (const pat of p.patterns) {
        const f = headers.find(h => !used.has(h) && h.startsWith(pat));
        if (f) { matched = f; break; }
      }
    }
    mapping[p.systemField] = matched;
    if (matched) used.add(matched);
  }
  return mapping;
}

interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

interface PreviewData {
  headers: string[];
  mapping: Record<string, string | null>;
  totalRows: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  preview: Record<string, any>[];
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    stats: { totalRows: number; validRows: number; errorRows: number; warningRows: number };
  };
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  storesCreated?: number;
  total: number;
  errors: string[];
}

export default function ImportPage() {
  const [importType, setImportType] = useState<ImportType>("employees");
  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [parsedCsv, setParsedCsv] = useState<ParsedCSV | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [importProgress, setImportProgress] = useState<{ pct: number; batch: number; totalBatches: number; processed: number; total: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // 経過時間タイマー（1秒ごとに更新）
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    setElapsedSec(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const fields = importType === "employees" ? EMPLOYEE_FIELDS : ATTENDANCE_FIELDS;
  const apiEndpoint = importType === "employees" ? "/api/import/employees" : "/api/import/attendance";

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch("/api/stores");
      if (res.ok) {
        const data = await res.json();
        if (data.data) setStores(data.data);
      }
    } catch { /* ignore */ }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setError(null); setParsedCsv(null); }
  };

  // ============================================
  // ステップ1: クライアント側でCSVパース → プレビュー
  // ============================================
  const handleUploadPreview = async () => {
    if (!file) return;
    setLoading(true);
    setLoadingMsg("CSVファイルを読み込み中...");
    setError(null);

    try {
      // クライアント側でCSVをパース
      const buffer = await file.arrayBuffer();
      setLoadingMsg(`デコード中... (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB)`);
      const text = decodeCSVBuffer(buffer);

      setLoadingMsg("CSV解析中...");
      const allRows = parseCSVRows(text);
      if (allRows.length < 2) {
        setError("CSVファイルにデータがありません");
        return;
      }

      const rawHeaders = allRows[0];
      const headers = deduplicateHeaders(rawHeaders);
      const dataRows = allRows.slice(1);

      setLoadingMsg(`${dataRows.length}行を処理中...`);

      // レコード化
      const rows = dataRows.map(row => {
        const record: Record<string, string> = {};
        headers.forEach((h, i) => { record[h] = row[i] || ""; });
        return record;
      });

      const csv: ParsedCSV = { headers, rows, totalRows: rows.length };
      setParsedCsv(csv);

      // 自動マッピング
      const autoMaps = importType === "employees" ? EMPLOYEE_AUTO_MAP : ATTENDANCE_AUTO_MAP;
      const detectedMapping = autoDetect(headers, autoMaps);
      setMapping(detectedMapping);

      // プレビューデータ生成（ローカル）
      const preview = rows.slice(0, 20).map(row => {
        const mapped: Record<string, string | null> = {};
        for (const [sys, col] of Object.entries(detectedMapping)) {
          mapped[sys] = col && row[col] ? row[col] : null;
        }
        return mapped;
      });

      setPreviewData({
        headers,
        mapping: detectedMapping,
        totalRows: rows.length,
        preview,
        validation: { valid: true, errors: [], warnings: [], stats: { totalRows: rows.length, validRows: rows.length, errorRows: 0, warningRows: 0 } },
      });

      setStep("mapping");
      fetchStores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSV解析でエラーが発生しました");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  const handleMappingChange = (systemField: string, csvColumn: string) => {
    setMapping(prev => ({ ...prev, [systemField]: csvColumn === "" ? null : csvColumn }));
  };

  // ============================================
  // ステップ2: マッピング適用 → プレビュー更新
  // ============================================
  const handleApplyMapping = () => {
    if (!parsedCsv) return;

    const preview = parsedCsv.rows.slice(0, 20).map(row => {
      const mapped: Record<string, string | null> = {};
      for (const [sys, col] of Object.entries(mapping)) {
        mapped[sys] = col && row[col] ? row[col] : null;
      }
      return mapped;
    });

    // 簡易バリデーション
    const errors: string[] = [];
    const warnings: string[] = [];
    let validCount = 0;
    let errorCount = 0;

    const requiredFields = importType === "employees"
      ? ["code", "lastName"]
      : ["employeeCode", "date"];

    parsedCsv.rows.forEach((row, i) => {
      const mapped: Record<string, string | null> = {};
      for (const [sys, col] of Object.entries(mapping)) {
        mapped[sys] = col && row[col] ? row[col] : null;
      }
      const hasError = requiredFields.some(f => !mapped[f]);
      if (hasError) {
        if (errors.length < 20) errors.push(`行${i + 2}: 必須項目が空です`);
        errorCount++;
      } else {
        validCount++;
      }
    });

    setPreviewData({
      headers: parsedCsv.headers,
      mapping,
      totalRows: parsedCsv.totalRows,
      preview,
      validation: {
        valid: errorCount === 0,
        errors,
        warnings,
        stats: { totalRows: parsedCsv.totalRows, validRows: validCount, errorRows: errorCount, warningRows: warnings.length },
      },
    });

    setStep("preview");
  };

  // ============================================
  // ステップ3: マッピング済みデータをJSON送信 → インポート
  // ============================================
  const handleImport = async () => {
    if (!parsedCsv) return;
    setLoading(true);
    setLoadingMsg("データを準備中...");
    setError(null);

    // マッピング適用: 必要な列のみ抽出
    setLoadingMsg(`${parsedCsv.totalRows}行をマッピング中...`);
    const mappedRows = parsedCsv.rows.map(row => {
      const mapped: Record<string, string | null> = {};
      for (const [sys, col] of Object.entries(mapping)) {
        mapped[sys] = col && row[col] ? row[col] : null;
      }
      return mapped;
    });

    // バッチ送信（バルクインサート対応で大きいバッチサイズに）
    const BATCH_SIZE = 3000;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalStoresCreated = 0;
    const allErrors: string[] = [];
    const totalBatches = Math.ceil(mappedRows.length / BATCH_SIZE);
    startTimer();

    for (let batch = 0; batch < totalBatches; batch++) {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, mappedRows.length);
      const batchRows = mappedRows.slice(start, end);

      const pct = Math.round((start / mappedRows.length) * 100);
      setImportProgress({ pct, batch: batch + 1, totalBatches, processed: start, total: mappedRows.length });

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 5分タイムアウト（バルク処理のため延長）

        const res = await fetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "import",
            rows: batchRows,
            defaultStoreId: selectedStoreId || undefined,
            batchOffset: start,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const json = await res.json();
        if (!json.success) {
          allErrors.push(`バッチ${batch + 1}: ${json.error || "エラー"}`);
          continue; // エラーでも次のバッチを続行
        }

        totalCreated += json.data.created || 0;
        totalUpdated += json.data.updated || 0;
        totalSkipped += json.data.skipped || 0;
        totalStoresCreated += json.data.storesCreated || 0;
        if (json.data.errors) allErrors.push(...json.data.errors);
      } catch (err) {
        const msg = err instanceof Error && err.name === "AbortError"
          ? `バッチ${batch + 1}: タイムアウト（5分超過）`
          : `バッチ${batch + 1}: ${err instanceof Error ? err.message : "通信エラー"}`;
        allErrors.push(msg);
        continue; // エラーでも次のバッチを続行
      }
    }

    // タイマー停止・プログレス完了
    stopTimer();
    setImportProgress(null);

    // 常に結果画面を表示
    setImportResult({
      created: totalCreated,
      updated: totalUpdated,
      skipped: totalSkipped,
      storesCreated: totalStoresCreated > 0 ? totalStoresCreated : undefined,
      total: mappedRows.length,
      errors: allErrors,
    });
    setStep("result");
    setLoading(false);
    setLoadingMsg("");
  };

  const handleReset = () => {
    setStep("select");
    setFile(null);
    setParsedCsv(null);
    setPreviewData(null);
    setMapping({});
    setImportResult(null);
    setError(null);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">CSVインポート</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            タッチオンタイム等の勤怠システムからCSVデータを取り込みます
          </p>
        </div>
        {step !== "select" && (
          <button onClick={handleReset} className="px-3 sm:px-4 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            最初からやり直す
          </button>
        )}
      </div>

      {/* ステップインジケーター */}
      <div className="flex flex-wrap items-center gap-1 sm:gap-2">
        {[
          { key: "select", label: "1. ファイル選択" },
          { key: "mapping", label: "2. カラム設定" },
          { key: "preview", label: "3. プレビュー" },
          { key: "result", label: "4. 結果" },
        ].map((s, i) => (
          <div key={s.key} className="flex items-center gap-1 sm:gap-2">
            {i > 0 && <div className="w-4 sm:w-8 h-px bg-gray-300" />}
            <div
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium ${
                step === s.key
                  ? "bg-blue-600 text-white"
                  : ["select", "mapping", "preview", "result"].indexOf(step) >
                    ["select", "mapping", "preview", "result"].indexOf(s.key)
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* ステップ1: ファイル選択 */}
      {step === "select" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-6 space-y-4 sm:space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 sm:mb-3">インポートの種類</label>
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <button
                onClick={() => setImportType("employees")}
                className={`p-3 sm:p-4 rounded-lg border-2 text-left transition-all ${importType === "employees" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
              >
                <div className="text-base sm:text-lg mb-1">👥 従業員マスタ</div>
                <div className="text-xs text-gray-500">従業員コード、氏名、所属、雇用区分などの基本情報を取り込みます</div>
              </button>
              <button
                onClick={() => setImportType("attendance")}
                className={`p-3 sm:p-4 rounded-lg border-2 text-left transition-all ${importType === "attendance" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
              >
                <div className="text-base sm:text-lg mb-1">⏱️ 勤怠実績</div>
                <div className="text-xs text-gray-500">出退勤時刻、残業、遅刻、早退などの勤怠データを取り込みます</div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">CSVファイル</label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-8 text-center hover:border-blue-400 transition-colors">
              <input type="file" accept=".csv,.txt" onChange={handleFileSelect} className="hidden" id="csv-file" />
              <label htmlFor="csv-file" className="cursor-pointer">
                <div className="text-2xl sm:text-4xl mb-2 sm:mb-3">📄</div>
                <div className="text-xs sm:text-sm text-gray-600">
                  {file ? (
                    <span className="text-blue-600 font-medium">{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                  ) : (
                    <>クリックしてCSVファイルを選択<br /><span className="text-xs text-gray-400">Shift-JIS / UTF-8 対応・大容量ファイルOK</span></>
                  )}
                </div>
              </label>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4">
            <div className="font-medium text-amber-800 text-xs sm:text-sm mb-1 sm:mb-2">タッチオンタイムからのエクスポート方法</div>
            <div className="text-xs text-amber-700 space-y-1">
              {importType === "employees" ? (
                <>
                  <p>1. タッチオンタイム管理画面 → 設定 → 従業員設定 → CSV出力</p>
                  <p>2. 出力項目: 従業員コード、姓、名、所属、雇用区分、入社日 を必ず含めてください</p>
                </>
              ) : (
                <>
                  <p>1. タッチオンタイム管理画面 → 全データ出力 → 日別データ[CSV]</p>
                  <p>2. 186列の大容量ファイルも対応しています（ブラウザ側で解析します）</p>
                </>
              )}
            </div>
          </div>

          <button
            onClick={handleUploadPreview}
            disabled={!file || loading}
            className="w-full py-2 sm:py-3 px-3 sm:px-4 text-xs sm:text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? loadingMsg || "解析中..." : "CSVを解析する"}
          </button>
        </div>
      )}

      {/* ステップ2: カラムマッピング */}
      {step === "mapping" && previewData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-6 space-y-4 sm:space-y-6">
          <div>
            <h2 className="text-sm sm:text-lg font-semibold">カラムマッピング設定</h2>
            <p className="text-xs sm:text-sm text-gray-500">
              {previewData.totalRows}件 | ヘッダー: {previewData.headers.length}列
            </p>
          </div>

          {/* マッピング済みカラム一覧（186列を全部表示すると見づらいので、マッピング対象のみ） */}
          <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
            <div className="text-xs font-medium text-gray-500 mb-2">
              自動検出されたカラム（{Object.values(mapping).filter(Boolean).length}列マッチ / {previewData.headers.length}列中）
            </div>
            <div className="flex flex-wrap gap-1 sm:gap-1.5">
              {Object.entries(mapping).filter(([, v]) => v).map(([sys, col]) => (
                <span key={sys} className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-green-100 text-green-700 rounded border border-green-200 text-xs">
                  {fields.find(f => f.systemField === sys)?.label.replace(" *", "") || sys} → {col}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 sm:gap-4 text-xs font-semibold text-gray-500 px-2">
              <div>システム項目</div>
              <div>CSV列名（対応付け）</div>
            </div>
            {fields.map((f) => (
              <div
                key={f.systemField}
                className={`grid grid-cols-2 gap-2 sm:gap-4 items-center p-2 rounded ${
                  mapping[f.systemField] ? "bg-green-50" : f.label.includes("*") ? "bg-red-50" : "bg-gray-50"
                }`}
              >
                <div className="text-xs sm:text-sm">{f.label}</div>
                <select
                  value={mapping[f.systemField] || ""}
                  onChange={(e) => handleMappingChange(f.systemField, e.target.value)}
                  className="w-full px-1.5 sm:px-2 py-1 sm:py-1.5 border border-gray-300 rounded text-xs sm:text-sm"
                >
                  <option value="">（未設定）</option>
                  {previewData.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {stores.length > 0 && (
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">デフォルト店舗（所属が不明な場合に使用）</label>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg text-xs sm:text-sm"
              >
                <option value="">自動（最初の店舗）</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 sm:gap-3">
            <button onClick={() => setStep("select")} className="px-3 sm:px-6 py-2 sm:py-2.5 border border-gray-300 rounded-lg text-xs sm:text-sm hover:bg-gray-50">
              戻る
            </button>
            <button
              onClick={handleApplyMapping}
              disabled={loading}
              className="flex-1 py-2 sm:py-2.5 px-3 sm:px-4 text-xs sm:text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              マッピングを適用してプレビュー
            </button>
          </div>
        </div>
      )}

      {/* ステップ3: プレビュー */}
      {step === "preview" && previewData && (
        <div className="space-y-3 sm:space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-6">
            <h2 className="text-sm sm:text-lg font-semibold mb-2 sm:mb-4">バリデーション結果</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-3 sm:mb-4">
              <div className="bg-blue-50 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-xl sm:text-2xl font-bold text-blue-700">{previewData.validation.stats.totalRows}</div>
                <div className="text-xs text-blue-600">総行数</div>
              </div>
              <div className="bg-green-50 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-xl sm:text-2xl font-bold text-green-700">{previewData.validation.stats.validRows}</div>
                <div className="text-xs text-green-600">正常</div>
              </div>
              <div className="bg-red-50 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-xl sm:text-2xl font-bold text-red-700">{previewData.validation.stats.errorRows}</div>
                <div className="text-xs text-red-600">エラー</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-xl sm:text-2xl font-bold text-amber-700">{previewData.validation.stats.warningRows}</div>
                <div className="text-xs text-amber-600">警告</div>
              </div>
            </div>

            {previewData.validation.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 sm:p-3 mb-2 sm:mb-3">
                <div className="font-medium text-red-800 text-xs sm:text-sm mb-1">エラー</div>
                <div className="text-xs text-red-700 space-y-0.5 max-h-40 overflow-y-auto">
                  {previewData.validation.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-6">
            <h2 className="text-sm sm:text-lg font-semibold mb-2 sm:mb-4">
              データプレビュー（先頭{previewData.preview.length}件）
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-1.5 sm:px-2 py-1 sm:py-2 text-left font-medium text-gray-500">#</th>
                    {fields.filter(f => mapping[f.systemField]).map(f => (
                      <th key={f.systemField} className="px-1.5 sm:px-2 py-1 sm:py-2 text-left font-medium text-gray-500 whitespace-nowrap">
                        {f.label.replace(" *", "")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.preview.map((row, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-gray-400">{i + 1}</td>
                      {fields.filter(f => mapping[f.systemField]).map(f => (
                        <td key={f.systemField} className="px-1.5 sm:px-2 py-1 sm:py-1.5 whitespace-nowrap">
                          {row[f.systemField] || <span className="text-gray-300">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* インポート進行中の表示 */}
          {loading && importProgress && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 sm:p-5 space-y-2 sm:space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-xs sm:text-sm text-blue-800">インポート実行中...</div>
                <div className="text-xs sm:text-sm text-blue-600 font-mono">{importProgress.pct}%</div>
              </div>
              {/* プログレスバー */}
              <div className="w-full bg-blue-200 rounded-full h-2 sm:h-3 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 sm:h-3 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(importProgress.pct, 2)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-blue-600">
                <span>バッチ {importProgress.batch}/{importProgress.totalBatches}</span>
                <span>{importProgress.processed.toLocaleString()} / {importProgress.total.toLocaleString()} 件</span>
              </div>
              <div className="text-center text-xs sm:text-sm text-blue-700 font-mono tabular-nums">
                経過 {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}
                {importProgress.batch > 1 && (() => {
                  const secPerBatch = elapsedSec / (importProgress.batch - 1);
                  const remaining = Math.round(secPerBatch * (importProgress.totalBatches - importProgress.batch + 1));
                  return ` | 残り約 ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
                })()}
              </div>
            </div>
          )}

          <div className="flex gap-2 sm:gap-3">
            <button onClick={() => setStep("mapping")} disabled={loading} className="px-3 sm:px-6 py-2 sm:py-2.5 border border-gray-300 rounded-lg text-xs sm:text-sm hover:bg-gray-50 disabled:opacity-50">
              マッピングを修正
            </button>
            {!loading && (
              <button
                onClick={handleImport}
                disabled={!previewData.validation.valid}
                className={`flex-1 py-2 sm:py-2.5 px-3 sm:px-4 text-xs sm:text-sm rounded-lg font-medium text-white ${previewData.validation.valid ? "bg-green-600 hover:bg-green-700" : "bg-gray-400 cursor-not-allowed"} disabled:opacity-50`}
              >
                {previewData.validation.valid ? `${previewData.validation.stats.validRows}件をインポート実行` : "エラーを修正してください"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ステップ4: 結果 */}
      {step === "result" && importResult && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-6 space-y-4 sm:space-y-6">
          <div className="text-center">
            <div className="text-4xl sm:text-5xl mb-2 sm:mb-4">{importResult.errors.length === 0 ? "✅" : "⚠️"}</div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">
              インポート{importResult.errors.length === 0 ? "完了" : "完了（一部エラーあり）"}
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            <div className="bg-blue-50 rounded-lg p-2 sm:p-4 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-blue-700">{importResult.total}</div>
              <div className="text-xs sm:text-sm text-blue-600">総件数</div>
            </div>
            <div className="bg-green-50 rounded-lg p-2 sm:p-4 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-green-700">{importResult.created}</div>
              <div className="text-xs sm:text-sm text-green-600">新規登録</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-2 sm:p-4 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-yellow-700">{importResult.updated}</div>
              <div className="text-xs sm:text-sm text-yellow-600">更新</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 sm:p-4 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-gray-700">{importResult.skipped}</div>
              <div className="text-xs sm:text-sm text-gray-600">スキップ</div>
            </div>
          </div>

          {importResult.storesCreated && importResult.storesCreated > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 sm:p-3">
              <div className="text-xs sm:text-sm text-purple-800">
                拠点マスタを <span className="font-bold">{importResult.storesCreated}件</span> 自動作成しました
              </div>
            </div>
          )}

          {importResult.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
              <div className="font-medium text-red-800 text-xs sm:text-sm mb-1 sm:mb-2">エラー詳細</div>
              <div className="text-xs text-red-700 space-y-1 max-h-40 overflow-y-auto">
                {importResult.errors.slice(0, 50).map((e, i) => <div key={i}>{e}</div>)}
                {importResult.errors.length > 50 && <div>...他 {importResult.errors.length - 50} 件</div>}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button onClick={handleReset} className="flex-1 py-2 sm:py-2.5 px-3 sm:px-4 text-xs sm:text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
              別のファイルをインポート
            </button>
            <a
              href={importType === "employees" ? "/employees" : "/attendance/records"}
              className="flex-1 py-2 sm:py-2.5 px-3 sm:px-4 text-xs sm:text-sm border border-gray-300 rounded-lg font-medium text-center hover:bg-gray-50"
            >
              {importType === "employees" ? "従業員一覧を確認" : "勤怠実績を確認"}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

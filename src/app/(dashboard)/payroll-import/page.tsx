"use client";

import { useState, useRef, useMemo } from "react";

// ============================================================
// 給与奉行連携 画面
// - 給与奉行からCSVファイルを直接アップロード
// - Shift-JIS→UTF-8 自動変換
// - ドライラン→本番取込の2段階
// ============================================================

type ImportResult = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  dryRun?: boolean;
  errors: Array<{ row: number; code: string; message: string }>;
  storesMissing?: string[];
  summary?: {
    totalPayment: number;
    totalLaborCost: number;
    totalSocialInsurance: number;
  };
};

type Tab = "employee" | "payroll" | "fix";

type FixDiagnosis = {
  totalNullLaborCostRecords: number;
  byStoreMonth: Record<string, number>;
  employeeWageStatus: {
    withHourlyWage: number;
    withoutHourlyWage: number;
  };
};

type FixResult = {
  totalNullRecords: number;
  fixed: number;
  skipped: number;
  errors: number;
  employeesWithWage: number;
};

// Shift-JISファイルをUTF-8テキストに変換
async function readFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  // まずShift-JIS (CP932) で試行
  const decoder = new TextDecoder("shift_jis");
  const text = decoder.decode(buffer);
  // 文字化けチェック（日本語が含まれているか）
  if (text.includes("社員") || text.includes("氏名") || text.includes("所属")) {
    return text;
  }
  // UTF-8で再試行
  const utf8Decoder = new TextDecoder("utf-8");
  return utf8Decoder.decode(buffer);
}

function formatCurrency(val: number): string {
  if (val >= 10000) return `${Math.round(val / 10000).toLocaleString()}万円`;
  return `${val.toLocaleString()}円`;
}

// ============================================================
// 従業員マスタ取込パネル
// ============================================================
function EmployeeImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [rowCount, setRowCount] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"upload" | "ready" | "done">("upload");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await readFileAsText(file);
    setCsvText(text);
    const lines = text.trim().split("\n").length - 1; // ヘッダー除く
    setRowCount(lines);
    setStep("ready");
    setResult(null);
  };

  const handleImport = async (dryRun: boolean) => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/employees/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText, dryRun }),
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
        if (!dryRun && json.data.errors.length === 0) setStep("done");
      } else {
        setResult({
          total: 0, created: 0, updated: 0, skipped: 0,
          errors: [{ row: 0, code: "", message: json.error }],
        });
      }
    } catch {
      setResult({
        total: 0, created: 0, updated: 0, skipped: 0,
        errors: [{ row: 0, code: "", message: "通信エラー" }],
      });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFileName("");
    setCsvText("");
    setRowCount(0);
    setResult(null);
    setStep("upload");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-4 text-sm">
        <p className="font-semibold text-gray-700 mb-2">給与奉行からの出力手順</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-600 text-xs">
          <li>随時処理 → 6.汎用データ作成 → 2.社員情報データ作成</li>
          <li>パターン「社員情報データ（退職者を除く）」を選択 → OK</li>
          <li>出力されたCSVファイルをそのままアップロード</li>
        </ol>
      </div>

      {step === "upload" && (
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.CSV,.txt"
            onChange={handleFile}
            className="hidden"
            id="emp-file"
          />
          <label
            htmlFor="emp-file"
            className="cursor-pointer inline-flex flex-col items-center gap-2"
          >
            <span className="text-4xl">📄</span>
            <span className="text-sm font-medium text-gray-700">
              社員マスタCSVファイルを選択
            </span>
            <span className="text-xs text-gray-400">
              給与奉行から出力したCSV（Shift-JIS対応）
            </span>
          </label>
        </div>
      )}

      {step === "ready" && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">
                📄 {fileName}
              </p>
              <p className="text-xs text-gray-500">{rowCount}名分のデータ</p>
            </div>
            <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600">
              ファイルを変更
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleImport(true)}
              disabled={loading}
              className="flex-1 bg-amber-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
            >
              {loading ? "検証中..." : "① 検証（ドライラン）"}
            </button>
            <button
              onClick={() => handleImport(false)}
              disabled={loading}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "取込中..." : "② 本番取込"}
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-lg font-semibold text-gray-900">従業員マスタ取込完了</p>
          <button onClick={reset} className="mt-4 bg-gray-800 text-white rounded-lg px-5 py-2 text-sm hover:bg-gray-900">
            続けて取込
          </button>
        </div>
      )}

      {result && <ImportResultPanel result={result} />}
    </div>
  );
}

// ============================================================
// 給与実績取込パネル
// ============================================================
function PayrollImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [rowCount, setRowCount] = useState(0);
  const [yearMonth, setYearMonth] = useState(() => {
    const now = new Date();
    // 前月をデフォルトに（給与は前月分を取込むケースが多い）
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  });

  // 年月ドロップダウン用の選択肢（過去24ヶ月〜当月）
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i <= 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
      opts.push({ value: val, label });
    }
    return opts;
  }, []);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"upload" | "ready" | "done">("upload");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await readFileAsText(file);
    setCsvText(text);
    const lines = text.trim().split("\n").length - 1;
    setRowCount(lines);
    setStep("ready");
    setResult(null);
  };

  const handleImport = async (dryRun: boolean) => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/payroll/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText, yearMonth, dryRun }),
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
        if (!dryRun && json.data.errors.length === 0) setStep("done");
      } else {
        setResult({
          total: 0, created: 0, updated: 0, skipped: 0,
          errors: [{ row: 0, code: "", message: json.error }],
        });
      }
    } catch {
      setResult({
        total: 0, created: 0, updated: 0, skipped: 0,
        errors: [{ row: 0, code: "", message: "通信エラー" }],
      });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFileName("");
    setCsvText("");
    setRowCount(0);
    setResult(null);
    setStep("upload");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-4 text-sm">
        <p className="font-semibold text-gray-700 mb-2">給与奉行からの出力手順</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-600 text-xs">
          <li>随時処理 → 6.汎用データ作成 → 3.給与賞与データ作成</li>
          <li>対象月の給与データパターンを選択 → OK</li>
          <li>出力されたCSVファイルと対象年月を指定してアップロード</li>
        </ol>
      </div>

      {step === "upload" && (
        <>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">対象年月：</label>
            <select
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {monthOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.CSV,.txt"
              onChange={handleFile}
              className="hidden"
              id="payroll-file"
            />
            <label
              htmlFor="payroll-file"
              className="cursor-pointer inline-flex flex-col items-center gap-2"
            >
              <span className="text-4xl">💰</span>
              <span className="text-sm font-medium text-gray-700">
                給与実績CSVファイルを選択
              </span>
              <span className="text-xs text-gray-400">
                給与奉行から出力したCSV（Shift-JIS対応）
              </span>
            </label>
          </div>
        </>
      )}

      {step === "ready" && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">
                💰 {fileName}
              </p>
              <p className="text-xs text-gray-500">
                {rowCount}名分 ／ 対象年月: {yearMonth}
              </p>
            </div>
            <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600">
              やり直す
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleImport(true)}
              disabled={loading}
              className="flex-1 bg-amber-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
            >
              {loading ? "検証中..." : "① 検証（ドライラン）"}
            </button>
            <button
              onClick={() => handleImport(false)}
              disabled={loading}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "取込中..." : "② 本番取込"}
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-lg font-semibold text-gray-900">給与実績取込完了</p>
          <button onClick={reset} className="mt-4 bg-gray-800 text-white rounded-lg px-5 py-2 text-sm hover:bg-gray-900">
            続けて取込
          </button>
        </div>
      )}

      {result && <ImportResultPanel result={result} />}
    </div>
  );
}

// ============================================================
// 取込結果表示
// ============================================================
function ImportResultPanel({ result }: { result: ImportResult }) {
  return (
    <div className="bg-white rounded-lg border p-2 sm:p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-gray-700">
        {result.dryRun ? "🔍 検証結果（まだ取込していません）" : "📊 取込結果"}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-center">
        <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
          <div className="text-lg sm:text-xl font-bold">{result.total}</div>
          <div className="text-xs text-gray-500">合計</div>
        </div>
        <div className="bg-green-50 rounded-lg p-2 sm:p-3">
          <div className="text-lg sm:text-xl font-bold text-green-700">{result.created}</div>
          <div className="text-xs text-gray-500">新規</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-2 sm:p-3">
          <div className="text-lg sm:text-xl font-bold text-blue-700">{result.updated}</div>
          <div className="text-xs text-gray-500">更新</div>
        </div>
        <div className="bg-red-50 rounded-lg p-2 sm:p-3">
          <div className="text-lg sm:text-xl font-bold text-red-700">{result.skipped}</div>
          <div className="text-xs text-gray-500">スキップ</div>
        </div>
      </div>

      {/* 給与集計サマリ */}
      {result.summary && (
        <div className="bg-blue-50 rounded-lg p-2 sm:p-3 text-xs sm:text-sm">
          <p className="font-semibold text-blue-800 mb-1">集計サマリ</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-2 text-xs">
            <div>
              <span className="text-blue-600">支給総額合計:</span>
              <span className="font-medium ml-1">{formatCurrency(result.summary.totalPayment)}</span>
            </div>
            <div>
              <span className="text-blue-600">社保概算:</span>
              <span className="font-medium ml-1">{formatCurrency(result.summary.totalSocialInsurance)}</span>
            </div>
            <div>
              <span className="text-blue-600">総人件費:</span>
              <span className="font-bold ml-1">{formatCurrency(result.summary.totalLaborCost)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 店舗自動作成 */}
      {result.storesMissing && result.storesMissing.length > 0 && (
        <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-800">
          <p className="font-semibold mb-1">未登録の所属（自動作成{result.dryRun ? "予定" : "済み"}）:</p>
          <p>{result.storesMissing.join("、")}</p>
        </div>
      )}

      {result.errors.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-600 mb-1">
            注意事項（{result.errors.length}件）:
          </p>
          <div className="max-h-40 overflow-y-auto text-xs space-y-1">
            {result.errors.slice(0, 50).map((e, i) => (
              <div key={i} className="bg-red-50 px-3 py-1.5 rounded text-red-700">
                行{e.row}: [{e.code}] {e.message}
              </div>
            ))}
            {result.errors.length > 50 && (
              <div className="text-gray-500 px-3">...他{result.errors.length - 50}件</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 人件費データ修復パネル
// ============================================================
function LaborCostFixPanel() {
  const [diagnosis, setDiagnosis] = useState<FixDiagnosis | null>(null);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);

  const runDiagnosis = async () => {
    setDiagLoading(true);
    try {
      const res = await fetch("/api/attendance/fix-labor-cost");
      const json = await res.json();
      if (json.success) setDiagnosis(json.data);
    } catch {
      // ignore
    } finally {
      setDiagLoading(false);
    }
  };

  const [error, setError] = useState<string | null>(null);

  const runFix = async () => {
    if (!confirm("人件費データを一括修復します。よろしいですか？")) return;
    setLoading(true);
    setFixResult(null);
    setError(null);
    try {
      const res = await fetch("/api/attendance/fix-labor-cost", { method: "POST" });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { setError(`レスポンス解析エラー: ${text.substring(0, 200)}`); return; }
      if (json.success) {
        setFixResult(json.data);
        // 修復後に再診断
        await runDiagnosis();
      } else {
        setError(`APIエラー: ${json.error || JSON.stringify(json)}`);
      }
    } catch (e) {
      setError(`通信エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-4 text-sm">
        <p className="font-semibold text-gray-700 mb-2">人件費データ修復とは？</p>
        <p className="text-xs text-gray-600">
          勤怠レコードの人件費（laborCost）が未計算のまま残っている場合に、
          従業員マスタの時給（hourlyWage）から一括再計算します。
          従業員マスタ取込を実行した後にお使いください。
        </p>
      </div>

      {/* 診断ボタン */}
      <button
        onClick={runDiagnosis}
        disabled={diagLoading}
        className="w-full bg-gray-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        {diagLoading ? "診断中..." : "① 現状を診断する"}
      </button>

      {/* 診断結果 */}
      {diagnosis && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-xl font-bold text-red-700">
                {diagnosis.totalNullLaborCostRecords.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">未計算レコード</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-xl font-bold text-green-700">
                {diagnosis.employeeWageStatus.withHourlyWage}
              </div>
              <div className="text-xs text-gray-500">時給設定済み</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="text-xl font-bold text-amber-700">
                {diagnosis.employeeWageStatus.withoutHourlyWage}
              </div>
              <div className="text-xs text-gray-500">時給未設定</div>
            </div>
          </div>

          {/* 店舗×月の内訳 */}
          {Object.keys(diagnosis.byStoreMonth).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">未計算レコードの内訳（店舗×月）</p>
              <div className="max-h-48 overflow-y-auto text-xs space-y-1">
                {Object.entries(diagnosis.byStoreMonth).map(([key, count]) => {
                  const [store, month] = key.split("|");
                  return (
                    <div key={key} className="flex justify-between bg-gray-50 px-3 py-1.5 rounded">
                      <span className="text-gray-700">{store} / {month}</span>
                      <span className="font-medium text-red-600">{count}件</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {diagnosis.totalNullLaborCostRecords > 0 && (
            <button
              onClick={runFix}
              disabled={loading}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "修復中..." : `② 一括修復する（${diagnosis.totalNullLaborCostRecords}件）`}
            </button>
          )}

          {diagnosis.totalNullLaborCostRecords === 0 && (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm text-green-700 font-medium">すべてのレコードに人件費が計算済みです</p>
            </div>
          )}
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 rounded-lg border border-red-200 p-4 text-sm text-red-800">
          <p className="font-semibold mb-1">エラー</p>
          <p className="text-xs break-all">{error}</p>
        </div>
      )}

      {/* 修復結果 */}
      {fixResult && (
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <p className="font-semibold text-green-800 text-sm mb-2">修復完了</p>
          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div>
              <div className="text-lg font-bold text-green-700">{fixResult.fixed}</div>
              <div className="text-gray-500">修復済み</div>
            </div>
            <div>
              <div className="text-lg font-bold text-amber-600">{fixResult.skipped}</div>
              <div className="text-gray-500">スキップ</div>
            </div>
            <div>
              <div className="text-lg font-bold text-red-600">{fixResult.errors}</div>
              <div className="text-gray-500">エラー</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// メインページ
// ============================================================
export default function PayrollImportPage() {
  const [tab, setTab] = useState<Tab>("employee");

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">給与奉行連携</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          給与奉行から出力したCSVファイルをそのままアップロード
        </p>
      </div>

      {/* タブ */}
      <div className="flex overflow-x-auto border-b border-gray-200">
        {[
          { key: "employee" as const, label: "① 従業員マスタ取込", icon: "👥" },
          { key: "payroll" as const, label: "② 給与実績取込", icon: "💰" },
          { key: "fix" as const, label: "③ 人件費修復", icon: "🔧" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1 sm:gap-2 whitespace-nowrap ${
              tab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* 注意事項 */}
      {tab !== "fix" && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 sm:p-4 text-xs sm:text-sm text-blue-800">
          <p className="font-semibold mb-1 text-sm">
            {tab === "employee" ? "Step 1: まず従業員マスタを取込" : "Step 2: 次に給与実績を取込"}
          </p>
          <p className="text-xs text-blue-600">
            {tab === "employee"
              ? "給与奉行の汎用データ出力で社員情報CSVを出力し、そのままアップロードしてください。Shift-JIS（日本語文字コード）は自動変換されます。"
              : "給与実績の取込には、先に従業員マスタが登録されている必要があります。対象年月を確認してからアップロードしてください。"}
          </p>
        </div>
      )}

      {tab === "employee" && <EmployeeImportPanel />}
      {tab === "payroll" && <PayrollImportPanel />}
      {tab === "fix" && <LaborCostFixPanel />}
    </div>
  );
}

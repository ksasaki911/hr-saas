// =============================================================
// 汎用CSVパーサー（Shift-JIS / UTF-8 対応）
// タッチオンタイム等の日本語CSVをパース
// =============================================================

/**
 * CSVパース結果
 */
export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  encoding: string;
}

/**
 * CSVテキストをパースする（ダブルクォート・改行対応）
 */
export function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(field.trim());
        field = "";
      } else if (ch === "\r" && next === "\n") {
        current.push(field.trim());
        if (current.some((c) => c !== "")) {
          lines.push(current);
        }
        current = [];
        field = "";
        i++; // skip \n
      } else if (ch === "\n") {
        current.push(field.trim());
        if (current.some((c) => c !== "")) {
          lines.push(current);
        }
        current = [];
        field = "";
      } else {
        field += ch;
      }
    }
  }

  // 最後の行
  if (field || current.length > 0) {
    current.push(field.trim());
    if (current.some((c) => c !== "")) {
      lines.push(current);
    }
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0];
  const rows = lines.slice(1);

  return { headers, rows };
}

/**
 * ArrayBuffer からテキストにデコード（Shift-JIS / UTF-8 自動判別）
 */
export function decodeBuffer(buffer: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buffer);

  // BOM check
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(buffer), encoding: "UTF-8 (BOM)" };
  }

  // Try UTF-8 first
  try {
    const utf8Text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    // Heuristic: if no replacement characters and has Japanese, it's UTF-8
    if (!utf8Text.includes("\ufffd")) {
      return { text: utf8Text, encoding: "UTF-8" };
    }
  } catch {
    // Not valid UTF-8
  }

  // Try Windows-31J (cp932, superset of Shift-JIS - common in Japanese business systems like Touch On Time)
  // Note: TextDecoder does not support "cp932" directly, but "shift-jis" in most browsers
  // handles the Windows-31J superset characters. We try multiple labels.
  for (const encoding of ["shift-jis", "euc-jp"]) {
    try {
      const text = new TextDecoder(encoding, { fatal: false }).decode(buffer);
      // Check if the decoded text looks valid (has reasonable Japanese chars, no excessive replacement chars)
      const replacementCount = (text.match(/\ufffd/g) || []).length;
      if (replacementCount < text.length * 0.01) { // Less than 1% replacement chars
        const encLabel = encoding === "shift-jis" ? "Shift-JIS (cp932)" : "EUC-JP";
        return { text, encoding: encLabel };
      }
    } catch {
      continue;
    }
  }

  // Final fallback to UTF-8 with replacement
  return { text: new TextDecoder("utf-8").decode(buffer), encoding: "UTF-8 (fallback)" };
}

/**
 * CSVバッファをパースしてオブジェクト配列に変換
 * ※同名ヘッダーがある場合、最初に出現したカラムを優先（後のカラムには連番サフィックス付与）
 */
export function parseCsvBuffer(buffer: ArrayBuffer): CsvParseResult {
  const { text, encoding } = decodeBuffer(buffer);
  const { headers: rawHeaders, rows } = parseCsvText(text);

  // 同名ヘッダーの重複対処: 2回目以降は "_2", "_3" を付与
  const headerCount: Record<string, number> = {};
  const headers = rawHeaders.map((h) => {
    if (!headerCount[h]) {
      headerCount[h] = 1;
      return h;
    }
    headerCount[h]++;
    return `${h}_${headerCount[h]}`;
  });

  const records = rows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = row[i] || "";
    });
    return record;
  });

  return {
    headers,
    rows: records,
    totalRows: records.length,
    encoding,
  };
}

/**
 * カラムマッピングを適用してレコードを変換
 */
export function applyColumnMapping(
  rows: Record<string, string>[],
  mapping: Record<string, string | null>
): Record<string, string | null>[] {
  return rows.map((row) => {
    const mapped: Record<string, string | null> = {};
    for (const [systemField, csvColumn] of Object.entries(mapping)) {
      if (csvColumn && row[csvColumn] !== undefined) {
        mapped[systemField] = row[csvColumn] || null;
      } else {
        mapped[systemField] = null;
      }
    }
    return mapped;
  });
}

/**
 * ヘッダー名から自動マッピングを推測
 * 優先順位: 1.完全一致 → 2.部分一致（パターンがヘッダーに含まれる）
 * ※既に別フィールドに割り当て済みのヘッダーは再利用しない
 */
export function autoDetectMapping(
  csvHeaders: string[],
  presets: { systemField: string; patterns: string[] }[]
): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const usedHeaders = new Set<string>();

  for (const preset of presets) {
    let matched: string | null = null;

    // Pass 1: 完全一致
    for (const pattern of preset.patterns) {
      const found = csvHeaders.find((h) => h === pattern && !usedHeaders.has(h));
      if (found) {
        matched = found;
        break;
      }
    }

    // Pass 2: 部分一致（パターンの先頭からマッチ or ヘッダーに含まれる）
    if (!matched) {
      for (const pattern of preset.patterns) {
        const found = csvHeaders.find(
          (h) => !usedHeaders.has(h) && (h.startsWith(pattern) || h.includes(pattern))
        );
        if (found) {
          matched = found;
          break;
        }
      }
    }

    mapping[preset.systemField] = matched;
    if (matched) usedHeaders.add(matched);
  }

  return mapping;
}

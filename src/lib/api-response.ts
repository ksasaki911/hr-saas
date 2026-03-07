// =============================================================
// API レスポンスヘルパー
// 統一的なJSONレスポンス形式を提供する
// =============================================================
import { NextResponse } from "next/server";
import type { ZodError } from "zod";

// 成功レスポンス
export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

// エラーレスポンス
export function apiError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

// Zodバリデーションエラー
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function apiValidationError(error: ZodError<any>) {
  const details = error.issues.map((e) => ({
    field: e.path.join("."),
    message: e.message,
  }));
  return NextResponse.json(
    { success: false, error: "バリデーションエラー", details },
    { status: 400 }
  );
}

// ページネーション付きレスポンス
export function apiPaginated<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  return NextResponse.json({
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}

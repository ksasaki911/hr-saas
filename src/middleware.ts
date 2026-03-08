// =============================================================
// Next.js Middleware - マルチテナント解決 + 認証チェック
// =============================================================
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- 認証不要パス ---
  const publicPaths = ["/login", "/api/auth", "/api/admin/setup-users"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (isPublic) {
    return NextResponse.next();
  }

  // --- JWT トークンの検証 ---
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET || "dev-secret-change-in-production",
  });

  // 未認証 → ログインページへリダイレクト（画面）or 401（API）
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "認証が必要です" },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // --- 認証済み: テナントIDとユーザー情報をヘッダーに注入 ---
  const response = NextResponse.next();

  // テナントID（JWTから取得）
  if (token.tenantId) {
    response.headers.set("x-tenant-id", token.tenantId as string);
  } else {
    // フォールバック: ローカル開発用
    const defaultTenant = process.env.DEFAULT_TENANT_ID;
    if (defaultTenant) {
      response.headers.set("x-tenant-id", defaultTenant);
    }
  }

  // ユーザー情報ヘッダー
  response.headers.set("x-user-id", token.userId as string);
  response.headers.set("x-user-role", token.role as string);
  if (token.storeId) {
    response.headers.set("x-user-store-id", token.storeId as string);
  }

  return response;
}

export const config = {
  matcher: [
    // API routes と ダッシュボード画面に適用
    "/api/:path*",
    "/(dashboard)/:path*",
    "/shifts/:path*",
    "/employees/:path*",
  ],
};

// =============================================================
// Next.js Middleware - マルチテナント解決
// 全リクエストでテナントIDをヘッダーに注入する
// =============================================================
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // 既にX-Tenant-IDヘッダーがある場合（開発時の手動指定）
  const existingTenantId = request.headers.get("x-tenant-id");
  if (existingTenantId) {
    response.headers.set("x-tenant-id", existingTenantId);
    return response;
  }

  // サブドメインからテナント解決
  const host = request.headers.get("host") || "";
  const subdomain = host.split(".")[0];

  // ローカル開発時はデフォルトテナントを使用
  if (subdomain === "localhost" || subdomain === "127") {
    const defaultTenant = process.env.DEFAULT_TENANT_ID;
    if (defaultTenant) {
      response.headers.set("x-tenant-id", defaultTenant);
    }
    return response;
  }

  // サブドメインをテナント識別子としてヘッダーに注入
  if (subdomain && subdomain !== "www") {
    response.headers.set("x-tenant-subdomain", subdomain);
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

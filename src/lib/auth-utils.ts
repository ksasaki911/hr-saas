// =============================================================
// 認証ユーティリティ
// セッションからユーザー情報を取得し、権限チェックを行う
// =============================================================
import { getServerSession } from "next-auth";
import { authOptions, type SessionUser } from "./auth";

// ロールの階層順（上ほど権限が高い）
const ROLE_HIERARCHY = [
  "SYSTEM_ADMIN",
  "TENANT_ADMIN",
  "AREA_MANAGER",
  "STORE_MANAGER",
  "ASSISTANT_MANAGER",
  "STORE_STAFF",
] as const;

export type UserRole = (typeof ROLE_HIERARCHY)[number];

export interface CurrentUser {
  userId: string;
  email: string;
  name: string;
  tenantId: string;
  role: UserRole;
  storeId: string | null; // null = 本部（全店舗アクセス可能）
  employeeId: string | null;
}

/**
 * サーバーサイドで現在のログインユーザー情報を取得
 * 未認証の場合は null を返す
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const u = session.user as SessionUser;
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    tenantId: u.tenantId,
    role: u.role as UserRole,
    storeId: u.storeId,
    employeeId: u.employeeId,
  };
}

/**
 * ユーザーが指定された最低ロール以上の権限を持っているか
 */
export function hasMinRole(user: CurrentUser, minRole: UserRole): boolean {
  const userIdx = ROLE_HIERARCHY.indexOf(user.role);
  const minIdx = ROLE_HIERARCHY.indexOf(minRole);
  if (userIdx === -1 || minIdx === -1) return false;
  return userIdx <= minIdx; // 配列の上の方が権限が高い
}

/**
 * ユーザーが特定の店舗にアクセスできるか
 * 本部ユーザー（TENANT_ADMIN, SYSTEM_ADMIN）は全店舗アクセス可
 * 店舗ユーザーは自店舗のみ
 */
export function canAccessStore(user: CurrentUser, targetStoreId: string): boolean {
  // 本部レベルは全店舗アクセス可
  if (user.role === "SYSTEM_ADMIN" || user.role === "TENANT_ADMIN") return true;
  // AREA_MANAGERは将来的に担当店舗リストで判定（現時点では全店舗）
  if (user.role === "AREA_MANAGER") return true;
  // 店舗ユーザーは自店舗のみ
  return user.storeId === targetStoreId;
}

/**
 * ユーザーが本部レベル（全店舗閲覧可能）かどうか
 */
export function isHqUser(user: CurrentUser): boolean {
  return hasMinRole(user, "AREA_MANAGER");
}

/**
 * APIルートで使える認証チェック + 店舗スコープ解決
 * 戻り値: { user, effectiveStoreId } または Response（エラー時）
 */
export async function requireAuth(requestedStoreId?: string | null): Promise<
  | { user: CurrentUser; effectiveStoreId: string | null; error?: never }
  | { error: Response; user?: never; effectiveStoreId?: never }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: Response.json(
        { success: false, error: "認証が必要です" },
        { status: 401 }
      ),
    };
  }

  // 店舗ユーザーの場合、自店舗を強制
  let effectiveStoreId = requestedStoreId || null;
  if (user.storeId) {
    // 他店舗へのアクセスをブロック
    if (requestedStoreId && requestedStoreId !== user.storeId) {
      return {
        error: Response.json(
          { success: false, error: "この店舗へのアクセス権がありません" },
          { status: 403 }
        ),
      };
    }
    // 店舗ユーザーは常に自店舗に固定
    effectiveStoreId = user.storeId;
  }

  return { user, effectiveStoreId };
}

/**
 * 特定ロール以上を要求するAPIガード
 */
export async function requireRole(minRole: UserRole): Promise<
  | { user: CurrentUser; error?: never }
  | { error: Response; user?: never }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: Response.json(
        { success: false, error: "認証が必要です" },
        { status: 401 }
      ),
    };
  }

  if (!hasMinRole(user, minRole)) {
    return {
      error: Response.json(
        { success: false, error: "この操作を行う権限がありません" },
        { status: 403 }
      ),
    };
  }

  return { user };
}

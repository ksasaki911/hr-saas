// =============================================================
// ダッシュボードレイアウト（サイドバー + メインコンテンツ）
// ロールに応じたナビゲーション制御
// =============================================================
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions, type SessionUser } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
import { MobileMenuButton } from "@/components/MobileMenuButton";

// ロール別のナビゲーション定義
// minRole: このセクション/項目を表示する最低ロール
type NavItem = {
  href: string;
  label: string;
  icon: string;
  minRole?: string; // 省略時は全ロール表示
};

type NavSection = {
  title: string;
  items: NavItem[];
  minRole?: string;
};

const navSections: NavSection[] = [
  {
    title: "ダッシュボード",
    items: [
      { href: "/dashboard", label: "本部ダッシュボード", icon: "📊", minRole: "AREA_MANAGER" },
      { href: "/store-dashboard", label: "店舗ダッシュボード", icon: "🏪" },
    ],
  },
  {
    title: "シフト管理",
    items: [
      { href: "/shifts", label: "シフト管理", icon: "📅", minRole: "ASSISTANT_MANAGER" },
      { href: "/shift-requests", label: "シフト希望", icon: "📋" },
      { href: "/staffing", label: "必要人員設定", icon: "⚙️", minRole: "STORE_MANAGER" },
      { href: "/hq-support", label: "本部応援", icon: "🏢", minRole: "AREA_MANAGER" },
    ],
  },
  {
    title: "勤怠管理",
    items: [
      { href: "/attendance", label: "打刻", icon: "⏱️" },
      { href: "/attendance/records", label: "勤怠実績", icon: "📊", minRole: "ASSISTANT_MANAGER" },
      { href: "/attendance/monthly", label: "月次集計", icon: "📈", minRole: "STORE_MANAGER" },
      { href: "/leave-requests", label: "休暇管理", icon: "🏖️" },
    ],
  },
  {
    title: "レポート",
    minRole: "STORE_MANAGER",
    items: [
      { href: "/labor-analysis", label: "人件費分析", icon: "💰" },
      { href: "/sales-input", label: "売上入力", icon: "💹" },
    ],
  },
  {
    title: "データ連携",
    minRole: "STORE_MANAGER",
    items: [
      { href: "/payroll-import", label: "給与奉行連携", icon: "🔗", minRole: "STORE_MANAGER" },
      { href: "/import", label: "CSVインポート", icon: "📥" },
    ],
  },
  {
    title: "マスタ",
    minRole: "ASSISTANT_MANAGER",
    items: [
      { href: "/employees", label: "従業員一覧", icon: "👥" },
      { href: "/department-skills", label: "部門スキル要件", icon: "🎯", minRole: "STORE_MANAGER" },
      { href: "/employment-rules", label: "就業規則", icon: "📜", minRole: "TENANT_ADMIN" },
      { href: "/company-calendar", label: "会社カレンダー", icon: "📆", minRole: "STORE_MANAGER" },
      { href: "/attendance-profile", label: "出勤パターン分析", icon: "🔍", minRole: "STORE_MANAGER" },
    ],
  },
];

// ロール階層チェック
const ROLE_HIERARCHY = [
  "SYSTEM_ADMIN",
  "TENANT_ADMIN",
  "AREA_MANAGER",
  "STORE_MANAGER",
  "ASSISTANT_MANAGER",
  "STORE_STAFF",
];

function hasMinRole(userRole: string, minRole: string): boolean {
  const userIdx = ROLE_HIERARCHY.indexOf(userRole);
  const minIdx = ROLE_HIERARCHY.indexOf(minRole);
  if (userIdx === -1 || minIdx === -1) return false;
  return userIdx <= minIdx;
}

// ロールの日本語表示
const ROLE_LABELS: Record<string, string> = {
  SYSTEM_ADMIN: "システム管理者",
  TENANT_ADMIN: "本部管理者",
  AREA_MANAGER: "エリアマネージャー",
  STORE_MANAGER: "店長",
  ASSISTANT_MANAGER: "副店長",
  STORE_STAFF: "スタッフ",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;
  const userRole = user?.role || "STORE_STAFF";

  // ロールに応じたナビゲーションフィルタ
  const filteredSections = navSections
    .filter((section) => !section.minRole || hasMinRole(userRole, section.minRole))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.minRole || hasMinRole(userRole, item.minRole)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="min-h-screen flex bg-gray-50">
      <MobileMenuButton />

      {/* サイドバー - モバイルではスライドイン */}
      <aside
        id="sidebar"
        className="fixed md:static inset-y-0 left-0 z-40 w-64 bg-slate-800 text-white flex flex-col transform -translate-x-full md:translate-x-0 transition-transform duration-200 ease-in-out"
      >
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-lg font-bold">HR SaaS</h1>
          <p className="text-xs text-slate-400 mt-1">シフト管理システム</p>
        </div>
        <nav className="flex-1 p-2 space-y-4 overflow-y-auto">
          {filteredSections.map((section) => (
            <div key={section.title}>
              <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {section.title}
              </div>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* ユーザー情報 + ログアウト */}
        <div className="p-4 border-t border-slate-700">
          {user ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold">
                  {user.name?.charAt(0) || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user.name}</p>
                  <p className="text-[10px] text-slate-400">{ROLE_LABELS[userRole] || userRole}</p>
                </div>
              </div>
              <LogoutButton />
            </div>
          ) : (
            <p className="text-xs text-slate-500">未ログイン</p>
          )}
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-auto w-full">
        <div className="p-3 pt-14 md:p-6 md:pt-6">{children}</div>
      </main>
    </div>
  );
}

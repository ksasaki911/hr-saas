// =============================================================
// ダッシュボードレイアウト（サイドバー + メインコンテンツ）
// =============================================================
import Link from "next/link";

const navSections = [
  {
    title: "ダッシュボード",
    items: [
      { href: "/dashboard", label: "本部ダッシュボード", icon: "📊" },
      { href: "/store-dashboard", label: "店舗ダッシュボード", icon: "🏪" },
    ],
  },
  {
    title: "シフト管理",
    items: [
      { href: "/shifts", label: "シフト管理", icon: "📅" },
      { href: "/shift-requests", label: "シフト希望", icon: "📋" },
      { href: "/staffing", label: "必要人員設定", icon: "⚙️" },
      { href: "/hq-support", label: "本部応援", icon: "🏢" },
    ],
  },
  {
    title: "勤怠管理",
    items: [
      { href: "/attendance", label: "打刻", icon: "⏱️" },
      { href: "/attendance/records", label: "勤怠実績", icon: "📊" },
      { href: "/attendance/monthly", label: "月次集計", icon: "📈" },
      { href: "/leave-requests", label: "休暇管理", icon: "🏖️" },
    ],
  },
  {
    title: "データ連携",
    items: [
      { href: "/import", label: "CSVインポート", icon: "📥" },
    ],
  },
  {
    title: "マスタ",
    items: [
      { href: "/employees", label: "従業員一覧", icon: "👥" },
      { href: "/department-skills", label: "部門スキル要件", icon: "🎯" },
      { href: "/employment-rules", label: "就業規則", icon: "📜" },
      { href: "/company-calendar", label: "会社カレンダー", icon: "📆" },
      { href: "/attendance-profile", label: "出勤パターン分析", icon: "🔍" },
    ],
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* サイドバー */}
      <aside className="w-64 bg-slate-800 text-white flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-lg font-bold">HR SaaS</h1>
          <p className="text-xs text-slate-400 mt-1">シフト管理システム</p>
        </div>
        <nav className="flex-1 p-2 space-y-4">
          {navSections.map((section) => (
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
        <div className="p-4 border-t border-slate-700 text-xs text-slate-500">
          Phase 1-4 - シフト・勤怠・スキル・データ連携
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="w-full px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors text-left"
    >
      ログアウト
    </button>
  );
}

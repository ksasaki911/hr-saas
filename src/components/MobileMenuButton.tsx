"use client";

import { useState, useEffect } from "react";

export function MobileMenuButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    if (sidebar) {
      if (open) {
        sidebar.classList.remove("-translate-x-full");
        sidebar.classList.add("translate-x-0");
      } else {
        sidebar.classList.remove("translate-x-0");
        sidebar.classList.add("-translate-x-full");
      }
    }
    if (overlay) {
      overlay.style.display = open ? "block" : "none";
    }
  }, [open]);

  // Close on route change
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("#sidebar a")) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <>
      {/* ハンバーガーボタン */}
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 bg-slate-800 text-white rounded-lg shadow-lg"
        aria-label="メニュー"
      >
        {open ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* オーバーレイ */}
      <div
        id="sidebar-overlay"
        className="fixed inset-0 bg-black/50 z-30 md:hidden"
        style={{ display: "none" }}
        onClick={() => setOpen(false)}
      />
    </>
  );
}

import type { Metadata } from "next";
import { SessionProvider } from "@/components/SessionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "HR SaaS - シフト管理システム",
  description: "マルエーうちや シフト・勤怠管理システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased font-sans">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}

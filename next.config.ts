import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CSVインポートで大容量ファイル（タッチオンタイム日別データ: 18MB超）を扱うため
  serverExternalPackages: [],
  typescript: {
    // 型エラーはCI/lintで検出する。ビルドはブロックしない
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;

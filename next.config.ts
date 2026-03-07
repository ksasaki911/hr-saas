import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CSVインポートで大容量ファイル（タッチオンタイム日別データ: 18MB超）を扱うため
  serverExternalPackages: [],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;

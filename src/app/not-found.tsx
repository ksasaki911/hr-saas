import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">ページが見つかりません</h2>
        <p className="text-gray-500 mb-6">お探しのページは存在しないか、移動した可能性があります。</p>
        <Link
          href="/dashboard"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-block"
        >
          ダッシュボードに戻る
        </Link>
      </div>
    </div>
  );
}

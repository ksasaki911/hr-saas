"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-bold text-red-600 mb-2">エラーが発生しました</h2>
        <p className="text-gray-500 mb-4">{error.message || "予期しないエラーです"}</p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          再試行
        </button>
      </div>
    </div>
  );
}

// =============================================================
// 必要人員設定画面
// =============================================================
"use client";

import { useState, useEffect, useCallback } from "react";

interface StaffingRequirement {
  id: string;
  departmentId: string;
  dayOfWeek: number;
  timeSlot: string;
  minStaff: number;
  idealStaff: number;
  isHoliday: boolean;
  department: {
    id: string;
    name: string;
    code: string;
  };
}

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export default function StaffingPage() {
  const [requirements, setRequirements] = useState<StaffingRequirement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequirements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staffing-requirements`);
      const json = await res.json();
      if (json.success) setRequirements(json.data);
    } catch (err) {
      console.error("必要人員取得エラー:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequirements();
  }, [fetchRequirements]);

  // 部門ごとにグループ化
  const grouped = requirements.reduce<
    Record<string, { dept: StaffingRequirement["department"]; items: StaffingRequirement[] }>
  >((acc, req) => {
    if (!acc[req.departmentId]) {
      acc[req.departmentId] = { dept: req.department, items: [] };
    }
    acc[req.departmentId].items.push(req);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">必要人員設定</h2>
          <p className="text-sm text-gray-500 mt-1">
            部門×時間帯ごとの必要人数を設定
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
          必要人員が設定されていません
        </div>
      ) : (
        <div className="space-y-6">
          {Object.values(grouped).map(({ dept, items }) => (
            <div key={dept.id} className="bg-white rounded-xl border overflow-hidden">
              <div className="p-4 bg-slate-50 border-b">
                <h3 className="font-bold text-gray-800">{dept.name}</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-3 text-xs font-medium text-gray-500 border-b">
                      曜日
                    </th>
                    <th className="text-left p-3 text-xs font-medium text-gray-500 border-b">
                      時間帯
                    </th>
                    <th className="text-right p-3 text-xs font-medium text-gray-500 border-b">
                      最低人数
                    </th>
                    <th className="text-right p-3 text-xs font-medium text-gray-500 border-b">
                      理想人数
                    </th>
                    <th className="text-center p-3 text-xs font-medium text-gray-500 border-b">
                      祝日
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50">
                      <td className="p-3 text-sm border-b">
                        {DAY_LABELS[req.dayOfWeek]}
                      </td>
                      <td className="p-3 text-sm border-b font-mono">
                        {req.timeSlot}
                      </td>
                      <td className="p-3 text-sm border-b text-right font-medium">
                        {req.minStaff}人
                      </td>
                      <td className="p-3 text-sm border-b text-right font-medium text-blue-600">
                        {req.idealStaff}人
                      </td>
                      <td className="p-3 text-sm border-b text-center">
                        {req.isHoliday ? "✓" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

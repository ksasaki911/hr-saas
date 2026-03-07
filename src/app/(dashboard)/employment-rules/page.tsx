// =============================================================
// 就業規則マスタ管理ページ（雇用区分別の労働条件設定）
// =============================================================
"use client";

import { useState, useEffect } from "react";

interface EmploymentRule {
  id: string;
  employmentType: string;
  name: string;
  monthlyWorkDays: number | null;
  weeklyWorkDays: number | null;
  dailyWorkHours: number | null;
  weeklyMaxHours: number | null;
  monthlyMaxHours: number | null;
  maxConsecutiveDays: number | null;
  minBreakMinutes: number;
  overtimeThresholdDaily: number | null;
  overtimeThresholdWeekly: number | null;
  nightShiftStartTime: string | null;
  nightShiftEndTime: string | null;
  nightShiftPremium: number | null;
}

const EMPLOYMENT_TYPES = [
  { value: "FULL_TIME", label: "正社員", defaultName: "正社員就業規則" },
  { value: "PART_TIME", label: "パートタイマー", defaultName: "パートタイマー規則" },
  { value: "ARBEIT", label: "アルバイト", defaultName: "アルバイト規則" },
  { value: "CONTRACT", label: "契約社員", defaultName: "契約社員規則" },
];

const DEFAULT_RULES: Record<string, Partial<EmploymentRule>> = {
  FULL_TIME: {
    monthlyWorkDays: 21, weeklyWorkDays: 5, dailyWorkHours: 8.0,
    weeklyMaxHours: 40, monthlyMaxHours: 176, maxConsecutiveDays: 6,
    minBreakMinutes: 60, overtimeThresholdDaily: 8.0, overtimeThresholdWeekly: 40.0,
    nightShiftStartTime: "22:00", nightShiftEndTime: "05:00", nightShiftPremium: 0.25,
  },
  PART_TIME: {
    monthlyWorkDays: 16, weeklyWorkDays: 4, dailyWorkHours: 5.0,
    weeklyMaxHours: 30, monthlyMaxHours: 120, maxConsecutiveDays: 5,
    minBreakMinutes: 0, overtimeThresholdDaily: 8.0, overtimeThresholdWeekly: 40.0,
    nightShiftStartTime: "22:00", nightShiftEndTime: "05:00", nightShiftPremium: 0.25,
  },
  ARBEIT: {
    monthlyWorkDays: 12, weeklyWorkDays: 3, dailyWorkHours: 5.0,
    weeklyMaxHours: 20, monthlyMaxHours: 80, maxConsecutiveDays: 5,
    minBreakMinutes: 0, overtimeThresholdDaily: 8.0, overtimeThresholdWeekly: 40.0,
    nightShiftStartTime: "22:00", nightShiftEndTime: "05:00", nightShiftPremium: 0.25,
  },
  CONTRACT: {
    monthlyWorkDays: 20, weeklyWorkDays: 5, dailyWorkHours: 8.0,
    weeklyMaxHours: 40, monthlyMaxHours: 176, maxConsecutiveDays: 6,
    minBreakMinutes: 60, overtimeThresholdDaily: 8.0, overtimeThresholdWeekly: 40.0,
    nightShiftStartTime: "22:00", nightShiftEndTime: "05:00", nightShiftPremium: 0.25,
  },
};

export default function EmploymentRulesPage() {
  const [rules, setRules] = useState<EmploymentRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editRules, setEditRules] = useState<Record<string, Partial<EmploymentRule>>>({});

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employment-rules");
      const data = await res.json();
      if (Array.isArray(data)) {
        setRules(data);
        const editMap: Record<string, Partial<EmploymentRule>> = {};
        for (const r of data) {
          editMap[r.employmentType] = r;
        }
        // 未登録の雇用区分にデフォルト値を設定
        for (const et of EMPLOYMENT_TYPES) {
          if (!editMap[et.value]) {
            editMap[et.value] = { ...DEFAULT_RULES[et.value], employmentType: et.value, name: et.defaultName };
          }
        }
        setEditRules(editMap);
      }
    } catch {
      console.error("取得エラー");
    }
    setLoading(false);
  };

  const updateField = (empType: string, field: string, value: unknown) => {
    setEditRules((prev) => ({
      ...prev,
      [empType]: { ...prev[empType], [field]: value },
    }));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const rulesArr = EMPLOYMENT_TYPES.map((et) => ({
        employmentType: et.value,
        name: editRules[et.value]?.name || et.defaultName,
        ...editRules[et.value],
      }));
      const res = await fetch("/api/employment-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: rulesArr }),
      });
      if (res.ok) {
        alert("保存しました");
        fetchRules();
      }
    } catch {
      alert("保存に失敗しました");
    }
    setSaving(false);
  };

  if (loading) return <div className="p-8 text-gray-500">読込中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">就業規則マスタ</h1>
          <p className="text-sm text-gray-500 mt-1">雇用区分別の労働条件・制約を設定</p>
        </div>
        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : "全体を保存"}
        </button>
      </div>

      {/* 情報ボックス */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-800">
        <strong>シフト自動生成との連携:</strong> ここで設定した「月間所定労働日数」「週最大労働時間」「連続勤務日数上限」が
        自動生成アルゴリズムの制約条件として使われます。
        また「日残業閾値」を超えた時間は残業として自動計算されます。
      </div>

      {/* 雇用区分別カード */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {EMPLOYMENT_TYPES.map((et) => {
          const rule = editRules[et.value] || {};
          const existsInDb = rules.some((r) => r.employmentType === et.value);

          return (
            <div key={et.value} className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className={`px-4 py-3 border-b ${existsInDb ? "bg-green-50" : "bg-gray-50"}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">{et.label}</h3>
                  {existsInDb ? (
                    <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">設定済み</span>
                  ) : (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">未設定（デフォルト値）</span>
                  )}
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="月間所定労働日数" value={rule.monthlyWorkDays} unit="日"
                    onChange={(v) => updateField(et.value, "monthlyWorkDays", v ? Number(v) : null)} />
                  <Field label="週間所定労働日数" value={rule.weeklyWorkDays} unit="日"
                    onChange={(v) => updateField(et.value, "weeklyWorkDays", v ? Number(v) : null)} />
                  <Field label="1日の所定労働時間" value={rule.dailyWorkHours} unit="時間"
                    onChange={(v) => updateField(et.value, "dailyWorkHours", v ? Number(v) : null)} />
                  <Field label="週最大労働時間" value={rule.weeklyMaxHours} unit="時間"
                    onChange={(v) => updateField(et.value, "weeklyMaxHours", v ? Number(v) : null)} />
                  <Field label="月最大労働時間" value={rule.monthlyMaxHours} unit="時間"
                    onChange={(v) => updateField(et.value, "monthlyMaxHours", v ? Number(v) : null)} />
                  <Field label="連続勤務日数上限" value={rule.maxConsecutiveDays} unit="日"
                    onChange={(v) => updateField(et.value, "maxConsecutiveDays", v ? Number(v) : null)} />
                  <Field label="休憩時間(6h超)" value={rule.minBreakMinutes} unit="分"
                    onChange={(v) => updateField(et.value, "minBreakMinutes", v ? Number(v) : 60)} />
                  <Field label="日残業閾値" value={rule.overtimeThresholdDaily} unit="時間"
                    onChange={(v) => updateField(et.value, "overtimeThresholdDaily", v ? Number(v) : null)} />
                </div>
                <div className="border-t pt-3 mt-3">
                  <div className="text-xs font-medium text-gray-500 mb-2">深夜勤務設定</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">開始時刻</label>
                      <input type="time" value={rule.nightShiftStartTime || "22:00"}
                        onChange={(e) => updateField(et.value, "nightShiftStartTime", e.target.value)}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">終了時刻</label>
                      <input type="time" value={rule.nightShiftEndTime || "05:00"}
                        onChange={(e) => updateField(et.value, "nightShiftEndTime", e.target.value)}
                        className="w-full border rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">割増率</label>
                      <div className="flex items-center gap-1">
                        <input type="number" step="0.05" value={rule.nightShiftPremium ?? 0.25}
                          onChange={(e) => updateField(et.value, "nightShiftPremium", Number(e.target.value))}
                          className="w-full border rounded px-2 py-1.5 text-sm" />
                        <span className="text-xs text-gray-500 whitespace-nowrap">({Math.round((rule.nightShiftPremium ?? 0.25) * 100)}%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  label, value, unit, onChange,
}: {
  label: string; value: unknown; unit: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="any"
          value={value != null ? String(value) : ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-sm"
          placeholder="-"
        />
        <span className="text-xs text-gray-500 whitespace-nowrap">{unit}</span>
      </div>
    </div>
  );
}

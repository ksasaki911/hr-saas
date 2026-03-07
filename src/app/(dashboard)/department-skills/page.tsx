// =============================================================
// 部門別必須スキル管理画面
// 各部門に必要なスキルを定義し、従業員のスキル適合を管理
// =============================================================
"use client";

import { useState, useEffect, useCallback } from "react";

interface Department {
  id: string;
  code: string;
  name: string;
}

interface SkillReq {
  id: string;
  departmentId: string;
  skillName: string;
  isRequired: boolean;
  description: string | null;
  department: Department;
}

interface Employee {
  id: string;
  code: string;
  lastName: string;
  firstName: string;
  employmentType: string;
  departmentId: string | null;
  skills: string[];
}

const EMP_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: "正社員",
  PART_TIME: "パート",
  ARBEIT: "アルバイト",
  CONTRACT: "契約",
};

export default function DepartmentSkillsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [skillReqs, setSkillReqs] = useState<SkillReq[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editSkills, setEditSkills] = useState<{ skillName: string; isRequired: boolean; description: string }[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [newSkillRequired, setNewSkillRequired] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  const [storeId, setStoreId] = useState<string>("");
  
  // 店舗ID動的取得
  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d) => {
        const list = d.data || d || [];
        if (Array.isArray(list) && list.length > 0) {
          setStoreId(list[0].id);
        }
      })
      .catch(() => {});
  }, []);
  // 部門一覧取得（従業員APIから部門情報を推測）
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [skillRes, empRes] = await Promise.all([
        fetch("/api/department-skills"),
        fetch("/api/employees?limit=100"),
      ]);
      const skillJson = await skillRes.json();
      const empJson = await empRes.json();

      if (skillJson.success) setSkillReqs(skillJson.data);
      if (empJson.success) setEmployees(empJson.data);

      // 部門一覧を抽出
      const deptMap = new Map<string, Department>();
      if (skillJson.success) {
        for (const sr of skillJson.data) {
          deptMap.set(sr.department.id, sr.department);
        }
      }
      // staffingからも取得
      const staffRes = await fetch(`/api/staffing-requirements?storeId=${storeId}`);
      const staffJson = await staffRes.json();
      if (staffJson.success) {
        for (const s of staffJson.data) {
          if (s.department) {
            deptMap.set(s.department.id, s.department);
          }
        }
      }
      const depts = Array.from(deptMap.values()).sort((a, b) => a.code.localeCompare(b.code));
      setDepartments(depts);
      if (depts.length > 0 && !selectedDept) {
        setSelectedDept(depts[0].id);
      }
    } catch (err) {
      console.error("データ取得エラー:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDept, storeId]);

  useEffect(() => {
    fetchData();
  }, []);

  // 選択部門のスキル要件
  const deptSkills = skillReqs.filter((s) => s.departmentId === selectedDept);

  // 選択部門の従業員
  const deptEmployees = employees.filter((e) => e.departmentId === selectedDept);

  // スキル充足チェック
  function checkSkillGap(emp: Employee): { missing: string[]; optional: string[] } {
    const requiredSkills = deptSkills.filter((s) => s.isRequired).map((s) => s.skillName);
    const optionalSkills = deptSkills.filter((s) => !s.isRequired).map((s) => s.skillName);
    const missing = requiredSkills.filter((sk) => !emp.skills.some((es) => es.includes(sk) || sk.includes(es)));
    const optMissing = optionalSkills.filter((sk) => !emp.skills.some((es) => es.includes(sk) || sk.includes(es)));
    return { missing, optional: optMissing };
  }

  // 編集モーダル開始
  const startEdit = () => {
    setEditSkills(
      deptSkills.map((s) => ({
        skillName: s.skillName,
        isRequired: s.isRequired,
        description: s.description || "",
      }))
    );
    setShowEdit(true);
  };

  // スキル追加
  const addSkill = () => {
    if (!newSkill.trim()) return;
    if (editSkills.some((s) => s.skillName === newSkill.trim())) return;
    setEditSkills([...editSkills, { skillName: newSkill.trim(), isRequired: newSkillRequired, description: "" }]);
    setNewSkill("");
    setNewSkillRequired(true);
  };

  // スキル削除
  const removeSkill = (idx: number) => {
    setEditSkills(editSkills.filter((_, i) => i !== idx));
  };

  // 保存
  const saveSkills = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/department-skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: selectedDept, skills: editSkills }),
      });
      const json = await res.json();
      if (json.success) {
        setShowEdit(false);
        fetchData();
      }
    } catch (err) {
      console.error("保存エラー:", err);
    } finally {
      setSaving(false);
    }
  };

  const selectedDeptName = departments.find((d) => d.id === selectedDept)?.name || "";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">部門別必須スキル</h2>
          <p className="text-sm text-gray-500 mt-1">
            各部門に必要なスキルを定義し、従業員の適合状況を確認
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {/* 左: 部門リスト */}
          <div className="col-span-3">
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="p-3 bg-slate-50 border-b">
                <h3 className="text-sm font-semibold text-gray-700">部門</h3>
              </div>
              {departments.map((dept) => {
                const deptReqs = skillReqs.filter((s) => s.departmentId === dept.id);
                const reqCount = deptReqs.filter((s) => s.isRequired).length;
                return (
                  <button
                    key={dept.id}
                    onClick={() => setSelectedDept(dept.id)}
                    className={`w-full text-left px-4 py-3 border-b text-sm hover:bg-gray-50 transition-colors ${
                      selectedDept === dept.id ? "bg-blue-50 border-l-4 border-l-blue-500" : ""
                    }`}
                  >
                    <div className="font-medium">{dept.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {reqCount > 0 ? `必須スキル: ${reqCount}件` : "未設定"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 右: スキル詳細 */}
          <div className="col-span-9 space-y-6">
            {/* スキル要件 */}
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="p-4 bg-slate-50 border-b flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">
                  {selectedDeptName} - 必須スキル定義
                </h3>
                <button
                  onClick={startEdit}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700"
                >
                  編集
                </button>
              </div>
              <div className="p-4">
                {deptSkills.length === 0 ? (
                  <p className="text-sm text-gray-500">スキル要件が未設定です。「編集」から設定してください。</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {deptSkills.map((s) => (
                      <span
                        key={s.id}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                          s.isRequired
                            ? "bg-red-100 text-red-700 border border-red-200"
                            : "bg-yellow-100 text-yellow-700 border border-yellow-200"
                        }`}
                        title={s.description || undefined}
                      >
                        {s.isRequired ? "必須" : "推奨"}: {s.skillName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 従業員スキル適合状況 */}
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="p-4 bg-slate-50 border-b">
                <h3 className="text-sm font-semibold text-gray-700">
                  {selectedDeptName} - 従業員スキル適合状況
                </h3>
              </div>
              {deptEmployees.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">この部門に所属する従業員がいません</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-3 text-xs font-medium text-gray-600 border-b">社員番号</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-600 border-b">氏名</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-600 border-b">雇用形態</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-600 border-b">保有スキル</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-600 border-b">判定</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptEmployees.map((emp) => {
                      const gap = checkSkillGap(emp);
                      const hasAlert = gap.missing.length > 0;
                      return (
                        <tr key={emp.id} className={hasAlert ? "bg-red-50" : "hover:bg-gray-50"}>
                          <td className="p-3 text-sm border-b font-mono">{emp.code}</td>
                          <td className="p-3 text-sm border-b font-medium">{emp.lastName} {emp.firstName}</td>
                          <td className="p-3 text-sm border-b">{EMP_TYPE_LABELS[emp.employmentType]}</td>
                          <td className="p-3 text-sm border-b">
                            <div className="flex flex-wrap gap-1">
                              {emp.skills.map((sk) => (
                                <span key={sk} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                                  {sk}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 text-sm border-b">
                            {hasAlert ? (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                  <span>&#9888;</span> 不足
                                </span>
                                <div className="mt-1 text-xs text-red-600">
                                  {gap.missing.map((m) => m).join(", ")}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                OK
                              </span>
                            )}
                            {gap.optional.length > 0 && (
                              <div className="mt-1 text-xs text-yellow-600">
                                推奨不足: {gap.optional.join(", ")}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* 全従業員からのスキル保有者一覧 */}
            {deptSkills.filter((s) => s.isRequired).length > 0 && (
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="p-4 bg-slate-50 border-b">
                  <h3 className="text-sm font-semibold text-gray-700">
                    必須スキル保有者（全従業員）
                  </h3>
                </div>
                <div className="p-4 space-y-3">
                  {deptSkills.filter((s) => s.isRequired).map((req) => {
                    const holders = employees.filter((e) =>
                      e.skills.some((sk) => sk.includes(req.skillName) || req.skillName.includes(sk))
                    );
                    return (
                      <div key={req.id}>
                        <div className="text-sm font-medium text-gray-700 mb-1">
                          {req.skillName}
                          <span className="ml-2 text-xs text-gray-500">
                            ({holders.length}名保有)
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {holders.map((h) => (
                            <span
                              key={h.id}
                              className={`px-2 py-0.5 rounded text-xs ${
                                h.departmentId === selectedDept
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {h.lastName}{h.firstName}
                              ({EMP_TYPE_LABELS[h.employmentType]})
                            </span>
                          ))}
                          {holders.length === 0 && (
                            <span className="text-xs text-red-500 font-medium">
                              &#9888; 保有者がいません！
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold">{selectedDeptName} - スキル要件編集</h3>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* 既存スキル */}
              {editSkills.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    s.isRequired ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {s.isRequired ? "必須" : "推奨"}
                  </span>
                  <span className="text-sm flex-1">{s.skillName}</span>
                  <button
                    onClick={() => {
                      const updated = [...editSkills];
                      updated[idx].isRequired = !updated[idx].isRequired;
                      setEditSkills(updated);
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    切替
                  </button>
                  <button
                    onClick={() => removeSkill(idx)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    削除
                  </button>
                </div>
              ))}

              {/* 新規追加 */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <input
                  type="text"
                  placeholder="スキル名を入力..."
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSkill()}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={newSkillRequired}
                    onChange={(e) => setNewSkillRequired(e.target.checked)}
                  />
                  必須
                </label>
                <button
                  onClick={addSkill}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm"
                >
                  追加
                </button>
              </div>

              {/* プリセットスキル提案 */}
              <div className="pt-2">
                <div className="text-xs text-gray-500 mb-1">よく使うスキル:</div>
                <div className="flex flex-wrap gap-1">
                  {getPresetSkills(selectedDeptName).map((sk) => (
                    <button
                      key={sk}
                      onClick={() => {
                        if (!editSkills.some((s) => s.skillName === sk)) {
                          setEditSkills([...editSkills, { skillName: sk, isRequired: true, description: "" }]);
                        }
                      }}
                      disabled={editSkills.some((s) => s.skillName === sk)}
                      className="px-2 py-0.5 border rounded text-xs hover:bg-gray-100 disabled:opacity-40"
                    >
                      + {sk}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-2">
              <button
                onClick={() => setShowEdit(false)}
                className="px-4 py-2 border rounded-lg text-sm"
              >
                キャンセル
              </button>
              <button
                onClick={saveSkills}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 部門名に応じたプリセットスキル
function getPresetSkills(deptName: string): string[] {
  const presets: Record<string, string[]> = {
    "鮮魚": ["包丁技術", "刺身盛付", "魚さばき", "鮮度管理", "パック詰め"],
    "精肉": ["包丁技術", "スライサー操作", "肉加工", "鮮度管理", "パック詰め", "計量"],
    "惣菜": ["調理師免許", "調理技術", "揚げ物", "パック詰め", "衛生管理"],
    "ベーカリー": ["パン製造", "菓子製造", "オーブン操作", "成形技術"],
    "青果": ["青果加工", "品出し", "鮮度チェック", "カット加工"],
    "グロサリー": ["品出し", "発注", "在庫管理", "棚割"],
    "日配": ["品出し", "鮮度チェック", "温度管理"],
    "レジ": ["レジ操作", "接客", "クレジット処理", "返品対応"],
    "サービスカウンター": ["接客", "ギフト対応", "宅配受付", "電話対応"],
  };
  return presets[deptName] || ["品出し", "接客", "清掃"];
}

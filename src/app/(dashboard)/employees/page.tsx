// =============================================================
// 従業員一覧画面（スキル適合アラート付き）
// =============================================================
"use client";

import { useState, useEffect, useCallback } from "react";

interface Employee {
  id: string;
  code: string;
  lastName: string;
  firstName: string;
  employmentType: string;
  storeId: string;
  departmentId: string | null;
  hourlyWage: number | null;
  maxHoursPerWeek: number | null;
  skills: string[];
}

interface SkillReq {
  departmentId: string;
  skillName: string;
  isRequired: boolean;
  department: { id: string; name: string };
}

const EMP_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: "正社員",
  PART_TIME: "パート",
  ARBEIT: "アルバイト",
  CONTRACT: "契約",
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [skillReqs, setSkillReqs] = useState<SkillReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterAlert, setFilterAlert] = useState(false);

  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, skillRes] = await Promise.all([
        fetch(`/api/employees?page=${page}&limit=${limit}${search ? `&search=${search}` : ""}`),
        fetch("/api/department-skills"),
      ]);
      const empJson = await empRes.json();
      const skillJson = await skillRes.json();
      if (empJson.success) {
        setEmployees(empJson.data);
        setTotal(empJson.pagination.total);
      }
      if (skillJson.success) {
        setSkillReqs(skillJson.data);
      }
    } catch (err) {
      console.error("取得エラー:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // スキル不足チェック
  function getMissingSkills(emp: Employee): string[] {
    if (!emp.departmentId) return [];
    const required = skillReqs
      .filter((s) => s.departmentId === emp.departmentId && s.isRequired)
      .map((s) => s.skillName);
    return required.filter(
      (sk) => !emp.skills.some((es) => es.includes(sk) || sk.includes(es))
    );
  }

  // 部門名取得
  function getDeptName(deptId: string | null): string {
    if (!deptId) return "−";
    const req = skillReqs.find((s) => s.departmentId === deptId);
    return req?.department?.name || deptId;
  }

  // アラートフィルタ適用
  const displayEmployees = filterAlert
    ? employees.filter((e) => getMissingSkills(e).length > 0)
    : employees;

  // スキル不足の従業員数カウント
  const alertCount = employees.filter((e) => getMissingSkills(e).length > 0).length;

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">従業員一覧</h2>
          <p className="text-sm text-gray-500 mt-1">
            シフト対象の従業員を管理（スキル適合チェック付き）
          </p>
        </div>
        {alertCount > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <span className="text-red-600 text-lg">&#9888;</span>
            <span className="text-sm text-red-700 font-medium">
              必須スキル不足: {alertCount}名
            </span>
          </div>
        )}
      </div>

      {/* 検索・フィルタ */}
      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          placeholder="氏名・社員番号で検索..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm w-72 focus:ring-2 focus:ring-blue-500"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filterAlert}
            onChange={(e) => setFilterAlert(e.target.checked)}
            className="rounded"
          />
          <span className="text-red-600 font-medium">スキル不足のみ表示</span>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600 border-b">社員番号</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600 border-b">氏名</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600 border-b">雇用形態</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600 border-b">部門</th>
                <th className="text-right p-3 text-sm font-medium text-gray-600 border-b">時給</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600 border-b">保有スキル</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600 border-b">適合</th>
              </tr>
            </thead>
            <tbody>
              {displayEmployees.map((emp) => {
                const missing = getMissingSkills(emp);
                const hasAlert = missing.length > 0;
                return (
                  <tr key={emp.id} className={hasAlert ? "bg-red-50" : "hover:bg-gray-50"}>
                    <td className="p-3 text-sm border-b font-mono">{emp.code}</td>
                    <td className="p-3 text-sm border-b font-medium">
                      {emp.lastName} {emp.firstName}
                    </td>
                    <td className="p-3 text-sm border-b">
                      {EMP_TYPE_LABELS[emp.employmentType] || emp.employmentType}
                    </td>
                    <td className="p-3 text-sm border-b">{getDeptName(emp.departmentId)}</td>
                    <td className="p-3 text-sm border-b text-right">
                      {emp.hourlyWage ? `¥${emp.hourlyWage.toLocaleString()}` : "−"}
                    </td>
                    <td className="p-3 text-sm border-b">
                      <div className="flex flex-wrap gap-1">
                        {emp.skills.map((skill) => (
                          <span
                            key={skill}
                            className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
                          >
                            {skill}
                          </span>
                        ))}
                        {emp.skills.length === 0 && (
                          <span className="text-xs text-gray-400">未登録</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-sm border-b">
                      {emp.departmentId ? (
                        hasAlert ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                              &#9888; 不足
                            </span>
                            <div className="mt-0.5 text-xs text-red-600">
                              {missing.join(", ")}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            OK
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-gray-400">−</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {displayEmployees.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500 text-sm">
                    {filterAlert ? "スキル不足の従業員はいません" : "従業員が見つかりません"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="p-3 bg-slate-50 border-t flex items-center justify-between text-xs text-gray-600">
              <span>
                {total}件中 {(page - 1) * limit + 1}〜{Math.min(page * limit, total)}件
              </span>
              <div className="flex gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-50">前</button>
                <span className="px-2 py-1">{page}/{totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-50">次</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

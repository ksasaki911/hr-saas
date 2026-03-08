// =============================================================
// 給与実績取込 API（給与奉行フォーマット対応）
// POST /api/payroll/import
// body: { csvText: string, yearMonth: string, dryRun?: boolean }
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { requireRole } from "@/lib/auth-utils";
import { apiSuccess, apiError } from "@/lib/api-response";
import { parseBugyoPayrollCsv, parseTimeStr } from "@/lib/bugyo-parser";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole("STORE_MANAGER");
    if (auth.error) return auth.error;

    const { db, tenantId } = await getTenantDb();
    const body = await request.json();
    const { csvText, yearMonth, dryRun } = body as {
      csvText: string;
      yearMonth: string;
      dryRun?: boolean;
    };

    if (!csvText || csvText.trim().length === 0) {
      return apiError("CSVデータがありません", 400);
    }
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return apiError("年月（YYYY-MM形式）を指定してください", 400);
    }

    const rows = parseBugyoPayrollCsv(csvText);
    if (rows.length === 0) {
      return apiError("有効なデータ行がありません", 400);
    }

    // 従業員コード→(id, storeId)
    const employees = await db.employee.findMany({
      where: { tenantId },
      select: { id: true, code: true, storeId: true },
    });
    type EmpInfo = { id: string; storeId: string };
    const empCodeMap = new Map<string, EmpInfo>(
      employees.map((e: { code: string; id: string; storeId: string }) => [
        e.code,
        { id: e.id, storeId: e.storeId },
      ])
    );

    const results = {
      total: rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as Array<{ row: number; code: string; message: string }>,
      summary: {
        totalPayment: 0,
        totalLaborCost: 0,
        totalSocialInsurance: 0,
      },
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const emp = empCodeMap.get(row.code);
        if (!emp) {
          results.errors.push({
            row: i + 1,
            code: row.code,
            message: `従業員「${row.name}」(${row.code}) が未登録です`,
          });
          results.skipped++;
          continue;
        }

        const workHours = parseTimeStr(row.workTimeStr);
        const overtimeHours = parseTimeStr(row.overtimeTimeStr) +
          parseTimeStr(row.nightOvertimeStr);

        // 残業手当合計
        const overtimePay = row.overtimePay + row.nightOvertimePay + row.nightWorkPay;

        // 総人件費 = 支給総額 + 社保（会社負担は概算: 従業員負担分と同額程度）
        // 注: 給与奉行の出力は従業員負担分。会社負担は別途概算。
        // ここでは社保合計額(従業員負担)の約1.15倍を会社負担として概算
        const socialInsuranceCompany = Math.round(
          (row.healthInsurance + row.careInsurance + row.pensionInsurance) * 1.0
        );
        const laborInsuranceCompany = Math.round(row.totalPayment * 0.0095); // 労働保険料率概算
        const totalLaborCost = row.totalPayment + socialInsuranceCompany + laborInsuranceCompany;

        results.summary.totalPayment += row.totalPayment;
        results.summary.totalLaborCost += totalLaborCost;
        results.summary.totalSocialInsurance += socialInsuranceCompany;

        if (dryRun) {
          results.created++;
          continue;
        }

        const data = {
          storeId: emp.storeId,
          baseSalary: Math.round(row.baseSalary),
          overtimePay: Math.round(overtimePay),
          nightPay: Math.round(row.nightWorkPay),
          holidayPay: 0,
          commutingAllowance: Math.round(row.commutingAllowance),
          otherAllowance: Math.round(
            row.managerAllowance + row.dutyAllowance + row.experienceAllowance
          ),
          totalPayment: Math.round(row.totalPayment),
          socialInsurance: socialInsuranceCompany,
          laborInsurance: laborInsuranceCompany,
          totalLaborCost,
          workDays: row.workDays || null,
          workHours: workHours || null,
          overtimeHours: overtimeHours || null,
          paidLeaveDays: row.paidLeaveDays || null,
        };

        await db.payrollRecord.upsert({
          where: {
            tenantId_employeeId_yearMonth: {
              tenantId,
              employeeId: emp.id,
              yearMonth,
            },
          },
          update: data,
          create: {
            ...data,
            tenantId,
            employeeId: emp.id,
            yearMonth,
          },
        });

        results.created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "不明なエラー";
        results.errors.push({ row: i + 1, code: row.code, message: msg });
        results.skipped++;
      }
    }

    return apiSuccess({ ...results, dryRun: !!dryRun });
  } catch (error) {
    console.error("POST /api/payroll/import error:", error);
    return apiError("給与実績の取込に失敗しました", 500);
  }
}

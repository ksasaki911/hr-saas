// =============================================================
// 就業規則マスタAPI（雇用区分別の労働条件）
// =============================================================
import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

export async function GET() {
  try {
    const { db } = await getTenantDb();
    const rules = await db.employmentRule.findMany({
      where: { isActive: true },
      orderBy: { employmentType: "asc" },
    });
    return NextResponse.json(rules);
  } catch (e) {
    console.error("GET /api/employment-rules error:", e);
    return NextResponse.json({ error: "取得失敗" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const body = await req.json();
    const { rules } = body as {
      rules: {
        employmentType: string;
        name: string;
        monthlyWorkDays?: number;
        weeklyWorkDays?: number;
        dailyWorkHours?: number;
        weeklyMaxHours?: number;
        monthlyMaxHours?: number;
        maxConsecutiveDays?: number;
        minBreakMinutes?: number;
        overtimeThresholdDaily?: number;
        overtimeThresholdWeekly?: number;
        nightShiftStartTime?: string;
        nightShiftEndTime?: string;
        nightShiftPremium?: number;
      }[];
    };

    if (!rules || !Array.isArray(rules)) {
      return NextResponse.json({ error: "rules配列が必要です" }, { status: 400 });
    }

    const results = [];
    for (const rule of rules) {
      const result = await db.employmentRule.upsert({
        where: {
          tenantId_employmentType: {
            tenantId: "",
            employmentType: rule.employmentType,
          },
        },
        update: {
          name: rule.name,
          monthlyWorkDays: rule.monthlyWorkDays ?? null,
          weeklyWorkDays: rule.weeklyWorkDays ?? null,
          dailyWorkHours: rule.dailyWorkHours ?? null,
          weeklyMaxHours: rule.weeklyMaxHours ?? null,
          monthlyMaxHours: rule.monthlyMaxHours ?? null,
          maxConsecutiveDays: rule.maxConsecutiveDays ?? null,
          minBreakMinutes: rule.minBreakMinutes ?? 60,
          overtimeThresholdDaily: rule.overtimeThresholdDaily ?? null,
          overtimeThresholdWeekly: rule.overtimeThresholdWeekly ?? null,
          nightShiftStartTime: rule.nightShiftStartTime ?? null,
          nightShiftEndTime: rule.nightShiftEndTime ?? null,
          nightShiftPremium: rule.nightShiftPremium ?? null,
        },
        create: {
          employmentType: rule.employmentType,
          name: rule.name,
          monthlyWorkDays: rule.monthlyWorkDays ?? null,
          weeklyWorkDays: rule.weeklyWorkDays ?? null,
          dailyWorkHours: rule.dailyWorkHours ?? null,
          weeklyMaxHours: rule.weeklyMaxHours ?? null,
          monthlyMaxHours: rule.monthlyMaxHours ?? null,
          maxConsecutiveDays: rule.maxConsecutiveDays ?? null,
          minBreakMinutes: rule.minBreakMinutes ?? 60,
          overtimeThresholdDaily: rule.overtimeThresholdDaily ?? null,
          overtimeThresholdWeekly: rule.overtimeThresholdWeekly ?? null,
          nightShiftStartTime: rule.nightShiftStartTime ?? null,
          nightShiftEndTime: rule.nightShiftEndTime ?? null,
          nightShiftPremium: rule.nightShiftPremium ?? null,
        },
      });
      results.push(result);
    }

    return NextResponse.json({ count: results.length, results });
  } catch (e) {
    console.error("POST /api/employment-rules error:", e);
    return NextResponse.json({ error: "登録失敗" }, { status: 500 });
  }
}

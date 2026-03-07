// =============================================================
// シフトカバレッジ API
// GET /api/shifts/coverage?weekStart=YYYY-MM-DD
// 部門×曜日×時間帯ごとの必要人員 vs 割当人員を返す
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";

const TIME_SLOTS = ["09:00-12:00", "12:00-15:00", "15:00-18:00", "18:00-22:00"];

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function timeSlotOverlaps(slotRange: string, shiftStart: string, shiftEnd: string): boolean {
  const [slotS, slotE] = slotRange.split("-");
  const ss = parseTime(slotS);
  const se = parseTime(slotE);
  const fs = parseTime(shiftStart);
  const fe = parseTime(shiftEnd);
  return fs < se && fe > ss;
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const weekStartStr = request.nextUrl.searchParams.get("weekStart");
    const storeId = request.nextUrl.searchParams.get("storeId") || undefined;

    if (!weekStartStr || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartStr)) {
      return apiError("weekStart パラメータ (YYYY-MM-DD) が必要です", 400);
    }

    const weekStart = new Date(weekStartStr + "T00:00:00");
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // 並列でデータ取得（店舗フィルタ付き）
    const [staffingReqs, shifts, departments] = await Promise.all([
      db.staffingRequirement.findMany({
        where: {
          ...(storeId ? { storeId } : {}),
        },
        select: {
          departmentId: true,
          dayOfWeek: true,
          timeSlot: true,
          minStaff: true,
          idealStaff: true,
        },
      }),
      db.shift.findMany({
        where: {
          shiftDate: { gte: weekStart, lte: weekEnd },
          ...(storeId ? { storeId } : {}),
        },
        select: {
          shiftDate: true,
          startTime: true,
          endTime: true,
          departmentId: true,
          status: true,
        },
      }),
      db.department.findMany({
        where: {
          ...(storeId ? { storeId } : {}),
        },
        select: { id: true, name: true },
      }),
    ]);

    const deptNames = new Map<string, string>();
    for (const d of departments) {
      deptNames.set(d.id, d.name);
    }

    // 7日分のカバレッジを計算
    const days: Array<{
      date: string;
      dayOfWeek: number;
      dayLabel: string;
      slots: Array<{
        timeSlot: string;
        departments: Array<{
          departmentId: string;
          departmentName: string;
          minStaff: number;
          idealStaff: number;
          assigned: number;
          status: "over" | "ideal" | "minimum" | "short" | "no_req";
        }>;
      }>;
      totalAssigned: number;
      totalRequired: number;
      fillRate: number;
    }> = [];

    const dayLabels = ["日", "月", "火", "水", "木", "金", "土"];

    let grandTotalAssigned = 0;
    let grandTotalRequired = 0;

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const dateStr = localDateStr(date);
      const dow = date.getDay();

      const dayReqs = staffingReqs.filter(
        (r: { dayOfWeek: number }) => r.dayOfWeek === dow
      );
      const dayShifts = shifts.filter((s: { shiftDate: Date | string }) => {
        const sd =
          typeof s.shiftDate === "string"
            ? s.shiftDate.split("T")[0]
            : localDateStr(new Date(s.shiftDate));
        return sd === dateStr;
      });

      let dayAssigned = 0;
      let dayRequired = 0;

      const slots = TIME_SLOTS.map((slot) => {
        const slotReqs = dayReqs.filter(
          (r: { timeSlot: string }) => r.timeSlot === slot
        );

        // 各部門のカバレッジ
        const deptCoverages = slotReqs.map(
          (r: {
            departmentId: string;
            minStaff: number;
            idealStaff: number;
          }) => {
            const assigned = dayShifts.filter(
              (s: {
                departmentId: string | null;
                startTime: string;
                endTime: string;
              }) =>
                s.departmentId === r.departmentId &&
                timeSlotOverlaps(slot, s.startTime, s.endTime)
            ).length;

            // 部門未指定のシフトも加算
            const unassigned = dayShifts.filter(
              (s: {
                departmentId: string | null;
                startTime: string;
                endTime: string;
              }) =>
                s.departmentId === null &&
                timeSlotOverlaps(slot, s.startTime, s.endTime)
            ).length;

            const totalAssigned = assigned + Math.floor(unassigned / Math.max(1, slotReqs.length));

            let status: "over" | "ideal" | "minimum" | "short" | "no_req";
            if (totalAssigned >= r.idealStaff) status = "ideal";
            else if (totalAssigned >= r.minStaff) status = "minimum";
            else status = "short";
            if (totalAssigned > r.idealStaff) status = "over";

            dayAssigned += totalAssigned;
            dayRequired += r.minStaff;

            return {
              departmentId: r.departmentId,
              departmentName: deptNames.get(r.departmentId) || r.departmentId,
              minStaff: r.minStaff,
              idealStaff: r.idealStaff,
              assigned: totalAssigned,
              status,
            };
          }
        );

        return { timeSlot: slot, departments: deptCoverages };
      });

      grandTotalAssigned += dayAssigned;
      grandTotalRequired += dayRequired;

      days.push({
        date: dateStr,
        dayOfWeek: dow,
        dayLabel: dayLabels[dow],
        slots,
        totalAssigned: dayAssigned,
        totalRequired: dayRequired,
        fillRate: dayRequired > 0 ? Math.round((dayAssigned / dayRequired) * 100) : 100,
      });
    }

    return apiSuccess({
      weekStart: weekStartStr,
      days,
      summary: {
        totalAssigned: grandTotalAssigned,
        totalRequired: grandTotalRequired,
        overallFillRate:
          grandTotalRequired > 0
            ? Math.round((grandTotalAssigned / grandTotalRequired) * 100)
            : 100,
        shortSlots: days.reduce(
          (sum, d) =>
            sum +
            d.slots.reduce(
              (s2, sl) =>
                s2 + sl.departments.filter((dp) => dp.status === "short").length,
              0
            ),
          0
        ),
      },
    });
  } catch (error) {
    console.error("GET /api/shifts/coverage error:", error);
    return apiError("カバレッジ情報の取得に失敗しました", 500);
  }
}

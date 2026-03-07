// =============================================================
// 勤怠実績 CSVインポート API（超高速版）
// POST /api/import/attendance
//   - JSON形式: { rows, defaultStoreId }
//   - PostgreSQL INSERT ON CONFLICT DO UPDATE で一括upsert
//   - 3000行/バッチでも数秒で完了
// =============================================================

export const maxDuration = 120;

import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";
import {
  type AttendanceCsvRow,
  normalizeTime,
  parseDate,
  parseTimeToMinutes,
} from "@/lib/touchontime-mapper";
export async function POST(request: NextRequest) {
  try {
    const { db, tenantId } = await getTenantDb();

    const body = await request.json();
    const rows = body.rows as AttendanceCsvRow[] | undefined;
    const defaultStoreId = body.defaultStoreId as string | null | undefined;

    if (!rows || rows.length === 0) {
      return apiError("データがありません", 400);
    }

    // マスタ取得（1クエリずつ）
    const employees = await db.employee.findMany({
      select: { id: true, code: true, storeId: true, hourlyWage: true },
    });
    type EmpRecord = { id: string; code: string; storeId: string; hourlyWage: number | null };
    const empByCode = new Map<string, EmpRecord>(
      employees.map((e: EmpRecord) => [e.code, e])
    );

    const stores = await db.store.findMany({ select: { id: true, name: true } });
    const storeByName = new Map<string, string>(
      stores.map((s: { name: string; id: string }) => [s.name, s.id])
    );
    const fallbackStoreId = defaultStoreId || stores[0]?.id;

    let skipped = 0;
    const importErrors: string[] = [];

    // ========================================
    // Phase 1: 全行をパースして配列に
    // ========================================
    const values: {
      tenantId: string;
      employeeId: string;
      storeId: string;
      attendanceDate: Date;
      clockIn: Date | null;
      clockOut: Date | null;
      actualBreakMinutes: number;
      status: string;
      lateMinutes: number;
      earlyLeaveMinutes: number;
      overtimeMinutes: number;
      totalWorkMinutes: number;
      laborCost: number | null;
      note: string | null;
    }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.employeeCode || !row.date) {
        skipped++;
        continue;
      }

      try {
        const emp = empByCode.get(row.employeeCode.trim());
        if (!emp) {
          if (importErrors.length < 50) {
            importErrors.push(`行${i + 2}: 従業員コード「${row.employeeCode}」が見つかりません`);
          }
          skipped++;
          continue;
        }

        const attendanceDate = parseDate(row.date);
        if (!attendanceDate) {
          if (importErrors.length < 50) {
            importErrors.push(`行${i + 2}: 日付「${row.date}」が不正です`);
          }
          skipped++;
          continue;
        }

        const clockInStr = normalizeTime(row.clockIn);
        const clockOutStr = normalizeTime(row.clockOut);

        if (!clockInStr && !clockOutStr && !row.totalWork) {
          skipped++;
          continue;
        }

        let clockIn: Date | null = null;
        let clockOut: Date | null = null;

        if (clockInStr) {
          const [h, m] = clockInStr.split(":").map(Number);
          clockIn = new Date(attendanceDate);
          clockIn.setHours(h, m, 0, 0);
        }

        if (clockOutStr) {
          const [h, m] = clockOutStr.split(":").map(Number);
          clockOut = new Date(attendanceDate);
          clockOut.setHours(h, m, 0, 0);
          if (clockIn && clockOut <= clockIn) {
            clockOut.setDate(clockOut.getDate() + 1);
          }
        }

        const breakMinutes = parseTimeToMinutes(row.breakTime);
        const overtimeMinutes = parseTimeToMinutes(row.overtime);
        const lateMinutes = parseTimeToMinutes(row.lateMinutes);
        const earlyLeaveMinutes = parseTimeToMinutes(row.earlyLeave);

        let totalWorkMinutes = parseTimeToMinutes(row.totalWork);
        if (totalWorkMinutes === 0 && clockIn && clockOut) {
          totalWorkMinutes = Math.round((clockOut.getTime() - clockIn.getTime()) / 60000) - breakMinutes;
          if (totalWorkMinutes < 0) totalWorkMinutes = 0;
        }

        let laborCost: number | null = null;
        if (emp.hourlyWage && totalWorkMinutes > 0) {
          laborCost = Math.round((emp.hourlyWage * totalWorkMinutes) / 60);
        }

        let status = "CLOCKED_OUT";
        if (lateMinutes > 0) status = "LATE";
        else if (earlyLeaveMinutes > 0) status = "EARLY_LEAVE";
        else if (!clockIn && !clockOut) status = "ABSENT";

        let storeId: string = emp.storeId;
        if (row.storeName) {
          for (const [name, id] of storeByName.entries()) {
            if ((name as string).includes(row.storeName) || row.storeName.includes(name as string)) {
              storeId = id as string;
              break;
            }
          }
        }
        if (!storeId) storeId = fallbackStoreId!;

        values.push({
          tenantId,
          employeeId: emp.id,
          storeId,
          attendanceDate,
          clockIn,
          clockOut,
          actualBreakMinutes: breakMinutes,
          status,
          lateMinutes,
          earlyLeaveMinutes,
          overtimeMinutes,
          totalWorkMinutes,
          laborCost,
          note: row.note || null,
        });
      } catch (err) {
        if (importErrors.length < 50) {
          importErrors.push(`行${i + 2}: ${err instanceof Error ? err.message : "不明なエラー"}`);
        }
        skipped++;
      }
    }

    if (values.length === 0) {
      return apiSuccess({ created: 0, updated: 0, skipped, total: rows.length, errors: importErrors });
    }

    // ========================================
    // Phase 2: 一括 INSERT ON CONFLICT DO UPDATE
    // PostgreSQL の一発upsertで数千行を一気に処理
    // ========================================
    const CHUNK_SIZE = 500; // パラメータ数制限のため分割（500行 × 14列 = 7000パラメータ）
    let totalUpserted = 0;

    for (let c = 0; c < values.length; c += CHUNK_SIZE) {
      const chunk = values.slice(c, c + CHUNK_SIZE);

      // VALUES句のプレースホルダーを動的生成
      const paramOffset = 0;
      const valuesPlaceholders: string[] = [];
      const params: (string | number | Date | null)[] = [];

      for (let i = 0; i < chunk.length; i++) {
        const v = chunk[i];
        const base = paramOffset + i * 14;
        valuesPlaceholders.push(
          `(gen_random_uuid(), $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::date, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::"AttendanceStatus", $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, NOW(), NOW())`
        );
        params.push(
          v.tenantId,           // $1
          v.employeeId,         // $2
          v.storeId,            // $3
          v.attendanceDate,     // $4
          v.clockIn,            // $5
          v.clockOut,           // $6
          v.actualBreakMinutes, // $7
          v.status,             // $8
          v.lateMinutes,        // $9
          v.earlyLeaveMinutes,  // $10
          v.overtimeMinutes,    // $11
          v.totalWorkMinutes,   // $12
          v.laborCost,          // $13
          v.note,               // $14
        );
      }

      const sql = `
        INSERT INTO "attendance_records" (
          "id", "tenantId", "employeeId", "storeId", "attendanceDate",
          "clockIn", "clockOut", "actualBreakMinutes", "status",
          "lateMinutes", "earlyLeaveMinutes", "overtimeMinutes",
          "totalWorkMinutes", "laborCost", "note", "createdAt", "updatedAt"
        ) VALUES ${valuesPlaceholders.join(",\n")}
        ON CONFLICT ("tenantId", "employeeId", "attendanceDate")
        DO UPDATE SET
          "storeId"            = EXCLUDED."storeId",
          "clockIn"            = EXCLUDED."clockIn",
          "clockOut"           = EXCLUDED."clockOut",
          "actualBreakMinutes" = EXCLUDED."actualBreakMinutes",
          "status"             = EXCLUDED."status",
          "lateMinutes"        = EXCLUDED."lateMinutes",
          "earlyLeaveMinutes"  = EXCLUDED."earlyLeaveMinutes",
          "overtimeMinutes"    = EXCLUDED."overtimeMinutes",
          "totalWorkMinutes"   = EXCLUDED."totalWorkMinutes",
          "laborCost"          = EXCLUDED."laborCost",
          "note"               = EXCLUDED."note",
          "updatedAt"          = NOW()
      `;

      try {
        await db.$executeRawUnsafe(sql, ...params);
        totalUpserted += chunk.length;
      } catch (err) {
        // raw SQLが失敗した場合、Prisma個別フォールバック
        console.error("Bulk upsert error, falling back to individual:", err);
        for (const v of chunk) {
          try {
            await db.attendanceRecord.upsert({
              where: {
                tenantId_employeeId_attendanceDate: {
                  tenantId: v.tenantId,
                  employeeId: v.employeeId,
                  attendanceDate: v.attendanceDate,
                },
              },
              update: {
                storeId: v.storeId,
                clockIn: v.clockIn,
                clockOut: v.clockOut,
                actualBreakMinutes: v.actualBreakMinutes,
                status: v.status as any, // eslint-disable-line
                lateMinutes: v.lateMinutes,
                earlyLeaveMinutes: v.earlyLeaveMinutes,
                overtimeMinutes: v.overtimeMinutes,
                totalWorkMinutes: v.totalWorkMinutes,
                laborCost: v.laborCost,
                note: v.note,
              },
              create: {
                tenantId: v.tenantId,
                employeeId: v.employeeId,
                storeId: v.storeId,
                attendanceDate: v.attendanceDate,
                clockIn: v.clockIn,
                clockOut: v.clockOut,
                actualBreakMinutes: v.actualBreakMinutes,
                status: v.status as any, // eslint-disable-line
                lateMinutes: v.lateMinutes,
                earlyLeaveMinutes: v.earlyLeaveMinutes,
                overtimeMinutes: v.overtimeMinutes,
                totalWorkMinutes: v.totalWorkMinutes,
                laborCost: v.laborCost,
                note: v.note,
              },
            });
            totalUpserted++;
          } catch (innerErr) {
            if (importErrors.length < 50) {
              importErrors.push(`upsertエラー: ${innerErr instanceof Error ? innerErr.message : "不明"}`);
            }
            skipped++;
          }
        }
      }
    }

    return apiSuccess({
      created: totalUpserted, // upsertのため新規/更新の区別なし
      updated: 0,
      skipped,
      total: rows.length,
      errors: importErrors,
    });
  } catch (error) {
    console.error("POST /api/import/attendance error:", error);
    return apiError("勤怠インポートに失敗しました", 500);
  }
}

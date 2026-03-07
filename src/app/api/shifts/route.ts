// =============================================================
// シフト CRUD API
// GET  /api/shifts - シフト一覧取得
// POST /api/shifts - シフト作成
// 店舗ユーザーは自店舗のみ、本部は全店舗アクセス可
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { requireAuth, requireRole } from "@/lib/auth-utils";
import { shiftCreateSchema, shiftQuerySchema } from "@/lib/validations/shift";
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiPaginated,
} from "@/lib/api-response";

// シフト一覧取得
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const requestedStoreId = url.searchParams.get("storeId") || undefined;

    const auth = await requireAuth(requestedStoreId);
    if (auth.error) return auth.error;

    const { db } = await getTenantDb();

    // クエリパラメータ取得（storeIdは権限チェック済みの値を使用）
    const params = {
      storeId: auth.effectiveStoreId || undefined,
      startDate: url.searchParams.get("startDate") || "",
      endDate: url.searchParams.get("endDate") || "",
      departmentId: url.searchParams.get("departmentId") || undefined,
      employeeId: url.searchParams.get("employeeId") || undefined,
      status: url.searchParams.get("status") || undefined,
    };

    // バリデーション
    const parsed = shiftQuerySchema.safeParse(params);
    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    const { storeId, startDate, endDate, departmentId, employeeId, status } =
      parsed.data;
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "100");

    const where = {
      ...(storeId && { storeId }),
      shiftDate: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
      ...(departmentId && { departmentId }),
      ...(employeeId && { employeeId }),
      ...(status && { status }),
    };

    const [shifts, total] = await Promise.all([
      db.shift.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              code: true,
              lastName: true,
              firstName: true,
              employmentType: true,
              hourlyWage: true,
            },
          },
          department: {
            select: { id: true, name: true, code: true },
          },
        },
        orderBy: [{ shiftDate: "asc" }, { startTime: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.shift.count({ where }),
    ]);

    return apiPaginated(shifts, total, page, limit);
  } catch (error) {
    console.error("GET /api/shifts error:", error);
    return apiError("シフトの取得に失敗しました", 500);
  }
}

// シフト作成（STORE_MANAGER以上のみ）
export async function POST(request: NextRequest) {
  try {
    const roleCheck = await requireRole("STORE_MANAGER");
    if (roleCheck.error) return roleCheck.error;

    const { db } = await getTenantDb();
    const body = await request.json();

    const parsed = shiftCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    const data = parsed.data;

    // 同一従業員の同日シフト重複チェック
    const existing = await db.shift.findFirst({
      where: {
        employeeId: data.employeeId,
        shiftDate: new Date(data.shiftDate),
      },
    });

    if (existing) {
      return apiError(
        "この従業員には同日に既にシフトが登録されています",
        409
      );
    }

    // 人件費の自動計算
    const employee = await db.employee.findFirst({
      where: { id: data.employeeId },
    });

    let laborCost: number | null = null;
    if (employee?.hourlyWage) {
      const [startH, startM] = data.startTime.split(":").map(Number);
      const [endH, endM] = data.endTime.split(":").map(Number);
      const workMinutes =
        endH * 60 + endM - (startH * 60 + startM) - data.breakMinutes;
      laborCost = Math.round((employee.hourlyWage * workMinutes) / 60);
    }

    const shift = await db.shift.create({
      data: {
        employeeId: data.employeeId,
        storeId: data.storeId,
        departmentId: data.departmentId,
        shiftDate: new Date(data.shiftDate),
        startTime: data.startTime,
        endTime: data.endTime,
        breakMinutes: data.breakMinutes,
        isHelpShift: data.isHelpShift,
        note: data.note,
        laborCost,
      },
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            lastName: true,
            firstName: true,
            employmentType: true,
            hourlyWage: true,
          },
        },
        department: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    return apiSuccess(shift, 201);
  } catch (error) {
    console.error("POST /api/shifts error:", error);
    return apiError("シフトの作成に失敗しました", 500);
  }
}

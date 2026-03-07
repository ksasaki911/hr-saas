// =============================================================
// シフト希望 API
// GET  /api/shift-requests - 希望一覧
// POST /api/shift-requests - 希望提出
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { shiftRequestCreateSchema } from "@/lib/validations/shift";
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiPaginated,
} from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const url = new URL(request.url);

    const storeId = url.searchParams.get("storeId");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const employeeId = url.searchParams.get("employeeId");

    const where: Record<string, unknown> = {};
    if (storeId) where.storeId = storeId;
    if (startDate && endDate) {
      where.targetDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }
    if (employeeId) {
      where.employeeId = employeeId;
    }

    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "100");

    const [requests, total] = await Promise.all([
      db.shiftRequest.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              code: true,
              lastName: true,
              firstName: true,
            },
          },
        },
        orderBy: [{ targetDate: "asc" }, { employee: { code: "asc" } }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.shiftRequest.count({ where }),
    ]);

    return apiPaginated(requests, total, page, limit);
  } catch (error) {
    console.error("GET /api/shift-requests error:", error);
    return apiError("シフト希望の取得に失敗しました", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const body = await request.json();

    const parsed = shiftRequestCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    const data = parsed.data;

    // 同一従業員の同日希望は上書き（upsert）
    const shiftRequest = await db.shiftRequest.upsert({
      where: {
        tenantId_employeeId_targetDate: {
          tenantId: "", // テナントExtensionが自動注入
          employeeId: data.employeeId,
          targetDate: new Date(data.targetDate),
        },
      },
      update: {
        requestType: data.requestType,
        startTime: data.startTime,
        endTime: data.endTime,
        note: data.note,
      },
      create: {
        employeeId: data.employeeId,
        storeId: data.storeId,
        targetDate: new Date(data.targetDate),
        requestType: data.requestType,
        startTime: data.startTime,
        endTime: data.endTime,
        note: data.note,
      },
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            lastName: true,
            firstName: true,
          },
        },
      },
    });

    return apiSuccess(shiftRequest, 201);
  } catch (error) {
    console.error("POST /api/shift-requests error:", error);
    return apiError("シフト希望の登録に失敗しました", 500);
  }
}

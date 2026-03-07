// =============================================================
// 会社カレンダーAPI（CRUD）
// =============================================================
import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const url = new URL(req.url);
    const storeId = url.searchParams.get("storeId");
    const year = url.searchParams.get("year");

    const where: Record<string, unknown> = {};
    if (storeId) where.storeId = storeId;
    if (year) {
      where.calendarDate = {
        gte: new Date(`${year}-01-01`),
        lte: new Date(`${year}-12-31`),
      };
    }

    const calendars = await db.companyCalendar.findMany({
      where,
      include: { store: { select: { name: true } } },
      orderBy: { calendarDate: "asc" },
    });

    return NextResponse.json(calendars);
  } catch (e) {
    console.error("GET /api/company-calendar error:", e);
    return NextResponse.json({ error: "取得失敗" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db } = await getTenantDb();
    const body = await req.json();
    const { entries } = body as {
      entries: {
        storeId?: string | null;
        calendarDate: string;
        dayType: string;
        name?: string;
        note?: string;
      }[];
    };

    if (!entries || !Array.isArray(entries)) {
      return NextResponse.json({ error: "entries配列が必要です" }, { status: 400 });
    }

    const results = [];
    for (const entry of entries) {
      const result = await db.companyCalendar.upsert({
        where: {
          tenantId_storeId_calendarDate: {
            tenantId: "",
            storeId: entry.storeId || "",
            calendarDate: new Date(entry.calendarDate),
          },
        },
        update: {
          dayType: entry.dayType,
          name: entry.name || null,
          note: entry.note || null,
        },
        create: {
          storeId: entry.storeId || null,
          calendarDate: new Date(entry.calendarDate),
          dayType: entry.dayType,
          name: entry.name || null,
          note: entry.note || null,
        },
      });
      results.push(result);
    }

    return NextResponse.json({ count: results.length, results });
  } catch (e) {
    console.error("POST /api/company-calendar error:", e);
    return NextResponse.json({ error: "登録失敗" }, { status: 500 });
  }
}

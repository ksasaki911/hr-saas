import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await getTenantDb();
    const { id } = await params;
    await db.companyCalendar.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/company-calendar/[id] error:", e);
    return NextResponse.json({ error: "削除失敗" }, { status: 500 });
  }
}

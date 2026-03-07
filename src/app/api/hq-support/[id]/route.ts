// =============================================================
// 本部応援 個別API
// PATCH  - ステータス更新
// DELETE - 削除
// =============================================================
import { NextRequest } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await getTenantDb();
    const { id } = await params;
    const body = await request.json();

    const updated = await db.headquartersSupport.update({
      where: { id },
      data: body,
    });

    return apiSuccess(updated, "本部応援を更新しました");
  } catch (error) {
    console.error("PATCH /api/hq-support/[id] error:", error);
    return apiError("本部応援の更新に失敗しました", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await getTenantDb();
    const { id } = await params;

    await db.headquartersSupport.delete({ where: { id } });

    return apiSuccess(null, "本部応援を削除しました");
  } catch (error) {
    console.error("DELETE /api/hq-support/[id] error:", error);
    return apiError("本部応援の削除に失敗しました", 500);
  }
}

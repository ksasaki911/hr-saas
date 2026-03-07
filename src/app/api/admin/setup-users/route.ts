// =============================================================
// 初期ユーザーセットアップ API
// POST /api/admin/setup-users
// テストユーザーを作成する（開発用）
// =============================================================
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    // テナント取得
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      return apiError("テナントが見つかりません", 404);
    }

    // 店舗取得（泉店）
    const store = await prisma.store.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { code: "asc" },
    });

    const results: string[] = [];

    // --- 本部管理者ユーザー ---
    const adminEmail = "admin@marue.co.jp";
    const existingAdmin = await prisma.user.findFirst({
      where: { email: adminEmail, tenantId: tenant.id },
    });

    if (!existingAdmin) {
      const hash = await bcrypt.hash("admin123", 10);
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: adminEmail,
          passwordHash: hash,
          role: "TENANT_ADMIN",
          isActive: true,
        },
      });
      results.push(`本部管理者を作成: ${adminEmail}`);
    } else {
      // パスワードを更新
      const hash = await bcrypt.hash("admin123", 10);
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: { passwordHash: hash, role: "TENANT_ADMIN" },
      });
      results.push(`本部管理者を更新: ${adminEmail}`);
    }

    // --- 店舗店長ユーザー ---
    if (store) {
      const storeMgrEmail = "izumi@marue.co.jp";
      const existingMgr = await prisma.user.findFirst({
        where: { email: storeMgrEmail, tenantId: tenant.id },
      });

      // 店長に紐づける従業員を探す
      const storeEmployee = await prisma.employee.findFirst({
        where: { tenantId: tenant.id, storeId: store.id, employmentType: "FULL_TIME" },
        orderBy: { code: "asc" },
      });

      if (!existingMgr) {
        const hash = await bcrypt.hash("store123", 10);
        await prisma.user.create({
          data: {
            tenantId: tenant.id,
            email: storeMgrEmail,
            passwordHash: hash,
            role: "STORE_MANAGER",
            isActive: true,
            ...(storeEmployee ? { employeeId: storeEmployee.id } : {}),
          },
        });
        results.push(`店長ユーザーを作成: ${storeMgrEmail} (店舗: ${store.name})`);
      } else {
        const hash = await bcrypt.hash("store123", 10);
        await prisma.user.update({
          where: { id: existingMgr.id },
          data: {
            passwordHash: hash,
            role: "STORE_MANAGER",
            ...(storeEmployee ? { employeeId: storeEmployee.id } : {}),
          },
        });
        results.push(`店長ユーザーを更新: ${storeMgrEmail}`);
      }
    }

    return apiSuccess({ message: "ユーザーセットアップ完了", results });
  } catch (error) {
    console.error("POST /api/admin/setup-users error:", error);
    return apiError("ユーザーセットアップに失敗しました: " + String(error), 500);
  }
}

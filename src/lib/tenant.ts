import { headers } from "next/headers";
import { prisma, createTenantPrisma } from "./prisma";

export async function getTenantId(request?: Request): Promise<string | null> {
  if (request) {
    const tenantId = request.headers.get("x-tenant-id");
    if (tenantId) return tenantId;

    const host = request.headers.get("host") || "";
    const subdomain = host.split(".")[0];
    if (subdomain && subdomain !== "localhost" && subdomain !== "www") {
      const tenant = await prisma.tenant.findFirst({
        where: { subdomain },
      });
      if (tenant) return tenant.id;
    }
  }

  try {
    const headersList = await headers();
    const tenantId = headersList.get("x-tenant-id");
    if (tenantId) return tenantId;
  } catch {}

  if (process.env.NODE_ENV === "development") {
    const defaultTenant = await prisma.tenant.findFirst();
    if (defaultTenant) return defaultTenant.id;
  }

  return null;
}

export async function getTenantDb(request?: Request) {
  const tenantId = await getTenantId(request);
  if (!tenantId) {
    throw new Error("テナントが特定できません");
  }
  const db = createTenantPrisma(tenantId);
  return { db, tenantId };
}

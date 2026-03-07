// =============================================================
// Prisma Client シングルトン + マルチテナント拡張
// Prisma v7: adapter パターン
// =============================================================
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({
    connectionString,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// =============================================================
// マルチテナント用 Prisma Client Extension
// 全クエリに自動的に tenantId フィルタを付与する
// =============================================================
export function createTenantPrisma(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        async findMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findFirst({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async findUnique({ args, query }: any) {
          return query(args);
        },
        async create({ args, query }: any) {
          args.data = { ...args.data, tenantId };
          return query(args);
        },
        async createMany({ args, query }: any) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: any) => ({ ...d, tenantId }));
          } else {
            args.data = { ...args.data, tenantId };
          }
          return query(args);
        },
        async update({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async updateMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async delete({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async deleteMany({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        async count({ args, query }: any) {
          args.where = { ...args.where, tenantId };
          return query(args);
        },
        /* eslint-enable @typescript-eslint/no-explicit-any */
      },
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TenantPrismaClient = any;

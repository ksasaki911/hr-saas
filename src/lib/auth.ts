// =============================================================
// NextAuth.js 設定
// Credentials Provider + JWT 戦略
// =============================================================
import type { NextAuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

// セッションに含めるユーザー情報
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  role: string;
  storeId: string | null;
  employeeId: string | null;
}

declare module "next-auth" {
  interface Session {
    user: SessionUser;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    email: string;
    name: string;
    tenantId: string;
    role: string;
    storeId: string | null;
    employeeId: string | null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "メールアドレス", type: "email" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("メールアドレスとパスワードを入力してください");
        }

        // ユーザー検索（テナント横断 — ログイン時はメールで一意特定）
        const user = await prisma.user.findFirst({
          where: { email: credentials.email, isActive: true },
          include: {
            tenant: true,
            employee: {
              select: { id: true, storeId: true, lastName: true, firstName: true },
            },
          },
        });

        if (!user) {
          throw new Error("メールアドレスまたはパスワードが正しくありません");
        }

        // パスワード検証
        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          throw new Error("メールアドレスまたはパスワードが正しくありません");
        }

        // storeId: Employee に紐づく店舗、または本部ロールなら null
        const storeId = user.employee?.storeId || null;
        const empName = user.employee
          ? `${user.employee.lastName}${user.employee.firstName}`
          : user.email.split("@")[0];

        return {
          id: user.id,
          email: user.email,
          name: empName,
          tenantId: user.tenantId,
          role: user.role,
          storeId,
          employeeId: user.employee?.id || null,
        };
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24時間
  },

  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user }: any) {
      if (user) {
        // 初回ログイン時にJWTにユーザー情報を格納
        token.userId = user.id;
        token.email = user.email;
        token.name = user.name;
        token.tenantId = user.tenantId;
        token.role = user.role;
        token.storeId = user.storeId;
        token.employeeId = user.employeeId;
      }
      return token;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: any) {
      session.user = {
        id: token.userId,
        email: token.email,
        name: token.name,
        tenantId: token.tenantId,
        role: token.role,
        storeId: token.storeId,
        employeeId: token.employeeId,
      };
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET || "dev-secret-change-in-production",
};

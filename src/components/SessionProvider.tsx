"use client";

import { SessionProvider as NextSessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function SessionProvider({ children }: { children: ReactNode }) {
  return <NextSessionProvider>{children}</NextSessionProvider>;
}

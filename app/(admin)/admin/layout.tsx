import type { ReactNode } from "react";

import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";

import { UnauthenticatedError } from "@/src/modules/access-control/services";
import { AdminShell, getAdminWorkspaceContext } from "@/src/modules/admin";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await connection();

  let context;
  try {
    context = await getAdminWorkspaceContext();
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/auth/sign-in");
    notFound();
  }

  return <AdminShell context={context}>{children}</AdminShell>;
}

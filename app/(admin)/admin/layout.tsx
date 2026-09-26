import type { ReactNode } from "react";
import type { Metadata } from "next";

import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";

import { UnauthenticatedError } from "@/src/modules/access-control/services";
import {
  AdminShell,
  createAdminActionCenterService,
  getAdminWorkspaceContext,
} from "@/src/modules/admin";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await connection();

  let context;
  try {
    context = await getAdminWorkspaceContext();
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/auth/sign-in");
    notFound();
  }

  const notificationCenter = await createAdminActionCenterService()
    .getActionCenter(context.permissions);

  return (
    <AdminShell context={context} notificationCenter={notificationCenter}>
      {children}
    </AdminShell>
  );
}

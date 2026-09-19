import { redirect } from "next/navigation";

import { isUnifiedAuthCenterEnabled } from "@/src/modules/auth/access-context";
import { CustomerAuthEntry } from "@/src/modules/auth/components";

export default function CustomerAuthPage() {
  if (!isUnifiedAuthCenterEnabled()) redirect("/account/sign-in");
  return <CustomerAuthEntry />;
}

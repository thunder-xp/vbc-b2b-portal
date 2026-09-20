import { redirect } from "next/navigation";

import { isUnifiedAuthCenterEnabled } from "@/src/modules/auth/access-context";
import { CustomerAuthEntry } from "@/src/modules/auth/components";
import { isPhoneFirstQuickAuthEnabled } from "@/src/modules/quick-auth/factory";

export default function CustomerAuthPage() {
  if (!isUnifiedAuthCenterEnabled()) redirect("/account/sign-in");
  if (!isPhoneFirstQuickAuthEnabled()) redirect("/account/sign-in");
  return <CustomerAuthEntry />;
}

import { redirect } from "next/navigation";

import { isUnifiedAuthCenterEnabled } from "@/src/modules/auth/access-context";
import { UnifiedAuthCenter } from "@/src/modules/auth/components";

export default function AuthCenterPage() {
  if (!isUnifiedAuthCenterEnabled()) redirect("/auth/sign-in");
  return <UnifiedAuthCenter />;
}

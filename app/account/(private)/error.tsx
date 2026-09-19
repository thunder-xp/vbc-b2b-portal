"use client";

import { useSearchParams } from "next/navigation";

import { CabinetErrorState } from "@/src/modules/cabinet-experience/components";

export default function AccountError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ro = useSearchParams().get("lang") === "ro";
  return <CabinetErrorState homeHref="/account" reset={reset} ro={ro} />;
}

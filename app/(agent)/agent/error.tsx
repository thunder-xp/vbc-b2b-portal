"use client";

import { useSearchParams } from "next/navigation";

import { CabinetErrorState } from "@/src/modules/cabinet-experience/components";

export default function AgentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ro = useSearchParams().get("lang") === "ro";
  return <CabinetErrorState homeHref="/agent" reset={reset} ro={ro} />;
}

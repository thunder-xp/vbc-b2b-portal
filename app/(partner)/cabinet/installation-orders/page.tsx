import { redirect } from "next/navigation";

export default async function LegacyInstallationOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; result?: string }>;
}) {
  const query = await searchParams;
  const view = query.view === "active" || query.view === "completed" ? query.view : "new";
  const result = query.result ? `&result=${encodeURIComponent(query.result)}` : "";
  redirect(`/cabinet/installation-marketplace?view=${view}${result}`);
}

import { redirect } from "next/navigation";

import { publicRetailLocale } from "@/src/modules/public-retail/presentation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LegacyProfessionalRegisterPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const locale = publicRetailLocale(query.lang);
  const intent = singleValue(query.intent);

  if (intent !== "agent" && intent !== "installer") {
    redirect(`/become-partner?lang=${locale}`);
  }

  redirect(`/auth/register/${intent}?lang=${locale}`);
}

function singleValue(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

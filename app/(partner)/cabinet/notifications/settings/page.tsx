import Link from "next/link";

import { getNotificationPreferencesAction } from "@/src/modules/notifications/actions";
import { NotificationPreferences } from "@/src/modules/notifications/components";
import { notificationCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const [result, locale] = await Promise.all([getNotificationPreferencesAction(), getPartnerLocale()]);
  const copy = notificationCopy(locale);
  return (
    <section className="mx-auto w-full max-w-4xl space-y-5">
      <header>
        <Link className="text-sm font-medium text-emerald-700" href="/cabinet/notifications">← {copy.title}</Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">{copy.settingsTitle}</h1>
        <p className="mt-2 text-sm text-zinc-600">{copy.settingsIntro}</p>
      </header>
      {result.success ? <NotificationPreferences preferences={result.data} /> : (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{copy.settingsLoadError}</p>
      )}
    </section>
  );
}

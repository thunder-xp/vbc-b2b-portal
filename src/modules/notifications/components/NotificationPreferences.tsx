"use client";

import { Lock, Mail, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setNotificationPreferenceAction } from "../actions/notification.actions";
import { recordBehaviorInteraction } from "../../behavior-analytics/components";
import { notificationCopy, usePartnerLocale } from "../../partner-locale";
import type { NotificationDeliveryMode, NotificationPreference } from "../types";

const groupKeys = {
  orders: "groupOrders",
  shipments: "groupShipments",
  company_access: "groupAccess",
  products: "groupProducts",
  commercial: "groupCommercial",
  documents: "groupDocuments",
  service: "groupService",
} as const;

export function NotificationPreferences({ preferences }: { preferences: NotificationPreference[] }) {
  const copy = notificationCopy(usePartnerLocale());
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {preferences.map((preference) => {
        const optional = ["products", "documents"].includes(preference.eventGroup);
        return (
          <section className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5" key={preference.eventGroup}>
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <h2 className="font-semibold text-zinc-950">{copy[groupKeys[preference.eventGroup]]}</h2>
                <p className="mt-1 text-sm text-zinc-600">{copy.groupDescription}</p>
              </div>
              {optional ? (
                <span className="text-sm font-medium text-zinc-600">{copy.optional}</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700"><Lock aria-hidden="true" size={15} />{copy.enabled}</span>
              )}
            </div>
            <div className="mt-4 grid gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-zinc-800">
                {copy.deliveryMode}
                <select
                  className="mt-1 h-11 w-full rounded-md border border-zinc-300 bg-white px-3 disabled:bg-zinc-50"
                  defaultValue={availableMode(preference.eventGroup, preference.deliveryMode)}
                  disabled={pending}
                  onChange={(event) => {
                    const mode = event.target.value as NotificationDeliveryMode;
                    setSaved(null);
                    startTransition(async () => {
                      const result = await setNotificationPreferenceAction(preference.eventGroup, mode);
                      setSaved(result.success ? preference.eventGroup : "error");
                      if (result.success) {
                        recordBehaviorInteraction({ eventName: "notification_preferences_updated", route: "/cabinet/notifications/settings", sourceSurface: "notification_settings", metadataSafe: { eventGroup: preference.eventGroup } });
                        router.refresh();
                      }
                    });
                  }}
                >
                  <option value="immediate">{copy.immediate}</option>
                  <option disabled value="daily">{copy.daily}</option>
                  <option disabled={!optional} value="off">{copy.off}</option>
                </select>
              </label>
              <div className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-600">
                <p className="flex items-center gap-2 font-medium text-zinc-800"><Mail aria-hidden="true" size={16} />Email</p>
                <p className="mt-1">{copy.emailLater}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-zinc-500">{copy.dailyLater}</p>
            {saved === preference.eventGroup && <p aria-live="polite" className="mt-2 inline-flex items-center gap-1 text-sm text-emerald-700"><Save aria-hidden="true" size={14} />{copy.saved}</p>}
            {saved === "error" && <p aria-live="polite" className="mt-2 text-sm text-rose-700">{copy.saveError}</p>}
          </section>
        );
      })}
    </div>
  );
}

function availableMode(eventGroup: NotificationPreference["eventGroup"], mode: NotificationDeliveryMode): "immediate" | "off" {
  return ["products", "documents"].includes(eventGroup) && mode === "off" ? "off" : "immediate";
}

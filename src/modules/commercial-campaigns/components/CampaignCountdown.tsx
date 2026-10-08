"use client";

import { useEffect, useState } from "react";
import type { PartnerLocale } from "@/src/modules/partner-locale";

/** Monotonic presentation countdown. No client wall clock, polling, or live eligibility. */
export function CampaignCountdown({ remainingSeconds, locale = "ru", compact = false }: {
  remainingSeconds: number; locale?: PartnerLocale; compact?: boolean;
}) {
  const [remaining, setRemaining] = useState(remainingSeconds);
  useEffect(() => {
    const started = performance.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const next = Math.max(0, remainingSeconds - Math.floor((performance.now() - started) / 1000));
      setRemaining(next);
      if (next > 0) timer = setTimeout(tick, 1000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [remainingSeconds]);
  const ro = locale === "ro";
  if (remaining === 0) return <p className="text-xs font-medium text-zinc-600">{ro ? "Oferta a expirat" : "Предложение завершено"}</p>;
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor(remaining % 86400 / 3600);
  const minutes = Math.floor(remaining % 3600 / 60);
  const seconds = remaining % 60;
  const description = ro ? `${days} zile ${hours} ore ${minutes} minute ${seconds} secunde` : `${days} дн. ${hours} ч. ${minutes} мин. ${seconds} сек.`;
  return <div data-time-band={remaining < 86400 ? "under-24h" : remaining <= 259200 ? "24-72h" : "over-72h"} className={`tabular-nums ${remaining < 86400 ? "text-amber-900" : remaining <= 259200 ? "text-amber-800" : "text-zinc-600"}`}>
    {compact ? <p className="text-xs font-semibold" aria-label={description}>{ro ? "Mai sunt:" : "До конца:"} {days} {ro ? "z." : "дн."} {hours} {ro ? "h." : "ч."}{days === 0 && hours === 0 ? ` ${minutes} ${ro ? "min." : "мин."}` : ""}</p> : <>
      <p className="text-xs font-medium">{ro ? "Până la sfârșitul ofertei:" : "До конца предложения осталось:"}</p>
      <div aria-label={description} className="mt-2 flex flex-wrap gap-2">
        {[days, hours, minutes, seconds].map((value, index) => <div aria-hidden="true" className="min-w-12 rounded border border-zinc-200 bg-zinc-50 px-2 py-2 text-center" key={index}>
          <b className="block text-xl font-semibold">{String(value).padStart(2, "0")}</b><span className="text-[10px] text-zinc-600">{(ro ? ["zile", "ore", "minute", "secunde"] : ["дней", "часов", "минут", "секунд"])[index]}</span>
        </div>)}
      </div>
    </>}
  </div>;
}

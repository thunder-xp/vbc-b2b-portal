export const COMMERCIAL_FRESHNESS_THRESHOLDS_MS = {
  stock: { fresh: 2.5 * 60 * 60 * 1000, stale: 5 * 60 * 60 * 1000 },
  activeOrder: { fresh: 30 * 60 * 1000, stale: 2 * 60 * 60 * 1000 },
  price: { fresh: 26 * 60 * 60 * 1000, stale: 36 * 60 * 60 * 1000 },
} as const;

export type FreshnessStatus = "fresh" | "aging" | "stale" | "unknown";

export type FreshnessView = {
  status: FreshnessStatus;
  updatedAt: string | null;
  label: string;
  staleNotice: string | null;
};

export function evaluateFreshness(
  updatedAt: string | null | undefined,
  domain: keyof typeof COMMERCIAL_FRESHNESS_THRESHOLDS_MS,
  noun: string,
  now = Date.now(),
): FreshnessView {
  const timestamp = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  if (!Number.isFinite(timestamp)) {
    return { status: "unknown", updatedAt: null, label: `${noun}: время обновления неизвестно`, staleNotice: "Показаны последние подтверждённые данные" };
  }
  const age = Math.max(0, now - timestamp);
  const thresholds = COMMERCIAL_FRESHNESS_THRESHOLDS_MS[domain];
  const status: FreshnessStatus = age < thresholds.fresh ? "fresh" : age <= thresholds.stale ? "aging" : "stale";
  return {
    status,
    updatedAt: new Date(timestamp).toISOString(),
    label: `${noun} обновлены ${formatRelativeAge(age)} назад`,
    staleNotice: status === "stale" ? "Данные давно не обновлялись. Показаны последние подтверждённые данные" : null,
  };
}

export function isStale(updatedAt: string | null | undefined, domain: "stock" | "price", now = Date.now()): boolean {
  return evaluateFreshness(updatedAt, domain, "Данные", now).status === "stale" || !updatedAt;
}

function formatRelativeAge(ageMs: number): string {
  const minutes = Math.max(0, Math.floor(ageMs / 60_000));
  if (minutes < 60) return `${minutes} ${plural(minutes, "минуту", "минуты", "минут")}`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ${plural(hours, "час", "часа", "часов")}`;
}

function plural(value: number, one: string, few: string, many: string): string {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

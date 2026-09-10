export const ROLLING_PERIODS = [30, 60, 90] as const;
export const EFFECTIVE_ROLLING_PERIODS = [30, 60, 90, 365] as const;
/** @deprecated 365 is an effective window, never a visible selector option. */
export const NEW_ROLLING_PERIODS = EFFECTIVE_ROLLING_PERIODS;

export type RollingPeriod = (typeof ROLLING_PERIODS)[number];
export type EffectiveRollingPeriod = (typeof EFFECTIVE_ROLLING_PERIODS)[number];
export type NewRollingPeriod = EffectiveRollingPeriod;
export type RollingPeriodState = RollingPeriod | null;

export const DEFAULT_ROLLING_PERIOD: RollingPeriod = 30;
export const DEFAULT_NEW_ROLLING_PERIOD: NewRollingPeriod = 365;

export function parseRollingPeriodState(value: string | number | undefined | null): RollingPeriodState {
  const parsed = typeof value === "number" ? value : Number(value);
  return ROLLING_PERIODS.includes(parsed as RollingPeriod)
    ? parsed as RollingPeriod
    : null;
}

export function resolveRollingPeriod(value: RollingPeriodState | EffectiveRollingPeriod | string | number | undefined): EffectiveRollingPeriod {
  return parseRollingPeriodState(value) ?? DEFAULT_NEW_ROLLING_PERIOD;
}

export function parseRollingPeriod(value: string | number | undefined): RollingPeriod {
  const parsed = typeof value === "number" ? value : Number(value);
  return ROLLING_PERIODS.includes(parsed as RollingPeriod)
    ? parsed as RollingPeriod
    : DEFAULT_ROLLING_PERIOD;
}

export function parseNewRollingPeriod(value: string | number | undefined): NewRollingPeriod {
  return resolveRollingPeriod(value);
}

export function canonicalizeLegacyRollingPeriodParams(
  pathname: string,
  params: Record<string, string | string[] | undefined>,
  names: readonly string[] = ["period"],
): string | null {
  const legacyNames = new Set(names.filter((name) => {
    const value = params[name];
    return (Array.isArray(value) ? value[0] : value) === "365";
  }));
  if (!legacyNames.size) return null;
  const query = new URLSearchParams();
  for (const [name, input] of Object.entries(params)) {
    if (legacyNames.has(name)) continue;
    for (const value of Array.isArray(input) ? input : input ? [input] : []) query.append(name, value);
  }
  return `${pathname}${query.size ? `?${query}` : ""}`;
}

export const ROLLING_PERIODS = [30, 60, 90] as const;

export type RollingPeriod = (typeof ROLLING_PERIODS)[number];

export const DEFAULT_ROLLING_PERIOD: RollingPeriod = 30;

export function parseRollingPeriod(value: string | number | undefined): RollingPeriod {
  const parsed = typeof value === "number" ? value : Number(value);
  return ROLLING_PERIODS.includes(parsed as RollingPeriod)
    ? parsed as RollingPeriod
    : DEFAULT_ROLLING_PERIOD;
}

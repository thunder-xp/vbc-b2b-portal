export const ROLLING_PERIODS = [30, 60, 90] as const;
export const NEW_ROLLING_PERIODS = [30, 60, 90, 365] as const;

export type RollingPeriod = (typeof ROLLING_PERIODS)[number];
export type NewRollingPeriod = (typeof NEW_ROLLING_PERIODS)[number];

export const DEFAULT_ROLLING_PERIOD: RollingPeriod = 30;
export const DEFAULT_NEW_ROLLING_PERIOD: NewRollingPeriod = 365;

export function parseRollingPeriod(value: string | number | undefined): RollingPeriod {
  const parsed = typeof value === "number" ? value : Number(value);
  return ROLLING_PERIODS.includes(parsed as RollingPeriod)
    ? parsed as RollingPeriod
    : DEFAULT_ROLLING_PERIOD;
}

export function parseNewRollingPeriod(value: string | number | undefined): NewRollingPeriod {
  const parsed = typeof value === "number" ? value : Number(value);
  return NEW_ROLLING_PERIODS.includes(parsed as NewRollingPeriod)
    ? parsed as NewRollingPeriod
    : DEFAULT_NEW_ROLLING_PERIOD;
}

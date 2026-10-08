export type CampaignTimeState = "UPCOMING" | "ACTIVE" | "EXPIRED";

/** Call at the server projection boundary; client clocks never decide eligibility. */
export function campaignTimeState(startsAt: string, endsAt: string, evaluatedAt: Date): CampaignTimeState {
  const starts = Date.parse(startsAt);
  const ends = Date.parse(endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts || evaluatedAt.getTime() >= ends) return "EXPIRED";
  return evaluatedAt.getTime() < starts ? "UPCOMING" : "ACTIVE";
}

export function campaignRemainingSeconds(endsAt: string, evaluatedAt: Date): number {
  const end = Date.parse(endsAt);
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - evaluatedAt.getTime()) / 1000)) : 0;
}

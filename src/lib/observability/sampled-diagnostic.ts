const lastLoggedAt = new Map<string, number>();

export function shouldLogDiagnostic(
  key: string,
  intervalMs = 5 * 60 * 1000,
): boolean {
  const now = Date.now();
  const previous = lastLoggedAt.get(key) ?? 0;
  if (now - previous < intervalMs) return false;
  lastLoggedAt.set(key, now);
  if (lastLoggedAt.size > 200) {
    for (const [candidate, timestamp] of lastLoggedAt) {
      if (now - timestamp >= intervalMs) lastLoggedAt.delete(candidate);
    }
  }
  return true;
}

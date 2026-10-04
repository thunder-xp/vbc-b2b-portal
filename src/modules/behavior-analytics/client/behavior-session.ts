/** Existing per-tab behavior session. No fingerprint or cross-device identity. */
export function getBehaviorSessionId(): string {
  const key = "novotech-behavior-session";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(key, created);
  return created;
}

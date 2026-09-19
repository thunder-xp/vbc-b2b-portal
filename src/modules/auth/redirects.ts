export function safeRelativeAuthRedirect(value: FormDataEntryValue | string | null): string | null {
  const path = String(value ?? "");
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 500) return null;
  try {
    const base = new URL("https://auth.nsd.invalid");
    const resolved = new URL(path, base);
    return resolved.origin === base.origin ? path : null;
  } catch {
    return null;
  }
}

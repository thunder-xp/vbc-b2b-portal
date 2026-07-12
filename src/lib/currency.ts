export function normalizeOneCCurrencyCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  if (code === "999") return "USD";
  if (code === "498") return "MDL";
  return /^[A-Z]{3}$/.test(code) && code !== "XXX" ? code : null;
}

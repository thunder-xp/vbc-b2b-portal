export function canonicalMoldovaE164(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, "");
  if (/^\+373\d{8}$/.test(compact)) return compact;
  if (/^373\d{8}$/.test(compact)) return `+${compact}`;
  if (/^0\d{8}$/.test(compact)) return `+373${compact.slice(1)}`;
  if (/^\d{8}$/.test(compact)) return `+373${compact}`;
  return null;
}

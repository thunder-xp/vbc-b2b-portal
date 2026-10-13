export function maskBusinessPhone(phoneE164: string) {
  return `+373 ** *** ${phoneE164.slice(-2)}`;
}

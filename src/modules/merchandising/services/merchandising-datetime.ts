export function localDateTimeToUtc(
  value: string,
  offsetMinutes?: number,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const localDate = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  if (
    localDate.getFullYear() !== Number(year) ||
    localDate.getMonth() !== Number(month) - 1 ||
    localDate.getDate() !== Number(day) ||
    localDate.getHours() !== Number(hour) ||
    localDate.getMinutes() !== Number(minute)
  ) {
    return null;
  }

  const resolvedOffset = offsetMinutes ?? localDate.getTimezoneOffset();
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ) +
      resolvedOffset * 60_000,
  ).toISOString();
}

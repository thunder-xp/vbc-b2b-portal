const ONE_C_TIME_ZONE = "Europe/Chisinau";

export function parseOneCChisinauTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const timezoneLess = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/,
  );
  if (timezoneLess) {
    const [, year, month, day, hour, minute, second, milliseconds = "0"] = timezoneLess;
    const wallClock = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number(milliseconds.padEnd(3, "0")),
    );
    const firstOffset = chisinauOffsetMs(wallClock);
    const parsed = new Date(wallClock - chisinauOffsetMs(wallClock - firstOffset));
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function chisinauOffsetMs(timestamp: number): number {
  const wholeSecond = Math.trunc(timestamp / 1000) * 1000;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ONE_C_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(wholeSecond));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  ) - wholeSecond;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [35, 140] as const;

export async function withBoundedSerializationRetry<T>(
  operation: () => Promise<T>,
  options: { sleep?: (milliseconds: number) => Promise<void>; random?: () => number } = {},
): Promise<T> {
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSerializationFailure(error) || attempt === MAX_ATTEMPTS) throw error;
      const base = BACKOFF_MS[attempt - 1];
      await sleep(base + Math.round(base * random()));
    }
  }
  throw new Error("Unreachable serialization retry state.");
}

function isSerializationFailure(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "40001");
}

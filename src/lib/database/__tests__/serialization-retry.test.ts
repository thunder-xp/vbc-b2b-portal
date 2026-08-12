import { describe, expect, it, vi } from "vitest";

import { withBoundedSerializationRetry } from "../serialization-retry";

describe("withBoundedSerializationRetry", () => {
  it("retries genuine serialization failures with bounded jittered backoff", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce({ code: "40001" })
      .mockRejectedValueOnce({ code: "40001" })
      .mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(withBoundedSerializationRetry(operation, { sleep, random: () => 0 })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[35], [140]]);
  });

  it("enforces the three-attempt cap", async () => {
    const error = { code: "40001" };
    const operation = vi.fn().mockRejectedValue(error);
    await expect(withBoundedSerializationRetry(operation, { sleep: vi.fn(), random: () => 0 })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("never retries a domain conflict or another database error", async () => {
    for (const error of [{ code: "PT409" }, { code: "23514" }, new Error("domain conflict")]) {
      const operation = vi.fn().mockRejectedValue(error);
      await expect(withBoundedSerializationRetry(operation, { sleep: vi.fn() })).rejects.toBe(error);
      expect(operation).toHaveBeenCalledOnce();
    }
  });
});

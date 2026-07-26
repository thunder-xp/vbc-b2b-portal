import { describe, expect, it, vi } from "vitest";

import type { AdminAccessRepository } from "../../repositories";
import { AdminAccessService } from "../admin-access.service";

describe("AdminAccessService", () => {
  it("bounds subject search and delegates one aggregate read", async () => {
    const repository = makeRepository();
    const service = new AdminAccessService(repository);

    await service.listSubjects(`  ${"x".repeat(120)}  `);

    expect(repository.listSubjects).toHaveBeenCalledOnce();
    expect(repository.listSubjects).toHaveBeenCalledWith("x".repeat(100));
  });

  it("rejects malformed context before inspection", async () => {
    const repository = makeRepository();
    const service = new AdminAccessService(repository);

    await expect(service.inspect("bad-id")).resolves.toBeNull();
    await expect(
      service.inspect(
        "11111111-1111-1111-1111-111111111111",
        "bad-company",
      ),
    ).resolves.toBeNull();
    expect(repository.inspect).not.toHaveBeenCalled();
  });

  it("uses one effective-access RPC through the repository", async () => {
    const repository = makeRepository();
    const service = new AdminAccessService(repository);

    await service.inspect(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    );

    expect(repository.inspect).toHaveBeenCalledOnce();
  });
});

function makeRepository(): AdminAccessRepository {
  return {
    listSubjects: vi.fn().mockResolvedValue([]),
    inspect: vi.fn().mockResolvedValue(null),
  };
}

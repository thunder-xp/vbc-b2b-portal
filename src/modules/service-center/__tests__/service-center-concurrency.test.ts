import { describe, expect, it, vi } from "vitest";

import { ServiceCenterRepositoryError, type ServiceCenterRepository } from "../repository";
import { ServiceCenterService } from "../service";

describe("Service Center concurrency contract", () => {
  it("returns one stable conflict without retrying a stale transition", async () => {
    const repository = {
      transition: vi.fn().mockRejectedValue(new ServiceCenterRepositoryError("PT409")),
    } as unknown as ServiceCenterRepository;
    const service = new ServiceCenterService(repository, {} as never);

    await expect(service.transition({
      caseId: "11111111-1111-4111-8111-111111111111",
      expectedVersion: 1,
      status: "accepted",
      partnerMessage: "",
      internalNote: "",
      assigneeId: null,
    })).rejects.toMatchObject({ code: "SERVICE_CASE_CONFLICT" });
    expect(repository.transition).toHaveBeenCalledOnce();
  });
});

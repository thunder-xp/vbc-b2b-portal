import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminInternalUserProvisioningRepository } from "../../repositories";
import {
  AdminInternalUserProvisioningService,
} from "../admin-internal-user-provisioning.service";
import type { InternalUserInvitationProvider } from "../internal-user-invitation.provider";

const requestId = "11111111-1111-4111-8111-111111111111";
const authUserId = "22222222-2222-4222-8222-222222222222";

describe("AdminInternalUserProvisioningService", () => {
  let repository: AdminInternalUserProvisioningRepository;
  let provider: InternalUserInvitationProvider;
  let service: AdminInternalUserProvisioningService;

  beforeEach(() => {
    repository = {
      begin: vi.fn().mockResolvedValue({ requestId, newlyCreated: true }),
      markInvited: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
      activateCurrent: vi.fn().mockResolvedValue("assignment-id"),
      getCurrent: vi.fn().mockResolvedValue(null),
    };
    provider = {
      invite: vi.fn().mockResolvedValue({ authUserId }),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    service = new AdminInternalUserProvisioningService(repository, provider);
  });

  it("creates one governed Auth invitation and finalizes its exact identity", async () => {
    await expect(service.invite(" Finance@Novotech.Local ", " finance ", "Approved finance operator")).resolves.toEqual({
      requestId,
      authUserId,
      invited: true,
    });
    expect(repository.begin).toHaveBeenCalledWith("finance@novotech.local", "finance", "Approved finance operator");
    expect(provider.invite).toHaveBeenCalledWith("finance@novotech.local", "finance");
    expect(repository.markInvited).toHaveBeenCalledWith(requestId, authUserId);
  });

  it("does not resend an already-open provisioning request", async () => {
    vi.mocked(repository.begin).mockResolvedValue({ requestId, newlyCreated: false });
    await expect(service.invite("finance@novotech.local", "finance", "Approved")).resolves.toEqual({
      requestId,
      authUserId: null,
      invited: false,
    });
    expect(provider.invite).not.toHaveBeenCalled();
  });

  it("compensates the exact Auth identity when DB finalization fails", async () => {
    vi.mocked(repository.markInvited).mockRejectedValue(new Error("database unavailable"));
    await expect(service.invite("finance@novotech.local", "finance", "Approved")).rejects.toThrow(
      "Internal finance invitation could not be completed.",
    );
    expect(provider.remove).toHaveBeenCalledWith(authUserId);
    expect(repository.markFailed).toHaveBeenCalledWith(requestId, "PROVISIONING_FINALIZATION_FAILED");
  });

  it("delegates activation to the authenticated database boundary", async () => {
    await expect(service.activateCurrent()).resolves.toBe("assignment-id");
    expect(repository.activateCurrent).toHaveBeenCalledOnce();
  });
});

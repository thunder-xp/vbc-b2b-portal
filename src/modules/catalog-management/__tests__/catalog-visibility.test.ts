import { describe, expect, it, vi } from "vitest";

import { CatalogManagementService } from "../service";

const productId = "11111111-1111-1111-1111-111111111111";
const correlationId = "22222222-2222-2222-2222-222222222222";

describe("portal-owned catalog visibility", () => {
  it.each([false, true])("delegates portal visibility %s without invoking Firebase or 1C", async (visible) => {
    const repository = {
      setVisibility: vi.fn(async () => ({
        productId,
        visible,
        isActiveIn1C: false,
        changed: true,
      })),
    };
    const storage = { verifyAccess: vi.fn() };
    const oneC = { read: vi.fn(), write: vi.fn() };
    const service = new CatalogManagementService(
      repository as never,
      storage as never,
      oneC as never,
    );

    await expect(service.setVisibility({
      productId,
      visible,
      reason: "  Решение администратора  ",
      correlationId,
    })).resolves.toMatchObject({ visible, isActiveIn1C: false });
    expect(repository.setVisibility).toHaveBeenCalledWith({
      productId,
      visible,
      reason: "Решение администратора",
      correlationId,
    });
    expect(storage.verifyAccess).not.toHaveBeenCalled();
    expect(oneC.read).not.toHaveBeenCalled();
    expect(oneC.write).not.toHaveBeenCalled();
  });
});

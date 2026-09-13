import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import { FirebaseProductImageStorageError } from "../firebase-product-image-storage";
import { OneCProductImageGatewayError, PRODUCT_IMAGE_PROPERTY_KEY } from "../one-c-product-image-gateway";
import { CatalogManagementRepositoryError } from "../repository";
import { CatalogManagementService } from "../service";

const productId = "11111111-1111-1111-1111-111111111111";
const actorUserId = "22222222-2222-2222-2222-222222222222";
const correlationId = "33333333-3333-3333-3333-333333333333";
const productRef = "44444444-4444-4444-4444-444444444444";
const oldPath = `products/${productRef}/${"a".repeat(64)}.jpg`;
const oldUrl = `https://firebasestorage.googleapis.com/v0/b/novotech-systems-5449b.appspot.com/o/${encodeURIComponent(oldPath)}?alt=media&token=old`;
let file: File;

describe("catalog image orchestration", () => {
  beforeEach(async () => {
    const bytes = await sharp({ create: { width: 400, height: 400, channels: 3, background: "white" } }).jpeg().toBuffer();
    file = new File([new Uint8Array(bytes)], "camera.jpg", { type: "image/jpeg" });
  });

  it("does not call 1C when Firebase access fails", async () => {
    const { service, oneC, repository } = fixture();
    service.storage.verifyAccess.mockRejectedValue(new FirebaseProductImageStorageError("FIREBASE_BUCKET_ACCESS_403"));
    await expect(run(service.instance)).rejects.toMatchObject({ safeCode: "FIREBASE_BUCKET_ACCESS_403", stage: "firebase_access" });
    expect(oneC.read).not.toHaveBeenCalled();
    expect(repository.appendImageAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "CATALOG_IMAGE_UPLOAD_FAILED" }));
  });

  it("removes the new orphan when 1C PATCH fails", async () => {
    const { service, oneC } = fixture();
    oneC.write.mockRejectedValue(new OneCProductImageGatewayError("ONEC_PATCH_FAILED"));
    await expect(run(service.instance)).rejects.toMatchObject({ safeCode: "ONEC_PATCH_FAILED", cleanupStatus: "COMPLETED" });
    expect(service.storage.deleteManagedObject).toHaveBeenCalledTimes(1);
  });

  it("rejects a read-back mismatch and cleans the unconfirmed object", async () => {
    const { service, oneC } = fixture();
    oneC.read.mockReset();
    oneC.read.mockResolvedValueOnce(oneCState(oldUrl)).mockResolvedValueOnce(oneCState(oldUrl));
    await expect(run(service.instance)).rejects.toMatchObject({ safeCode: "ONEC_IMAGE_READBACK_MISMATCH", stage: "one_c_readback" });
    expect(service.storage.deleteManagedObject).toHaveBeenCalledTimes(1);
  });

  it("rejects any unrelated 1C requisite mutation before local publication", async () => {
    const { service, oneC, repository } = fixture();
    const acceptedUrl = "https://firebasestorage.googleapis.com/v0/b/novotech-systems-5449b.appspot.com/o/products%2Fnew.png?alt=media";
    oneC.read.mockReset();
    oneC.read
      .mockResolvedValueOnce(oneCState(oldUrl, "preserved"))
      .mockResolvedValueOnce(oneCState(acceptedUrl, "changed"));
    service.storage.upload.mockResolvedValueOnce({
      bucket: "novotech-systems-5449b.appspot.com",
      objectPath: "products/new.png",
      canonicalUrl: acceptedUrl,
    });

    await expect(run(service.instance)).rejects.toMatchObject({
      safeCode: "ONEC_UNRELATED_REQUISITES_CHANGED",
      stage: "one_c_readback",
    });
    expect(service.storage.deleteManagedObject).not.toHaveBeenCalled();
    expect(repository.publishTargetedImage).not.toHaveBeenCalled();
    expect(repository.updateImageMutation).toHaveBeenCalledWith(expect.objectContaining({ status: "refresh_pending" }));
  });

  it("keeps the confirmed Firebase object and marks recovery pending when local refresh fails", async () => {
    const { service, repository } = fixture();
    repository.publishTargetedImage.mockRejectedValue(new CatalogManagementRepositoryError("CATALOG_TARGETED_REFRESH_FAILED"));
    await expect(run(service.instance)).rejects.toMatchObject({ safeCode: "CATALOG_TARGETED_REFRESH_FAILED", cleanupStatus: "NOT_REQUIRED" });
    expect(service.storage.deleteManagedObject).not.toHaveBeenCalled();
    expect(repository.updateImageMutation).toHaveBeenCalledWith(expect.objectContaining({ status: "refresh_pending" }));
  });

  it("marks recovery pending when public retail publication fails after targeted local refresh", async () => {
    const { service, publicRetailPublisher, repository } = fixture();
    publicRetailPublisher.publishCurrentProjection.mockRejectedValue(new Error("projection failed"));
    await expect(run(service.instance)).rejects.toMatchObject({
      safeCode: "CATALOG_IMAGE_UNKNOWN_FAILURE",
      stage: "public_retail_projection",
    });
    expect(repository.verifyTargetedImage).toHaveBeenCalledTimes(1);
    expect(publicRetailPublisher.publishCurrentProjection).toHaveBeenCalledTimes(2);
    expect(repository.updateImageMutation).toHaveBeenCalledWith(expect.objectContaining({ status: "refresh_pending" }));
  });

  it("recovers a transient public retail candidate failure without repeating Firebase or 1C", async () => {
    const { service, publicRetailPublisher, oneC } = fixture();
    publicRetailPublisher.publishCurrentProjection
      .mockRejectedValueOnce(new Error("statement timeout"))
      .mockResolvedValueOnce(undefined);
    await expect(run(service.instance)).resolves.toMatchObject({ correlationId });
    expect(publicRetailPublisher.publishCurrentProjection).toHaveBeenCalledTimes(2);
    expect(oneC.write).toHaveBeenCalledTimes(1);
    expect(service.storage.upload).toHaveBeenCalledTimes(1);
  });

  it("deletes a prior managed object only after 1C read-back and local projection verification", async () => {
    const events: string[] = [];
    const { service, oneC, repository } = fixture(events);
    const result = await run(service.instance);
    expect(result.replaced).toBe(true);
    expect(events).toEqual(expect.arrayContaining(["one_c_write", "one_c_readback", "local_publish", "local_verify", "public_retail_publish", "reference_check", "old_delete"]));
    expect(events.indexOf("public_retail_publish")).toBeGreaterThan(events.indexOf("local_verify"));
    expect(events.indexOf("old_delete")).toBeGreaterThan(events.indexOf("local_verify"));
    expect(events.indexOf("old_delete")).toBeGreaterThan(events.indexOf("reference_check"));
    expect(oneC.write).toHaveBeenCalledWith(productRef, expect.arrayContaining([expect.objectContaining({ "Свойство_Key": PRODUCT_IMAGE_PROPERTY_KEY })]));
    expect(repository.appendImageAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "CATALOG_IMAGE_1C_WRITE_CONFIRMED" }));
    expect(repository.appendImageAudit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "CATALOG_IMAGE_1C_WRITE_CONFIRMED",
      safeMetadata: expect.objectContaining({ unrelatedRequisitesUnchanged: true }),
    }));
    expect(repository.appendImageAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "CATALOG_IMAGE_REPLACED" }));
  });
});

function fixture(events: string[] = []) {
  const newPath = `products/${productRef}/${"b".repeat(64)}.jpg`;
  const newUrl = `https://firebasestorage.googleapis.com/v0/b/novotech-systems-5449b.appspot.com/o/${encodeURIComponent(newPath)}?alt=media&token=new`;
  const repository = {
    getProductForImageMutation: vi.fn(async () => ({ id: productId, external1cId: productRef, sku: "SKU", name: "Camera", imageOriginalUrl: oldUrl, isActiveIn1C: true })),
    startImageMutation: vi.fn(async () => undefined),
    updateImageMutation: vi.fn(async () => undefined),
    appendImageAudit: vi.fn(async () => undefined),
    publishTargetedImage: vi.fn(async () => { events.push("local_publish"); }),
    verifyTargetedImage: vi.fn(async () => { events.push("local_verify"); return true; }),
    countCanonicalImageReferences: vi.fn(async () => { events.push("reference_check"); return 0; }),
    recoverPriorFailures: vi.fn(async () => undefined),
  };
  const storage = {
    verifyAccess: vi.fn(async () => undefined),
    upload: vi.fn(async () => ({ bucket: "novotech-systems-5449b.appspot.com", objectPath: newPath, canonicalUrl: newUrl })),
    deleteManagedObject: vi.fn(async () => { events.push("old_delete"); }),
  };
  const oneC = {
    read: vi.fn()
      .mockImplementationOnce(async () => oneCState(oldUrl))
      .mockImplementationOnce(async () => { events.push("one_c_readback"); return oneCState(newUrl); }),
    write: vi.fn(async () => { events.push("one_c_write"); }),
  };
  const publicRetailPublisher = {
    publishCurrentProjection: vi.fn(async () => { events.push("public_retail_publish"); }),
  };
  return {
    repository,
    oneC,
    publicRetailPublisher,
    service: {
      storage,
      instance: new CatalogManagementService(
        repository as never,
        storage as never,
        oneC as never,
        publicRetailPublisher as never,
      ),
    },
  };
}

function oneCState(imageUrl: string, unrelatedValue?: string) {
  return {
    reference: productRef,
    dataVersion: "1",
    imageUrl,
    requisites: [
      { LineNumber: 1, "Свойство_Key": PRODUCT_IMAGE_PROPERTY_KEY, "Значение": imageUrl, "Значение_Type": "Edm.String" },
      ...(unrelatedValue === undefined ? [] : [{
        LineNumber: 2,
        "Свойство_Key": "55555555-5555-5555-5555-555555555555",
        "Значение": unrelatedValue,
        "Значение_Type": "Edm.String",
      }]),
    ],
  };
}

function run(service: CatalogManagementService) {
  return service.uploadProductImage({ productId, actorUserId, correlationId, file });
}

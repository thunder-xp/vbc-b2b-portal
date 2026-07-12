import { afterEach, describe, expect, it, vi } from "vitest";
import { IntegrationValidationError } from "../../../errors";
import { CatalogDuplicateRowsError, OneCNomenclatureCatalogProvider } from "../one-c-nomenclature-provider";

const root = "11111111-1111-4111-8111-111111111111";
const folder = "22222222-2222-4222-8222-222222222222";
const product = "33333333-3333-4333-8333-333333333333";

describe("OneCNomenclatureCatalogProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("discovers the exact root and imports only eligible descendants", async () => {
    const rows = [
      row(root, null, true, "SECURITYPARK DISTRIBUTION"),
      row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", null, true, "SECURITYPARK DISTRIBUTION ARCHIVE"),
      row(folder, root, true, "Видеонаблюдение"),
      row(product, folder, false, "IP Camera", { Артикул: "CAM-1", PS_ВидНоменклатурыБУ: "Товар" }),
      row("44444444-4444-4444-8444-444444444444", folder, false, "Installation", { PS_ВидНоменклатурыБУ: "Услуга" }),
      row("55555555-5555-4555-8555-555555555555", folder, false, "Set", { PS_ВидНоменклатурыБУ: "Товар", ЭтоНабор: true }),
      row("66666666-6666-4666-8666-666666666666", folder, false, "Deleted", { PS_ВидНоменклатурыБУ: "Товар", DeletionMark: true }),
      row("77777777-7777-4777-8777-777777777777", null, false, "Unrelated", { PS_ВидНоменклатурыБУ: "Товар" }),
    ];
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(rows)));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await provider().fetchFullSnapshot();
    expect(snapshot.rootReference.externalId).toBe(root);
    expect(snapshot.categories.map((item) => item.reference.externalId)).toEqual([folder]);
    expect(snapshot.products.map((item) => item.reference.externalId)).toEqual([product]);
    expect(snapshot.products[0]).toMatchObject({ sku: "CAM-1", categoryReference: { externalId: folder } });
    const requestUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(requestUrl.searchParams.get("$orderby")).toBe("Ref_Key asc");
    expect(requestUrl.searchParams.get("$format")).toBe("json");
    expect(requestUrl.searchParams.get("$select")).toContain("Недействителен");
  });

  it("keeps exact Cyrillic eligibility fields and excludes inactive products", async () => {
    const rows = [row(root, null, true, "SECURITYPARK DISTRIBUTION"), row(product, root, false, "Active", { PS_ВидНоменклатурыБУ: "Товар", ЭтоНабор: false }), row(folder, root, false, "Inactive", { PS_ВидНоменклатурыБУ: "Товар", ЭтоНабор: false, Недействителен: true })];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(rows))));
    const snapshot = await provider().fetchFullSnapshot();
    expect(snapshot.products.map((item) => item.reference.externalId)).toEqual([product]);
    expect(snapshot.diagnostics?.accountingTypeCounts.Товар).toBe(2);
    expect(snapshot.diagnostics?.excludedInactive).toBe(1);
  });

  it("normalizes image and sanitized description from UTF-8 requisites", async () => {
    const descriptionRef = "88888888-8888-4888-8888-888888888888";
    const photoRef = "f637e5a4-4c2b-11ec-bd80-7239d3b7bd5c";
    const nomenclature = [row(root, null, true, "SECURITYPARK DISTRIBUTION"), row(product, root, false, "Camera", { ДополнительныеРеквизиты: [requisite(photoRef, "https://firebasestorage.googleapis.com/v0/b/demo/o/camera.jpg", "Edm.String"), requisite(descriptionRef, "<script>bad()</script><p>Описание товара</p>", "Edm.String")] })];
    const definitions = [property(photoRef, "photoURL"), property(descriptionRef, "Описание")];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: URL | RequestInfo) => Promise.resolve(jsonResponse(String(input).includes("ChartOfCharacteristicTypes") ? definitions : nomenclature))));
    const snapshot = await provider().fetchFullSnapshot();
    expect(snapshot.products[0]).toMatchObject({ imageUrl: "https://firebasestorage.googleapis.com/v0/b/demo/o/camera.jpg", description: "Описание товара" });
    expect(snapshot.products[0]?.attributes?.map((item) => item.label)).toEqual(["Описание"]);
  });

  it("rejects duplicate references before producing a snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([row(root, null, true, "SECURITYPARK DISTRIBUTION"), row(product, root, false, "Product"), row(product, root, false, "Product")])));
    await expect(provider().fetchFullSnapshot()).rejects.toBeInstanceOf(CatalogDuplicateRowsError);
  });

  it("uses the same deterministic ordering and expected offset on page two", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(Array.from({ length: 500 }, () => row(product, root, false, "Product")))).mockResolvedValueOnce(jsonResponse([row(root, null, true, "SECURITYPARK DISTRIBUTION")]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider().fetchFullSnapshot()).rejects.toBeInstanceOf(CatalogDuplicateRowsError);
    const first = new URL(String(fetchMock.mock.calls[0]![0]));
    const second = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(first.searchParams.get("$orderby")).toBe("Ref_Key asc");
    expect(second.searchParams.get("$orderby")).toBe("Ref_Key asc");
    expect(second.searchParams.get("$skip")).toBe("500");
  });

  it("fails when the exact business root is not found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([row(root, null, true, "OTHER ROOT")])));
    await expect(provider().fetchFullSnapshot()).rejects.toBeInstanceOf(IntegrationValidationError);
  });
});

function requisite(propertyRef: string, value: unknown, valueType: string) { return { Ref_Key: crypto.randomUUID(), LineNumber: 1, Свойство_Key: propertyRef, Значение: value, Значение_Type: valueType, ТекстоваяСтрока: "" }; }
function property(reference: string, label: string) { return { Ref_Key: reference, Description: label, Заголовок: label, DeletionMark: false, ValueType: "Edm.String", Виден: true, Доступен: true, Имя: label, НаборСвойств_Key: root }; }
function provider() { return new OneCNomenclatureCatalogProvider({ baseUrl: "https://erp.example/odata", username: "user", password: "secret", requestTimeoutMs: 10000 }); }
function jsonResponse(value: unknown[]) { return new Response(JSON.stringify({ value }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } }); }
function row(reference: string, parent: string | null, isFolder: boolean, name: string, overrides: Record<string, unknown> = {}) { return { Ref_Key: reference, Parent_Key: parent, IsFolder: isFolder, DeletionMark: false, Недействителен: false, DataVersion: "v1", ДатаИзменения: "2026-07-12T00:00:00", Code: "CODE", Артикул: "", Description: name, НаименованиеПолное: name, PS_ВидНоменклатурыБУ: isFolder ? null : "Товар", ЭтоНабор: false, ...overrides }; }

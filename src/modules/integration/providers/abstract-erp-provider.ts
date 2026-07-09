import type { ERPProvider } from "../contracts";

export abstract class AbstractERPProvider implements ERPProvider {
  abstract readonly providerCode: ERPProvider["providerCode"];
  abstract readonly capabilities: ERPProvider["capabilities"];
  abstract readonly catalog: ERPProvider["catalog"];
  abstract readonly pricing: ERPProvider["pricing"];
  abstract readonly inventory: ERPProvider["inventory"];
  abstract readonly orders: ERPProvider["orders"];
  abstract readonly documents: ERPProvider["documents"];
  abstract readonly finance: ERPProvider["finance"];
  abstract readonly partners: ERPProvider["partners"];
  abstract checkHealth(): ReturnType<ERPProvider["checkHealth"]>;
}

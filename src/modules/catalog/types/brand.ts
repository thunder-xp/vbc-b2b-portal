export interface CatalogBrand {
  id: string;
  external1cId: string | null;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

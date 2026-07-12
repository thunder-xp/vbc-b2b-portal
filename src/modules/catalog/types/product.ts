export interface CatalogProduct {
  id: string;
  external1cId: string;
  categoryId: string | null;
  brandId: string | null;
  sku: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  imageSourceUrl?: string | null;
  fullDescription?: string | null;
  isActive: boolean;
  isVisible: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

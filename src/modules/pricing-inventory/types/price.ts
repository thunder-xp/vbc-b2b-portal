export interface ProductPrice {
  id: string;
  productId: string;
  companyId: string | null;
  external1cPriceTypeId: string | null;
  currency: string;
  priceAmount: number;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OrderReorderSource = {
  orderId: string;
  companyId: string;
  orderNumber: string;
  orderCurrencyCode: string | null;
  lines: OrderReorderSourceLine[];
};

export type OrderReorderSourceLine = {
  lineId: string;
  lineNumber: number;
  productId: string | null;
  historicalExternalProductRef: string;
  historicalProductName: string | null;
  historicalSku: string | null;
  historicalQuantity: number;
  historicalUnitPrice: number;
  historicalCurrencyCode: string | null;
  productExists: boolean;
  currentExternalProductRef: string | null;
  currentName: string | null;
  currentSku: string | null;
  currentSlug: string | null;
  currentImageUrl: string | null;
  currentCategoryId: string | null;
  currentIsActive: boolean;
  currentIsVisible: boolean;
};

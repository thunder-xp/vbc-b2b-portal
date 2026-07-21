export type ProposalTemplateKey = "equipment_supply" | "equipment_installation" | "integrated_solution" | "service_offer";
export type GeneratedDocumentStatus = "queued" | "generating" | "ready" | "failed";

export type ProposalSettings = {
  title: string;
  introduction: string;
  deliveryTerms: string;
  paymentTerms: string;
  warrantyTerms: string;
  validityText: string;
  installationNotes: string;
  exclusions: string;
  customerNote: string;
  footerNote: string;
  showProductImages: boolean;
  showSku: boolean;
  showUnitPrice: boolean;
  showLineDiscount: boolean;
  showSectionSubtotals: boolean;
  showVatBreakdown: boolean;
  showPartnerLogo: boolean;
};

export type ProposalTemplate = {
  id: string;
  companyId: string | null;
  key: ProposalTemplateKey | string;
  name: string;
  configuration: ProposalSettings;
  isSystem: boolean;
};

export type ProposalBranding = {
  companyName: string;
  legalName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  fiscalInformation: string | null;
  address: string | null;
  logoUrl: string | null;
};

export type CustomerProposalLine = Readonly<{
  position: number;
  lineType?: import("./estimate").EstimateLineType;
  description: string;
  sku: string | null;
  imageUrl: string | null;
  quantity: number;
  unitLabel: string;
  unitPrice: number;
  lineDiscountPercent: number;
  lineTotal: number;
}>;

export type CustomerProposalSection = Readonly<{
  name: string;
  subtotal: number;
  lines: ReadonlyArray<CustomerProposalLine>;
}>;

export type CustomerProposalDto = Readonly<{
  schemaVersion: "2026-07-16-v1";
  estimateNumber: string;
  generatedForDate: string;
  customerName: string | null;
  projectName: string | null;
  currencyCode: string;
  settings: Readonly<ProposalSettings>;
  branding: Readonly<ProposalBranding>;
  sections: ReadonlyArray<CustomerProposalSection>;
  charges: ReadonlyArray<Readonly<{ description: string; amount: number }>>;
  totals: Readonly<{
    subtotal: number;
    discounts: number;
    charges: number;
    totalExcludingVat: number;
    vat: number;
    total: number;
  }>;
}>;

export type GeneratedEstimateDocument = {
  id: string;
  companyId: string;
  estimateId: string;
  estimateRevision: number;
  versionId: string | null;
  templateId: string | null;
  generationFingerprint: string;
  status: GeneratedDocumentStatus;
  storageBucket: string | null;
  storageKey: string | null;
  pageCount: number | null;
  fileSizeBytes: number | null;
  checksumSha256: string | null;
  safeError: string | null;
  createdAt: string;
};

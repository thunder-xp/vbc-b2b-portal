import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ServiceCaseDetail } from "../types";
import { ServiceCaseSummary } from "../views";

vi.mock("next/image", () => ({ default: ({ alt, src }: { alt: string; src: string }) => <span aria-label={alt} data-src={src} role="img" /> }));

const detail: ServiceCaseDetail = {
  id: "case-1",
  companyId: "company-1",
  caseNumber: "SRV-2026-000001",
  caseType: "repair_request",
  status: "created",
  priority: "normal",
  productId: "product-1",
  orderId: null,
  orderLineId: null,
  serialNumber: "SERIAL-1",
  faultCategory: "power",
  description: "Does not power on",
  symptoms: null,
  issueStartedOn: null,
  powersOn: false,
  factoryResetAttempted: null,
  preferredContact: null,
  purchaseVerificationState: "verified_order",
  warrantyState: "eligible",
  warrantyEndDate: null,
  replacementState: "not_assessed",
  assignedInternalUserId: null,
  createdAt: "2026-08-01T10:00:00Z",
  updatedAt: "2026-08-01T10:00:00Z",
  version: 1,
  product: {
    id: "product-1",
    sku: "190023",
    name: "Camera",
    imageUrl: "https://firebasestorage.googleapis.com/v0/b/novotech-systems-5449b.appspot.com/o/products%2Fcamera.jpg?alt=media",
    href: "/cabinet/catalog/camera",
  },
  order: null,
  events: [],
  attachments: [],
  documents: [],
};

describe("portal service-case product presentation", () => {
  it("uses the same bounded canonical product image and route", () => {
    render(<ServiceCaseSummary detail={detail} />);

    expect(screen.getByTestId("product-line-thumbnail")).toHaveClass("size-24", "max-h-24", "sm:size-30", "sm:max-h-30", "overflow-hidden");
    expect(screen.getAllByRole("link", { name: "Camera" })).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Camera" })).toHaveAttribute("data-src", detail.product?.imageUrl);
  });

  it("does not expose a partner product route in the internal detail", () => {
    render(<ServiceCaseSummary detail={detail} internal />);

    expect(screen.queryByRole("link", { name: "Camera" })).not.toBeInTheDocument();
    expect(screen.getByTestId("product-line-thumbnail")).toHaveClass("size-24", "sm:size-30", "overflow-hidden");
  });
});

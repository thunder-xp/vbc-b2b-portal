import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CurrentProfileDto } from "../../../access-control/actions/current-profile.action";
import type { ActiveCompanyContextDto } from "../../../access-control/actions/get-active-company-context.action";
import {
  CompanyStatus,
  MembershipStatus,
  UserStatus,
} from "../../../access-control/types";
import { PartnerHeader } from "../PartnerHeader";
import { PartnerSidebar } from "../PartnerSidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/cabinet",
}));

vi.mock("@/src/modules/auth/actions/auth.actions", () => ({
  signOutAction: vi.fn(),
}));

describe("Partner cabinet shell", () => {
  it("renders meaningful identity without internal placeholder states", () => {
    render(
      <PartnerHeader
        companyContext={makeCompanyContext()}
        profile={makeProfile()}
      />,
    );

    expect(screen.getByText("Partner User")).toBeInTheDocument();
    expect(screen.getByText("Partner Company")).toBeInTheDocument();
    expect(screen.getByText("role-1")).toBeInTheDocument();
    expect(screen.queryByText("unknown")).not.toBeInTheDocument();
    expect(screen.queryByText("Profile unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("Authenticated user")).not.toBeInTheDocument();
  });

  it("hides catalog and future workspace items until active company exists", () => {
    render(<PartnerSidebar hasActiveCompany={false} />);

    expect(screen.getByRole("link", { name: "Partner Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Company" })).toBeInTheDocument();
    expect(screen.queryByText("Catalog")).not.toBeInTheDocument();
    expect(screen.queryByText("Orders")).not.toBeInTheDocument();
    expect(screen.queryByText("Finance")).not.toBeInTheDocument();
    expect(screen.queryByText("Documents")).not.toBeInTheDocument();
  });

  it("shows catalog only after active company access exists", () => {
    render(<PartnerSidebar hasActiveCompany />);

    expect(screen.getByRole("link", { name: "Catalog" })).toHaveAttribute(
      "href",
      "/cabinet/catalog",
    );
    expect(screen.queryByText("Orders")).not.toBeInTheDocument();
    expect(screen.queryByText("Finance")).not.toBeInTheDocument();
    expect(screen.queryByText("Documents")).not.toBeInTheDocument();
  });
});

function makeProfile(): CurrentProfileDto {
  return {
    id: "user-1",
    email: "partner@example.com",
    fullName: "Partner User",
    phone: "+359 1 234",
    status: UserStatus.Active,
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
  };
}

function makeCompanyContext(): ActiveCompanyContextDto {
  return {
    company: {
      id: "company-1",
      external1cId: "C-100",
      displayName: "Partner Company",
      status: CompanyStatus.Active,
    },
    membership: {
      id: "membership-1",
      companyId: "company-1",
      roleId: "role-1",
      status: MembershipStatus.Active,
    },
    user: {
      id: "user-1",
      email: "partner@example.com",
      fullName: "Partner User",
      phone: "+359 1 234",
      status: UserStatus.Active,
    },
  };
}

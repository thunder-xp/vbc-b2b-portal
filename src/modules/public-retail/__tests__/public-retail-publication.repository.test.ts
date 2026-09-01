import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

import { SupabasePublicRetailPublicationRepository } from "../repositories/supabase/public-retail-publication.supabase-repository";
import { PublicRetailRepositoryError } from "../repositories/supabase/public-retail.supabase-repository";

const publicationId = "237a0ea3-9ad3-4292-97f3-5c83d5fafb68";

describe("Public Retail publication repository diagnostics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves the failed build operation, RPC, SQLSTATE, publication, and safe entity context", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "57014", message: "canceling statement due to statement timeout", details: null },
    });

    const error = await new SupabasePublicRetailPublicationRepository().build(publicationId).catch((value) => value);

    expect(error).toBeInstanceOf(PublicRetailRepositoryError);
    expect(error).toMatchObject({
      operation: "candidate_build",
      rpcName: "build_public_retail_candidate",
      sqlState: "57014",
      publicationId,
      entityContext: { entity: "public_retail_publication", publicationId },
      databaseMessage: "canceling statement due to statement timeout",
      candidateFailureRecorded: false,
    });
  });

  it("recognizes a database-recorded candidate failure without losing its SQLSTATE", async () => {
    rpc.mockResolvedValueOnce({ data: { publicationId, failed: true, sqlstate: "23505" }, error: null });

    const error = await new SupabasePublicRetailPublicationRepository().build(publicationId).catch((value) => value);

    expect(error).toMatchObject({
      operation: "candidate_build",
      rpcName: "build_public_retail_candidate",
      sqlState: "23505",
      publicationId,
      candidateFailureRecorded: true,
    });
  });

  it("keeps the timeout exemption bounded to the candidate-build function", () => {
    const migration = readFileSync(resolve("supabase/migrations/20260901094655_bound_public_retail_candidate_build_timeout.sql"), "utf8");
    expect(migration).toContain("alter function public.build_public_retail_candidate(uuid)");
    expect(migration).toContain("set statement_timeout = '15s'");
    expect(migration).not.toMatch(/alter\s+(?:role|database)/i);
  });
});

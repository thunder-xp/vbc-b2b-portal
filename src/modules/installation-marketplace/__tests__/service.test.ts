import { describe, expect, it, vi } from "vitest";

import type { InstallationMarketplaceRepository } from "../repository";
import { InstallationMarketplaceInputError, InstallationMarketplaceService } from "../service";

const id = (suffix: string) => `10000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

function repository(): InstallationMarketplaceRepository {
  return {
    listRegions: vi.fn().mockResolvedValue([]),
    isCustomerOrderEligible: vi.fn().mockResolvedValue(true),
    createProject: vi.fn().mockResolvedValue({ projectId: id("1"), repeated: false }),
    listCustomerProjects: vi.fn().mockResolvedValue([]),
    getCustomerProject: vi.fn().mockResolvedValue(null),
    getRankingEvidence: vi.fn().mockResolvedValue({ projectId:id("1"),customerAccountId:id("9"),systemType:"cctv",locality:"Chișinău",regionCode:"MD-CU",generatedAt:"2026-09-15T12:00:00.000Z",candidates:[] }),
    recordRankingDecision: vi.fn().mockResolvedValue({ decisionId:id("8"), countedImpressions:0 }),
    selectPartner: vi.fn().mockResolvedValue({ assignmentId: id("2"), status: "PARTNER_PENDING", repeated: false }),
    transitionCustomer: vi.fn().mockResolvedValue({ projectId: id("1"), status: "CANCELLED", repeated: false }),
    submitReview: vi.fn().mockResolvedValue({ reviewId: id("3"), repeated: false }),
    listPartnerProjects: vi.fn().mockResolvedValue([]),
    respondPartner: vi.fn().mockResolvedValue({ assignmentId: id("2"), status: "PARTNER_ACCEPTED", repeated: false }),
    transitionPartner: vi.fn().mockResolvedValue({ projectId: id("1"), status: "CONTACTED", repeated: false }),
    listAdmin: vi.fn().mockResolvedValue({ projects: [], reviews: [] }),
    getAdminRankingDiagnostics: vi.fn().mockResolvedValue({policyVersion:"installation-ranking-v2.1",decisionCount:0,deduplicatedImpressions:0,top1ImpressionShare:0,top3ImpressionShare:0,top5ImpressionShare:0,exposureHhi:0,latestDecision:null}),
    moderateReview: vi.fn().mockResolvedValue({ reviewId: id("3"), status: "PUBLISHED", revision: 1 }),
    getPartnerActivation: vi.fn().mockResolvedValue({}),
    optInPartner: vi.fn().mockResolvedValue({ providerId: id("5"), revision: 0, repeated: false }),
    savePartnerActivation: vi.fn().mockResolvedValue({ providerId: id("5"), revision: 1, status: "DRAFT" }),
    submitPartnerActivation: vi.fn().mockResolvedValue({ providerId: id("5"), revision: 2, status: "PENDING_REVIEW", repeated: false }),
    getPartnerActivationAdminReport: vi.fn().mockResolvedValue({ metrics: {}, applications: [], coverage: [], pilotFacts: {} }),
    reviewPartnerActivation: vi.fn().mockResolvedValue({ providerId: id("5"), revision: 3, status: "ACTIVE" }),
    returnPartnerForCorrection: vi.fn().mockResolvedValue({ providerId: id("5"), revision: 6, status: "DRAFT", repeated: false }),
    getSupplyReport: vi.fn().mockResolvedValue({ metrics:{}, totalCount:0, limit:25, offset:0, pilotReadiness:"NOT_READY", candidates:[], coverage:[] }),
    savePilotConfiguration: vi.fn().mockResolvedValue({ regionCode:"MD-CU", capability:"cctv", revision:1, enabled:true }),
    prepareInvitation: vi.fn().mockResolvedValue({ invitationId:id("6"), revision:1, status:"READY_TO_SEND" }),
    sendInvitation: vi.fn().mockResolvedValue({ invitationId:id("6"), revision:2, status:"SENT", repeated:false, companyId:id("7"), companyName:"Test", recipientUserId:id("8"), recipientEmail:"test@example.com", recipientLocale:"ru", identityVerified:true, channels:["IN_APP","EMAIL"], emailIntentId:id("9") }),
  };
}

describe("InstallationMarketplaceService", () => {
  it("accepts a short consented request and keeps creation idempotency", async () => {
    const repo=repository(); const service=new InstallationMarketplaceService(repo);
    await service.create({ sourceType:"CUSTOM", objectType:"HOUSE", locality:" Chișinău ", needType:"DESIGN_AND_INSTALL", contactConsent:true, creationKey:id("4") });
    expect(repo.createProject).toHaveBeenCalledWith(expect.objectContaining({ locality:"Chișinău", creationKey:id("4") }));
  });

  it("rejects missing contact consent and unsupported source data", async () => {
    const service=new InstallationMarketplaceService(repository());
    expect(()=>service.create({ sourceType:"CUSTOM", objectType:"HOUSE", locality:"Chișinău", needType:"CONSULTATION", contactConsent:false, creationKey:id("4") })).toThrow(InstallationMarketplaceInputError);
  });

  it("hard-bounds shortlist reads to five", async () => {
    const repo=repository(); const service=new InstallationMarketplaceService(repo);
    await service.shortlist(id("1"),id("9"),"ro");
    expect(repo.getRankingEvidence).toHaveBeenCalledWith(id("1"),id("9"),"ro");
    expect(repo.recordRankingDecision).toHaveBeenCalledWith(expect.objectContaining({policyVersion:"installation-ranking-v2.1"}),id("9"),5);
  });

  it("keeps the evidence fingerprint stable across refresh timestamps", async () => {
    const repo=repository();
    vi.mocked(repo.getRankingEvidence)
      .mockResolvedValueOnce({ projectId:id("1"),customerAccountId:id("9"),systemType:"cctv",locality:"Chișinău",regionCode:"MD-CU",generatedAt:"2026-09-15T12:00:00.000Z",candidates:[] })
      .mockResolvedValueOnce({ projectId:id("1"),customerAccountId:id("9"),systemType:"cctv",locality:"Chișinău",regionCode:"MD-CU",generatedAt:"2026-09-15T12:01:00.000Z",candidates:[] });
    const service=new InstallationMarketplaceService(repo);
    await service.shortlist(id("1"),id("9"),"ru");
    await service.shortlist(id("1"),id("9"),"ru");
    const calls=vi.mocked(repo.recordRankingDecision).mock.calls;
    expect(calls[0][0].evidenceFingerprint).toBe(calls[1][0].evidenceFingerprint);
  });

  it("requires governed decline reasons and valid verified-review scores", async () => {
    const service=new InstallationMarketplaceService(repository());
    expect(()=>service.respondPartner({ companyId:id("5"),assignmentId:id("2"),decision:"DECLINE",reason:"PRICE",expectedRevision:0,idempotencyKey:id("6") })).toThrow(InstallationMarketplaceInputError);
    expect(()=>service.review({ projectId:id("1"),overall:6,workmanship:5,communication:5,agreement:5,idempotencyKey:id("7") })).toThrow(InstallationMarketplaceInputError);
  });

  it("normalizes bounded partner capabilities and service areas without browser ownership", async () => {
    const repo=repository(); const service=new InstallationMarketplaceService(repo);
    await service.savePartnerActivation({ companyId:id("5"), descriptionRu:" Монтаж ", descriptionRo:" Instalare ", availability:"limited", maxConcurrentJobs:4, capabilities:["cctv","cctv","network"], regionCodes:["MD-CU","MD-CU"], acceptTerms:true, acceptPrivacy:true, expectedRevision:1 });
    expect(repo.savePartnerActivation).toHaveBeenCalledWith(expect.objectContaining({ companyId:id("5"), descriptionRu:"Монтаж", capabilities:["cctv","network"], regionCodes:["MD-CU"] }));
  });

  it("preserves the complete real onboarding payload through the service boundary",async()=>{
    const repo=repository();
    const service=new InstallationMarketplaceService(repo);
    await service.savePartnerActivation({
      companyId:id("5"),descriptionRu:"Монтаж систем",descriptionRo:"Instalarea sistemelor",
      availability:"available",maxConcurrentJobs:2,
      capabilities:["cctv","intercom","access_control","alarm","network","other"],
      regionCodes:["MD-CU"],acceptTerms:true,acceptPrivacy:true,expectedRevision:3,
    });
    expect(repo.savePartnerActivation).toHaveBeenCalledWith({
      companyId:id("5"),descriptionRu:"Монтаж систем",descriptionRo:"Instalarea sistemelor",
      availability:"available",maxConcurrentJobs:2,
      capabilities:["cctv","intercom","access_control","alarm","network","other"],
      regionCodes:["MD-CU"],acceptTerms:true,acceptPrivacy:true,expectedRevision:3,
    });
  });

  it("rejects unsupported capabilities, capacity and Admin rejection reasons", () => {
    const service=new InstallationMarketplaceService(repository());
    expect(()=>service.savePartnerActivation({ companyId:id("5"), availability:"available", maxConcurrentJobs:101, capabilities:["plumbing"], regionCodes:["MD-CU"], acceptTerms:false, acceptPrivacy:false, expectedRevision:0 })).toThrow(InstallationMarketplaceInputError);
    expect(()=>service.reviewPartnerActivation({ providerId:id("5"), action:"REJECT", rejectionReason:"UNBOUNDED", expectedRevision:1 })).toThrow(InstallationMarketplaceInputError);
  });

  it("requires bounded bilingual reasons for governed return to correction", async()=>{
    const repo=repository(); const service=new InstallationMarketplaceService(repo);
    await service.returnPartnerForCorrection({providerId:id("5"),reasonRu:" Требуется уточнение ",reasonRo:" Este necesară completarea ",expectedRevision:5});
    expect(repo.returnPartnerForCorrection).toHaveBeenCalledWith({providerId:id("5"),reasonRu:"Требуется уточнение",reasonRo:"Este necesară completarea",expectedRevision:5});
    expect(()=>service.returnPartnerForCorrection({providerId:id("5"),reasonRu:"",reasonRo:"Este necesară completarea",expectedRevision:5})).toThrow(InstallationMarketplaceInputError);
  });

  it("bounds the supply projection and validates pilot thresholds", async()=>{
    const repo=repository(); const service=new InstallationMarketplaceService(repo);
    await service.getSupplyReport({search:" Partner ",filter:"potential",limit:500,offset:-10});
    expect(repo.getSupplyReport).toHaveBeenCalledWith({search:"Partner",filter:"potential",limit:50,offset:0});
    expect(()=>service.savePilotConfiguration({regionCode:"MD-CU",capability:"cctv",enabled:true,threshold:21,expectedRevision:0,correlationId:id("9")})).toThrow(InstallationMarketplaceInputError);
  });

  it("allows only explicit in-app/email invitation channels", async()=>{
    const repo=repository(); const service=new InstallationMarketplaceService(repo);
    await service.prepareInvitation({companyId:id("7"),locale:"ro",channels:["IN_APP","EMAIL","EMAIL"],expectedRevision:0,readyToSend:true,correlationId:id("9")});
    expect(repo.prepareInvitation).toHaveBeenCalledWith(expect.objectContaining({channels:["IN_APP","EMAIL"],readyToSend:true}));
    expect(()=>service.prepareInvitation({companyId:id("7"),locale:"ru",channels:["SMS"],expectedRevision:0,readyToSend:true,correlationId:id("9")})).toThrow(InstallationMarketplaceInputError);
  });
});

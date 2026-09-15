import { describe, expect, it } from "vitest";
import { evaluateQuality, rankInstallationPartners } from "../ranking";
import type { InstallationRankingCandidateEvidence, InstallationRankingEvidence } from "../types";

const id=(value:number)=>`10000000-0000-4000-8000-${String(value).padStart(12,"0")}`;
function candidate(index:number,overrides:Partial<InstallationRankingCandidateEvidence>={}):InstallationRankingCandidateEvidence{return{
  providerId:id(index),partnerCompanyId:id(index+100),displayName:`Partner ${index}`,description:null,logoPath:null,
  availability:"available",companyActive:true,publicListingEnabled:true,providerOperationalStatus:"active",providerApproved:true,
  marketplaceEnabled:true,profilePublished:true,exactCapability:true,hasAnyActiveRegion:true,geographyRank:0,
  verifiedReviewCount:0,averageOverallRating:null,averageWorkmanshipRating:null,averageCommunicationRating:null,averageAgreementRating:null,
  assignmentCount:0,responseSampleCount:0,acceptedCount:0,declinedCount:0,expiredCount:0,installedCount:0,
  customerConfirmedCount:0,disputeCount:0,cancellationCount:0,medianResponseMinutes:null,eligibleImpressions30d:0,...overrides,
};}
function evidence(candidates:InstallationRankingCandidateEvidence[]):InstallationRankingEvidence{return{projectId:id(900),customerAccountId:id(901),systemType:"cctv",locality:"Chișinău",regionCode:"MD-CU",generatedAt:"2026-09-15T12:00:00.000Z",candidates};}
const ratings=(rating:number,count:number)=>({verifiedReviewCount:count,averageOverallRating:rating,averageWorkmanshipRating:rating,averageCommunicationRating:rating,averageAgreementRating:rating});

describe("Installation Marketplace Ranking V2 acceptance fixtures",()=>{
  it("A/C: ranks strong relevant verified history ahead of B: a perfect one-review sample",()=>{
    const strong=candidate(1,{...ratings(4.8,20),assignmentCount:20,responseSampleCount:20,acceptedCount:18,installedCount:17,customerConfirmedCount:16,medianResponseMinutes:90});
    const tinyPerfect=candidate(2,{...ratings(5,1),assignmentCount:1,responseSampleCount:1,acceptedCount:1,installedCount:1,customerConfirmedCount:1,medianResponseMinutes:20});
    const result=rankInstallationPartners(evidence([tinyPerfect,strong]));
    expect(result.orderedProviderIds).toEqual([strong.providerId,tinyPerfect.providerId]);
    expect(evaluateQuality(tinyPerfect)).toMatchObject({evidenceState:"LOW_SAMPLE",adjustedRating:4.1667});
    expect(result.candidates.find(item=>item.providerId===tinyPerfect.providerId)?.reasonCodes).toContain("LOW_SAMPLE_CONFIDENCE");
  });

  it("D/J: reserves one bounded deterministic slot for a qualified new or underexposed Partner",()=>{
    const established=[1,2,3,4,5].map(index=>candidate(index,{...ratings(4.7,10),assignmentCount:10,responseSampleCount:10,acceptedCount:9,installedCount:8,customerConfirmedCount:8,medianResponseMinutes:120,eligibleImpressions30d:20-index}));
    const newcomer=candidate(6,{eligibleImpressions30d:0});
    const result=rankInstallationPartners(evidence([...established,newcomer]),5);
    expect(result.orderedProviderIds).toHaveLength(5);
    expect(result.orderedProviderIds).toContain(newcomer.providerId);
    expect(result.orderedProviderIds[0]).not.toBe(newcomer.providerId);
    expect(result.candidates.find(item=>item.providerId===newcomer.providerId)?.reasonCodes).toContain("NEW_PARTNER_EXPLORATION");
  });

  it("E/F: explains response speed without letting it erase a substantial verified-quality gap",()=>{
    const fast=candidate(10,{...ratings(4.2,20),assignmentCount:20,responseSampleCount:20,acceptedCount:18,installedCount:17,customerConfirmedCount:16,medianResponseMinutes:60});
    const slowQuality=candidate(11,{...ratings(4.9,20),assignmentCount:20,responseSampleCount:20,acceptedCount:18,installedCount:17,customerConfirmedCount:16,medianResponseMinutes:2000});
    const result=rankInstallationPartners(evidence([slowQuality,fast]));
    expect(result.orderedProviderIds[0]).toBe(slowQuality.providerId);
    expect(result.candidates.find(item=>item.providerId===fast.providerId)?.reasonCodes).toContain("FAST_RESPONSE");
    expect(result.candidates.find(item=>item.providerId===slowQuality.providerId)?.quality?.reasonCodes).toContain("STRONG_VERIFIED_HISTORY");
  });

  it("G: applies a bounded dispute signal without erasing otherwise valid evidence",()=>{
    const clean=candidate(20,{...ratings(4.5,10),assignmentCount:10,responseSampleCount:10,acceptedCount:9,installedCount:8,customerConfirmedCount:8,medianResponseMinutes:180});
    const disputed=candidate(21,{...ratings(4.5,10),assignmentCount:10,responseSampleCount:10,acceptedCount:9,installedCount:8,customerConfirmedCount:7,disputeCount:2,medianResponseMinutes:180});
    const result=rankInstallationPartners(evidence([disputed,clean]));
    expect(result.orderedProviderIds[0]).toBe(clean.providerId);
    expect(result.candidates.find(item=>item.providerId===disputed.providerId)?.reasonCodes).toContain("DISPUTE_SIGNAL");
  });

  it("H/I: excludes out-of-area and wrong-capability candidates regardless of rating",()=>{
    const outOfArea=candidate(30,{...ratings(5,50),geographyRank:null});
    const wrongCapability=candidate(31,{...ratings(5,50),exactCapability:false});
    const valid=candidate(32);
    const result=rankInstallationPartners(evidence([outOfArea,wrongCapability,valid]));
    expect(result.orderedProviderIds).toEqual([valid.providerId]);
    expect(result.candidates.find(item=>item.providerId===outOfArea.providerId)?.reasonCodes).toContain("SERVICE_AREA_MISMATCH");
    expect(result.candidates.find(item=>item.providerId===wrongCapability.providerId)?.reasonCodes).toContain("CAPABILITY_MISMATCH");
  });

  it("keeps V1 shadow order alongside versioned explainable V2 output",()=>{
    const result=rankInstallationPartners(evidence([candidate(41),candidate(40)]));
    expect(result.policyVersion).toBe("installation-ranking-v2.1");
    expect(result.shadowV1ProviderIds).toHaveLength(2);
    expect(result.candidates.every(item=>item.reasonCodes.length>0)).toBe(true);
  });
});

import "server-only";

import { createHash } from "node:crypto";

import { getOneCODataErrorResponseBody } from "@/src/modules/integration/providers/one-c/one-c-odata-client";
import { getOneCSafeDiagnostic } from "@/src/modules/integration/providers/one-c/one-c-safe-diagnostic";
import type { OneCWarrantySerialProvider } from "./one-c-warranty-serial.provider";
import type { WarrantySerialRepository, WarrantySyncClaim } from "./repository";
import { hashSerial, maskSerial, normalizeSerial, protectSerial, WarrantySerialValidationError } from "./serial-security";
import type { WarrantySourceEvent } from "./types";

export type WarrantySerialSyncStepResult = {
  status: "idle" | "page_published" | "completed";
  runId?: string;
  stage?: string;
  headersReceived?: number;
  eventsPublished?: number;
  durationMs: number;
};

export type WarrantySerialSyncBatchResult = {
  status: "idle" | "progressed" | "completed";
  steps: number;
  headersReceived: number;
  eventsPublished: number;
  durationMs: number;
  runId?: string;
};

export class WarrantySerialSyncService {
  constructor(private readonly provider: OneCWarrantySerialProvider, private readonly repository: WarrantySerialRepository) {}

  async runStep(): Promise<WarrantySerialSyncStepResult> {
    const started = performance.now();
    const claim = await this.repository.claim(25);
    if (!claim) return { status: "idle", durationMs: elapsed(started) };
    try {
      if (claim.stage === "state_rebuild") {
        await this.repository.complete(claim);
        return { status: "completed", runId: claim.runId, stage: claim.stage, durationMs: elapsed(started) };
      }
      const page = await this.provider.fetchPage({
        stage: claim.stage,
        skip: claim.skip,
        top: claim.pageSize,
        rangeStart: claim.rangeStart,
        rangeEnd: claim.rangeEnd,
      });
      const events = page.events.flatMap((event) => {
        try {
          return [protectEvent(event)];
        } catch (error) {
          if (!(error instanceof WarrantySerialValidationError)) throw error;
          console.warn({
            event: "warranty_serial_source_value_rejected",
            runId: claim.runId,
            stage: claim.stage,
            sourceEntity: event.sourceEntity,
            sourceDocumentRef: event.sourceDocumentRef,
            sourceLineNumber: event.sourceLineNumber,
            sourceSerialLineNumber: event.sourceSerialLineNumber,
            serialLength: event.serial.length,
            reason: "malformed_serial",
          });
          return [];
        }
      });
      await this.repository.publish({
        runId: claim.runId,
        lockToken: claim.lockToken,
        stage: claim.stage,
        skip: claim.skip,
        headersReceived: page.headersReceived,
        documents: page.documents.map((document) => ({
          source_entity: document.sourceEntity,
          source_document_ref: document.sourceDocumentRef,
          source_document_number: document.sourceDocumentNumber,
          source_document_date: document.sourceDocumentDate,
          source_posted: document.sourcePosted,
          source_deletion_mark: document.sourceDeletionMark,
          source_data_version: document.sourceDataVersion,
          source_fingerprint: document.sourceFingerprint,
        })),
        events,
        pageComplete: page.pageComplete,
      });
      console.info({
        event: "warranty_serial_sync_step_published",
        runId: claim.runId,
        stage: claim.stage,
        skip: claim.skip,
        headersReceived: page.headersReceived,
        eventsPublished: events.length,
        pageComplete: page.pageComplete,
        durationMs: elapsed(started),
      });
      return {
        status: "page_published",
        runId: claim.runId,
        stage: claim.stage,
        headersReceived: page.headersReceived,
        eventsPublished: events.length,
        durationMs: elapsed(started),
      };
    } catch (error) {
      const safeErrorCode = safeCode(error);
      await safeFail(this.repository, claim, safeErrorCode);
      const diagnostic = getOneCSafeDiagnostic(error);
      console.error({
        event: "warranty_serial_sync_step_failed",
        runId: claim.runId,
        stage: claim.stage,
        safeErrorCode,
        statusCode: diagnostic?.statusCode ?? null,
        resourceName: diagnostic?.resourceName ?? null,
        queryParameterNames: diagnostic?.queryParameterNames ?? [],
        safeResponseBody: getOneCODataErrorResponseBody(error)?.slice(0, 4000) ?? null,
      });
      throw error;
    }
  }

  async runBatch(maxSteps = 20, maxDurationMs = 240_000): Promise<WarrantySerialSyncBatchResult> {
    const started = performance.now();
    let steps = 0;
    let headersReceived = 0;
    let eventsPublished = 0;
    let runId: string | undefined;
    while (steps < maxSteps && performance.now() - started < maxDurationMs) {
      const result = await this.runStep();
      if (result.status === "idle") return { status: steps ? "progressed" : "idle", steps, headersReceived, eventsPublished, durationMs: elapsed(started), runId };
      steps += 1;
      runId = result.runId ?? runId;
      headersReceived += result.headersReceived ?? 0;
      eventsPublished += result.eventsPublished ?? 0;
      if (result.status === "completed") return { status: "completed", steps, headersReceived, eventsPublished, durationMs: elapsed(started), runId };
    }
    return { status: "progressed", steps, headersReceived, eventsPublished, durationMs: elapsed(started), runId };
  }
}

function protectEvent(event: WarrantySourceEvent) {
  const normalized = normalizeSerial(event.serial);
  const normalizedSerialHash = hashSerial(normalized);
  return {
    normalized_serial_hash: normalizedSerialHash,
    protected_serial_value: protectSerial(normalized),
    masked_serial: maskSerial(normalized),
    event_type: event.eventType,
    source_entity: event.sourceEntity,
    source_document_ref: event.sourceDocumentRef,
    related_source_document_ref: event.relatedSourceDocumentRef,
    source_document_number: event.sourceDocumentNumber,
    source_document_date: event.sourceDocumentDate,
    source_posted: event.sourcePosted,
    source_deletion_mark: event.sourceDeletionMark,
    source_data_version: event.sourceDataVersion,
    source_line_number: event.sourceLineNumber,
    source_serial_line_number: event.sourceSerialLineNumber,
    source_link_key: event.sourceLinkKey,
    one_c_counterparty_ref: event.counterpartyRef,
    one_c_product_ref: event.productRef,
    characteristic_ref: event.characteristicRef,
    organization_ref: event.organizationRef,
    warehouse_ref: event.warehouseRef,
    quantity: event.quantity,
    product_sku_snapshot: event.productSkuSnapshot,
    product_name_snapshot: event.productNameSnapshot,
    warranty_months_snapshot: event.warrantyMonthsSnapshot,
    mapping_state: event.mappingState,
    review_reason_codes: event.reviewReasonCodes,
    source_fingerprint: createHash("sha256").update([
      normalizedSerialHash,
      event.eventType,
      event.sourceEntity,
      event.sourceDocumentRef,
      event.relatedSourceDocumentRef ?? "",
      event.sourceDataVersion ?? "",
      String(event.sourceLineNumber),
      String(event.sourceSerialLineNumber),
      event.sourceLinkKey,
    ].join("|"), "utf8").digest("hex"),
  };
}

function elapsed(started: number) { return Math.round(performance.now() - started); }
function safeCode(error: unknown) { return (error instanceof Error ? error.name : typeof error).replace(/[^A-Za-z0-9_]/g, "_").slice(0, 100); }
async function safeFail(repository: WarrantySerialRepository, claim: WarrantySyncClaim, code: string) { try { await repository.fail(claim, code); } catch { /* Preserve the original provider failure. */ } }

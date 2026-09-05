"use client";

import { Download, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import type { GeneratedEstimateDocument } from "../types";

export const ESTIMATE_PDF_READY_EVENT = "novotech:estimate-pdf-ready";
export const ESTIMATE_PDF_SHARE_PREPARED_EVENT =
  "novotech:estimate-pdf-share-prepared";
export const PDF_MIME_TYPE = "application/pdf";

export type EstimatePdfReadyDetail = Pick<
  GeneratedEstimateDocument,
  "estimateId" | "estimateRevision" | "id" | "versionId"
>;

export type EstimatePdfSharePreparedDetail = {
  documentId: string;
  fetchDurationMs: number;
  fileSizeBytes: number;
  preparationDurationMs: number;
};

type ShareNavigator = Navigator & {
  canShare?: (data?: ShareData) => boolean;
  share?: (data?: ShareData) => Promise<void>;
};

type ShareStatus = { kind: "error" | "fallback"; message: string } | null;

export function EstimatePdfShareAction({
  className,
  documentId,
  downloadLabel,
  errorMessage,
  fallbackMessage,
  fileName,
  preparingLabel,
  shareLabel,
  text,
  title,
}: {
  className: string;
  documentId: string;
  downloadLabel: string;
  errorMessage: string;
  fallbackMessage: string;
  fileName: string;
  preparingLabel: string;
  shareLabel: string;
  text: string;
  title: string;
}) {
  const href = `/api/estimates/documents/${documentId}`;
  const nativeShareAvailable = useSyncExternalStore(
    subscribeToStaticCapability,
    hasNativeShare,
    () => false,
  );
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<ShareStatus>(null);

  if (!nativeShareAvailable) {
    return (
      <a
        aria-label={downloadLabel}
        className={className}
        data-testid="estimate-mobile-pdf-fallback"
        download={fileName}
        href={href}
      >
        <Download className="size-4 shrink-0" />
        <span className="truncate">{downloadLabel}</span>
      </a>
    );
  }

  const sharePdf = async () => {
    if (pending) return;
    setPending(true);
    setStatus(null);
    let file: File | null = null;
    try {
      const startedAt = performance.now();
      const fetchStartedAt = performance.now();
      file = await fetchGovernedPdfFile(href, fileName);
      const fileReadyAt = performance.now();
      const shareData: ShareData = { files: [file], title, text };
      const shareNavigator = navigator as ShareNavigator;
      if (
        typeof shareNavigator.canShare === "function" &&
        !shareNavigator.canShare({ files: [file] })
      ) {
        downloadPdfFile(file);
        setStatus({ kind: "fallback", message: fallbackMessage });
        return;
      }
      window.dispatchEvent(
        new CustomEvent<EstimatePdfSharePreparedDetail>(
          ESTIMATE_PDF_SHARE_PREPARED_EVENT,
          {
            detail: {
              documentId,
              fetchDurationMs: fileReadyAt - fetchStartedAt,
              fileSizeBytes: file.size,
              preparationDurationMs: performance.now() - startedAt,
            },
          },
        ),
      );
      await shareNavigator.share?.(shareData);
    } catch (error) {
      if (isShareCancellation(error)) return;
      if (file && error instanceof TypeError) {
        downloadPdfFile(file);
        setStatus({ kind: "fallback", message: fallbackMessage });
        return;
      }
      setStatus({ kind: "error", message: errorMessage });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        aria-label={shareLabel}
        className={className}
        data-testid="estimate-mobile-share-action"
        disabled={pending}
        onClick={sharePdf}
        type="button"
      >
        <Share2 className="size-4 shrink-0" />
        <span className="truncate">{pending ? preparingLabel : shareLabel}</span>
      </button>
      {status ? (
        <p
          aria-live="polite"
          className={`fixed inset-x-3 z-[60] mx-auto max-w-lg border-l-4 px-3 py-2 text-sm shadow-lg ${
            status.kind === "error"
              ? "border-red-600 bg-red-50 text-red-900"
              : "border-emerald-600 bg-emerald-50 text-emerald-900"
          }`}
          data-testid="estimate-share-status"
          role="status"
          style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        >
          {status.message}
        </p>
      ) : null}
    </>
  );
}

export function notifyEstimatePdfReady(document: GeneratedEstimateDocument) {
  window.dispatchEvent(
    new CustomEvent<EstimatePdfReadyDetail>(ESTIMATE_PDF_READY_EVENT, {
      detail: {
        estimateId: document.estimateId,
        estimateRevision: document.estimateRevision,
        id: document.id,
        versionId: document.versionId,
      },
    }),
  );
}

export function canonicalEstimatePdfFileName(estimateNumber: string): string {
  const safeNumber = estimateNumber.trim().replace(/[^A-Za-z0-9._-]+/g, "-");
  return safeNumber ? `${safeNumber}.pdf` : "commercial-proposal.pdf";
}

export async function fetchGovernedPdfFile(
  href: string,
  fileName: string,
): Promise<File> {
  const response = await fetch(href, {
    credentials: "same-origin",
    headers: { Accept: PDF_MIME_TYPE },
  });
  const contentType = response.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (!response.ok || contentType !== PDF_MIME_TYPE) {
    throw new Error("PDF_UNAVAILABLE");
  }
  const blob = await response.blob();
  if (blob.size < 1 || blob.type.toLowerCase() !== PDF_MIME_TYPE) {
    throw new Error("PDF_INVALID");
  }
  return new File([blob], fileName, { type: PDF_MIME_TYPE });
}

export function isShareCancellation(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError";
}

function hasNativeShare(): boolean {
  return typeof navigator !== "undefined" &&
    typeof (navigator as ShareNavigator).share === "function";
}

function subscribeToStaticCapability() {
  return () => undefined;
}

function downloadPdfFile(file: File) {
  const href = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.download = file.name;
  anchor.href = href;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

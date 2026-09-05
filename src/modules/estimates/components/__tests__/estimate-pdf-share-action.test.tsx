import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canonicalEstimatePdfFileName,
  EstimatePdfShareAction,
  PDF_MIME_TYPE,
} from "../EstimatePdfShareAction";

const props = {
  className: "share-action",
  documentId: "document-1",
  downloadLabel: "Скачать PDF",
  errorMessage: "Не удалось поделиться PDF.",
  fallbackMessage: "PDF скачан.",
  fileName: "KP-2026-000096.pdf",
  preparingLabel: "Подготовка...",
  shareLabel: "Поделиться",
  text: "Коммерческое предложение KP-2026-000096",
  title: "Коммерческое предложение",
};

describe("EstimatePdfShareAction", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
          headers: { "Content-Type": PDF_MIME_TYPE },
        }),
      ),
    );
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "canShare");
    vi.restoreAllMocks();
  });

  it("fetches only on the user action and shares one governed PDF File", async () => {
    const user = userEvent.setup();
    render(<EstimatePdfShareAction {...props} />);
    const share = await screen.findByRole("button", { name: "Поделиться" });
    expect(fetch).not.toHaveBeenCalled();

    await user.click(share);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "/api/estimates/documents/document-1",
      { credentials: "same-origin", headers: { Accept: PDF_MIME_TYPE } },
    );
    const data = vi.mocked(navigator.share).mock.calls[0]?.[0];
    const file = data?.files?.[0];
    expect(navigator.canShare).toHaveBeenCalledWith({ files: [file] });
    expect(file).toBeInstanceOf(File);
    expect(file).toEqual(
      expect.objectContaining({
        name: "KP-2026-000096.pdf",
        size: 5,
        type: PDF_MIME_TYPE,
      }),
    );
    expect(data).toEqual(
      expect.objectContaining({
        title: "Коммерческое предложение",
        text: "Коммерческое предложение KP-2026-000096",
      }),
    );
  });

  it("renders the existing governed download when Web Share is unsupported", async () => {
    Reflect.deleteProperty(navigator, "share");
    render(<EstimatePdfShareAction {...props} />);

    const fallback = await screen.findByRole("link", { name: "Скачать PDF" });
    expect(fallback).toHaveAttribute(
      "href",
      "/api/estimates/documents/document-1",
    );
    expect(fallback).toHaveAttribute("download", "KP-2026-000096.pdf");
    expect(screen.queryByRole("button", { name: "Поделиться" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("downloads the fetched PDF when canShare rejects file sharing", async () => {
    const user = userEvent.setup();
    vi.mocked(navigator.canShare).mockReturnValue(false);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn().mockReturnValue("blob:proposal"),
      revokeObjectURL: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<EstimatePdfShareAction {...props} />);

    await user.click(await screen.findByRole("button", { name: "Поделиться" }));

    expect(navigator.share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("PDF скачан.");
  });

  it("treats user cancellation as a neutral outcome", async () => {
    const user = userEvent.setup();
    vi.mocked(navigator.share).mockRejectedValue(
      new DOMException("Cancelled", "AbortError"),
    );
    render(<EstimatePdfShareAction {...props} />);

    await user.click(await screen.findByRole("button", { name: "Поделиться" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Поделиться" })).toBeEnabled();
  });

  it("shows customer-safe feedback for a real share or PDF fetch failure", async () => {
    const user = userEvent.setup();
    vi.mocked(navigator.share).mockRejectedValueOnce(new Error("native failure"));
    const { rerender } = render(<EstimatePdfShareAction {...props} />);
    await user.click(await screen.findByRole("button", { name: "Поделиться" }));
    expect(screen.getByRole("status")).toHaveTextContent(props.errorMessage);
    expect(screen.getByRole("status")).not.toHaveTextContent("native failure");

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("denied", {
        headers: { "Content-Type": "application/json" },
        status: 403,
      }),
    );
    rerender(<EstimatePdfShareAction {...props} documentId="document-2" />);
    await user.click(screen.getByRole("button", { name: "Поделиться" }));
    await waitFor(() => expect(navigator.share).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent(props.errorMessage);
  });

  it("creates a customer-safe canonical filename", () => {
    expect(canonicalEstimatePdfFileName("KP-2026-000096")).toBe(
      "KP-2026-000096.pdf",
    );
    expect(canonicalEstimatePdfFileName("  ")).toBe("commercial-proposal.pdf");
  });
});

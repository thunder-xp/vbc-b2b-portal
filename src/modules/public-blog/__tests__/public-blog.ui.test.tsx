import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";

import { PublicBlogArticleView, PublicBlogCardView } from "../components";

vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => createElement("img", { alt: String(props.alt), src: String(props.src) }) }));

const card = { id: "a", slug: "camera-guide", categorySlug: "video-surveillance", featured: true, title: "Как выбрать камеру", excerpt: "Практическое руководство по выбору камеры.", heroUrl: "/hero.webp", heroAlt: "Камера", publishedAt: "2026-08-24T10:00:00Z", updatedAt: "2026-08-24T10:00:00Z" };

describe("public Blog UI", () => {
  it("renders a localized, accessible card with a canonical public route", () => {
    render(<PublicBlogCardView article={card} locale="ru" />);
    expect(screen.getByRole("heading", { name: card.title })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: card.title })[0]).toHaveAttribute("href", "/blog/camera-guide?lang=ru");
    expect(screen.getByAltText("Камера")).toBeInTheDocument();
  });

  it("renders semantic H2/H3, safe text, and governed related links", () => {
    render(<PublicBlogArticleView locale="ru" article={{ ...card, content: [{ type: "heading2", text: "Выбор" }, { type: "paragraph", text: "Только безопасный текст." }, { type: "heading3", text: "Монтаж" }], metaTitle: null, metaDescription: null, heroWidth: 1600, heroHeight: 900, products: [], categories: [{ id: "c", slug: "cctv", name: "CCTV" }], services: [{ key: "installation", href: "/installation" }], related: [] }} />);
    expect(screen.getByRole("heading", { level: 2, name: "Выбор" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Монтаж" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CCTV" })).toHaveAttribute("href", "/catalog?lang=ru&category=cctv");
    expect(screen.getByRole("link", { name: "Монтаж" })).toHaveAttribute("href", "/installation?lang=ru");
  });
});

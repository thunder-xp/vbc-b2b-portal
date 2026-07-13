import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Партнёрская платформа",
  description:
    "Безопасный B2B-кабинет для партнёров: каталог, цены, наличие, документы и спецификации.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.nsd.md"),
  title: "Novotech Systems Distribution",
  description:
    "Системы безопасности, профессиональное оборудование и решения Novotech.",
  applicationName: "Novotech Systems Distribution",
  openGraph: {
    siteName: "Novotech Systems Distribution",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = (await headers()).get("x-novotech-document-locale") === "ro" ? "ro" : "ru";

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

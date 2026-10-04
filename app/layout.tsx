import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.nsd.md"),
  title: "NOVOTECH SYSTEMS DISTRIBUTION",
  description:
    "Системы безопасности, профессиональное оборудование и решения NOVOTECH.",
  applicationName: "NOVOTECH SYSTEMS DISTRIBUTION",
  openGraph: {
    siteName: "NOVOTECH SYSTEMS DISTRIBUTION",
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
    <html lang={locale} className="h-full antialiased" data-app-font="System UI">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

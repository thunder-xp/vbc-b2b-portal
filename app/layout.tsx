import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const appFont = Inter_Tight({
  display: "swap",
  subsets: ["cyrillic", "latin"],
  variable: "--font-inter-tight",
  weight: ["400", "500", "600", "700"],
});

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
    <html lang={locale} className={`${appFont.variable} h-full antialiased`} data-app-font="Inter Tight">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

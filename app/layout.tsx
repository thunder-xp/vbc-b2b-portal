import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const partnerCabinetFont = IBM_Plex_Sans({
  display: "swap",
  subsets: ["cyrillic", "latin"],
  variable: "--font-partner-cabinet",
  weight: ["400", "500", "600", "700"],
});

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
    <html lang={locale} className={`${partnerCabinetFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

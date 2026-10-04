import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const appFont = Inter({
  display: "swap",
  subsets: ["cyrillic", "latin"],
  variable: "--font-inter",
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
    <html lang={locale} className={`${appFont.variable} h-full antialiased`} data-app-font="Inter">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

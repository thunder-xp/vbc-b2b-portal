import type { Metadata } from "next";
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

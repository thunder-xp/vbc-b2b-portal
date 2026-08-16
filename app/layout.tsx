import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.nsd.md"),
  title: "Novotech Systems Distribution",
  description:
    "Системы безопасности, видеонаблюдение, профессиональное оборудование и монтаж в Молдове.",
  applicationName: "Novotech Systems Distribution",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
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

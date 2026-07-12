import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Novotech Systems B2B Partner Platform",
  description:
    "Partner-facing B2B portal for Novotech Systems distribution business.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Float — Undercollateralized Credit Line for AI Agents",
  description:
    "Autonomous agent credit facility gated by World ID, backed by human liability, and settled natively on Base and Sui.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=Martian+Mono:wght@300;400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
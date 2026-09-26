import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Lifeline - credit for agents, on a human's pulse",
  description:
    "An undercollateralised credit line for autonomous agents. One World ID-verified human, one line, spent on Arc and Sui - and every agent's payments read like a heartbeat.",
  icons: { icon: "/icon.svg" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
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
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;1,6..72,300;1,6..72,400&family=Hanken+Grotesk:wght@400;500;600&family=Martian+Mono:wght@300;400;500&display=swap"
        />
      </head>
      <body className="strip">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

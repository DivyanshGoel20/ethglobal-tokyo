import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Lifeline - credit for agents, on a human's pulse",
  description:
    "Undercollateralised credit for autonomous agents. One World ID-verified human, a line on Arc and a separate line on Sui - and every agent's payments read like a heartbeat.",
  icons: { icon: "/icon.svg" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

// Runs before any of the app's own scripts, so it can report a bundle that
// fails to load or parse - on a phone, inside World App, where there is no
// console to read. Reports go to /api/debug/client-log and the server log.
const REPORTER = `(function(){var n=0;function send(k,m,s){if(n++>25)return;var b=JSON.stringify({k:k,m:String(m||'').slice(0,500),s:String(s||'').slice(0,1500),u:location.pathname,ua:navigator.userAgent});try{if(navigator.sendBeacon&&navigator.sendBeacon('/api/debug/client-log',b))return}catch(e){}try{fetch('/api/debug/client-log',{method:'POST',body:b,keepalive:true})}catch(e){}}window.__lifelineReport=send;window.addEventListener('error',function(e){var t=e.target;if(t&&t!==window&&(t.src||t.href)){send('load-failed',t.src||t.href,t.tagName);return}send('error',e.message,(e.error&&e.error.stack)||(e.filename+':'+e.lineno+':'+e.colno))},true);window.addEventListener('unhandledrejection',function(e){var r=e.reason;send('rejection',r&&r.message||r,r&&r.stack)});})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: REPORTER }} />
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

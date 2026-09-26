"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * "Open in World App": a link, as a QR code, that opens Lifeline in World App
 * as this account, where the phone proves the account's World ID session and
 * its wallet is added. Offered only when the account has a session to prove.
 */
export const AccountLinks: React.FC<{ onToast: (m: string) => void }> = ({ onToast }) => {
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [qr, setQr] = useState<{ url: string; img: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setHasSession(!!d.hasWorldSession))
      .catch(() => {});
  }, []);

  const openInWorldApp = async () => {
    if (qr) return setQr(null);
    const res = await fetch("/api/auth/link-token", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return onToast(d.error || "Could not make a link.");
    setQr({ url: d.url, img: await QRCode.toDataURL(d.url, { margin: 1, width: 360 }) });
  };

  if (!hasSession) return null;

  return (
    <div className="pt-6 space-y-3">
      <div className="flex justify-end">
        <button onClick={openInWorldApp} className="mono text-[10.5px] ink-3 underline underline-offset-2">
          {qr ? "hide" : "Open in World App"}
        </button>
      </div>
      {qr && (
        <div className="flex gap-4 items-center justify-end">
          <p className="text-[12.5px] ink-2 max-w-[40ch] text-right">
            Scan with your phone. Lifeline opens in World App as you; World ID confirms it and your wallet is added. The
            link lasts ten minutes.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.img} alt="Open in World App" className="w-[120px] h-[120px] bg-white p-1" />
        </div>
      )}
    </div>
  );
};

"use client";

import React, { useState } from "react";
import QRCode from "qrcode";
import { Sheet, ErrorNote } from "./Sheet";

/**
 * Carry this account into World App.
 *
 * World ID will not issue someone's uniqueness proof twice, so a human who
 * signed up here cannot prove themselves again from the phone. This signed-in
 * browser vouches instead: a ten-minute link, opened in World App, binds the
 * wallet that opens it to this human.
 */
export const WorldAppLink: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setOpen(true);
    setError(null);
    setQr(null);
    try {
      const res = await fetch("/api/auth/wallet/link-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not make a link");
      setUrl(data.url);
      setQr(
        await QRCode.toDataURL(data.url, {
          margin: 1,
          width: 520,
          color: { dark: "#1b1613", light: "#f7f3ec" },
        })
      );
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <>
      <button onClick={start} className="btn btn-quiet">
        World App
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} kicker="Take your line with you" title="Open in World App" width={420}>
        <p className="text-[13px] ink-2 leading-relaxed mb-5">
          Scan with your phone&apos;s camera. Lifeline opens in World App, you sign in with your wallet, and it is linked to
          this account. The code works once, for ten minutes.
        </p>
        {error && <ErrorNote>{error}</ErrorNote>}
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing to optimise
          <img src={qr} alt="QR code that opens Lifeline in World App" className="w-full" style={{ border: "1px solid var(--rule)" }} />
        ) : (
          !error && <div className="mono text-[11px] ink-3 py-16 text-center">making a link…</div>
        )}
        {url && (
          <button onClick={() => navigator.clipboard?.writeText(url)} className="btn btn-quiet mt-3">
            Copy link
          </button>
        )}
      </Sheet>
    </>
  );
};

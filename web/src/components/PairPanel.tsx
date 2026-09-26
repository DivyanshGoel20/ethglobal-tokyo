"use client";

import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

/**
 * Sign this browser in from World App.
 *
 * For someone who has already joined - so World ID's one-time proof is spent -
 * on a browser that does not know them. Scanning opens Lifeline in World App,
 * which is signed in with their wallet and approves this code; the browser
 * collects its session.
 */
export const PairPanel: React.FC<{ onSignedIn: (human: string) => void; onClose: () => void }> = ({ onSignedIn, onClose }) => {
  const [pair, setPair] = useState<{ code: string; url: string; qr: string; expiresAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  // One code per round. React runs effects twice in development, and each run
  // started its own code; the request is shared instead.
  const started = useRef<{ round: number; request: Promise<any> } | null>(null);

  useEffect(() => {
    let live = true;
    setPair(null);
    setError(null);
    if (started.current?.round !== round) {
      started.current = { round, request: fetch("/api/auth/pair", { method: "POST" }).then((r) => r.json()) };
    }
    started.current.request
      .then(async (d) => {
        const qr = await QRCode.toDataURL(d.url, { margin: 1, width: 360, color: { dark: "#111111", light: "#ffffff" } });
        if (live) setPair({ ...d, qr });
      })
      .catch(() => live && setError("Could not start. Try again."));
    return () => {
      live = false;
    };
  }, [round]);

  useEffect(() => {
    if (!pair) return;
    const t = setInterval(async () => {
      // The code on screen, and only that one.
      const d = await fetch(`/api/auth/pair?code=${encodeURIComponent(pair.code)}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null);
      if (d?.status === "approved") {
        clearInterval(t);
        onSignedIn(d.nullifierHash);
      } else if (d?.status === "expired" || Date.now() > pair.expiresAt) {
        clearInterval(t);
        setError("That code expired.");
      }
    }, 2000);
    return () => clearInterval(t);
  }, [pair, onSignedIn]);

  return (
    <div className="mt-5 p-4 space-y-3" style={{ border: "1px solid var(--rule)" }}>
      <div className="flex items-baseline justify-between">
        <span className="lab">Sign in from World App</span>
        <button onClick={onClose} className="mono text-[10.5px] ink-3 underline underline-offset-2">
          close
        </button>
      </div>
      {error ? (
        <div className="flex items-center justify-between gap-3">
          <span className="mono text-[11px]" style={{ color: "var(--alarm)" }}>
            {error}
          </span>
          <button className="btn btn-quiet" onClick={() => setRound((r) => r + 1)}>
            New code
          </button>
        </div>
      ) : !pair ? (
        <div className="mono text-[11px] ink-3">Preparing a code…</div>
      ) : (
        <div className="flex gap-4 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pair.qr} alt="Scan with your phone" className="w-[132px] h-[132px] shrink-0 bg-white p-1" />
          <div className="space-y-2 text-[12.5px] ink-2 leading-snug">
            <p>Scan with your phone. Lifeline opens in World App, signed in with your wallet - approve there.</p>
            <p className="mono text-[11px]">
              code <span style={{ color: "var(--ink)" }}>{pair.code}</span> · waiting…
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

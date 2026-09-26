"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { WorldAgentApproval } from "./WorldAgentApproval";

/**
 * Two small links above the vitals.
 *
 * "Open in World App": a link, as a QR code, that opens Lifeline in World App
 * as this account, where the phone proves the account's World ID session and
 * its wallet is added. Offered only when the account has a session to prove.
 *
 * "Agent approvals": whether World ID for Agents is linked, and linking it -
 * once - so the account's own World ID can approve what its agents are held
 * on. Offered only where World ID for Agents is set up.
 */
export const AccountLinks: React.FC<{ onToast: (m: string) => void }> = ({ onToast }) => {
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<{ configured: boolean; linked: boolean } | null>(null);
  const [linking, setLinking] = useState(false);
  const [qr, setQr] = useState<{ url: string; img: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setHasSession(!!d.hasWorldSession))
      .catch(() => {});
    fetch("/api/auth/world-agents/link", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAgents({ configured: !!d.configured, linked: !!d.linked }))
      .catch(() => {});
  }, []);

  const openInWorldApp = async () => {
    if (qr) return setQr(null);
    const res = await fetch("/api/auth/link-token", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return onToast(d.error || "Could not make a link.");
    setQr({ url: d.url, img: await QRCode.toDataURL(d.url, { margin: 1, width: 360 }) });
  };

  const showAgents = agents?.configured;
  if (!hasSession && !showAgents) return null;

  return (
    <div className="pt-6 space-y-3">
      <div className="flex flex-wrap justify-end gap-x-5 gap-y-1">
        {showAgents &&
          (agents!.linked ? (
            <span className="mono text-[10.5px] ink-3">
              agent approvals · <span style={{ color: "var(--steady)" }}>World ID linked</span>
            </span>
          ) : (
            <button onClick={() => setLinking((l) => !l)} className="mono text-[10.5px] ink-3 underline underline-offset-2">
              {linking ? "hide" : "Link World ID for agent approvals"}
            </button>
          ))}
        {hasSession && (
          <button onClick={openInWorldApp} className="mono text-[10.5px] ink-3 underline underline-offset-2">
            {qr ? "hide" : "Open in World App"}
          </button>
        )}
      </div>
      {linking && (
        <div className="sheet p-4 sm:p-5 max-w-[520px] ml-auto">
          <WorldAgentApproval
            onDone={({ message }) => {
              setLinking(false);
              setAgents((a) => (a ? { ...a, linked: true } : a));
              onToast(message);
            }}
            onCancel={() => setLinking(false)}
          />
        </div>
      )}
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

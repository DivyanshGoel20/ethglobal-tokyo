"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Rail } from "@/types";
import { LifelineMark } from "./Pulse";

interface HeaderProps {
  rail: Rail;
  nullifierHash: string;
  onSignOut: () => void;
  /** Offer Sui only when it is deployed and configured here. */
  suiReady?: boolean;
}

const RAILS: { id: Rail; name: string }[] = [
  { id: "arc", name: "Arc" },
  { id: "sui", name: "Sui" },
];

/** The rails, each at its own URL, as a square two-way switch. */
function RailLinks({ value, suiReady }: { value: Rail; suiReady: boolean }) {
  return (
    <nav className="flex items-stretch h-8" style={{ border: "1px solid var(--rule)" }} aria-label="Rail">
      {RAILS.map((o) => {
        const active = value === o.id;
        const off = o.id === "sui" && !suiReady;
        const style = {
          background: active ? "var(--solid-bg)" : "transparent",
          color: active ? "var(--solid-fg)" : "var(--ink-2)",
        };
        const cls = "px-3.5 flex items-center mono text-[10.5px] tracking-[0.08em] uppercase transition-colors";
        return off ? (
          <span key={o.id} title="Lifeline is not deployed on Sui here" className={`${cls} opacity-35 cursor-not-allowed`} style={style}>
            {o.name}
          </span>
        ) : (
          <Link key={o.id} href={`/${o.id}`} aria-current={active ? "page" : undefined} className={cls} style={style}>
            {o.name}
          </Link>
        );
      })}
    </nav>
  );
}

export const Header: React.FC<HeaderProps> = ({
  rail,
  nullifierHash,
  onSignOut,
  suiReady = true,
}) => {
  const [copied, setCopied] = useState(false);
  const short = nullifierHash ? `${nullifierHash.slice(0, 6)}…${nullifierHash.slice(-4)}` : "verified";

  return (
    <header className="rule-b" style={{ background: "var(--ground)" }}>
      <div className="max-w-[1180px] mx-auto px-4 sm:px-10 h-16 flex items-center justify-between gap-3 sm:gap-6">
        <div className="flex items-center gap-3 sm:gap-8 min-w-0">
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <LifelineMark size={16} />
            <span className="serif text-[21px] sm:text-[25px] leading-none tracking-tight">Lifeline</span>
          </div>

          <div className="flex items-center gap-2">
<RailLinks value={rail} suiReady={suiReady} />
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-5 shrink-0">
          <button
            onClick={() => {
              if (!nullifierHash) return;
              navigator.clipboard?.writeText(nullifierHash);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
            className="hidden sm:flex items-center gap-2.5"
            title="Your World ID nullifier for Lifeline - click to copy"
          >
            <span className="lab">World ID</span>
            <span className="mono text-[11px]">{copied ? "copied" : short}</span>
          </button>
          <button onClick={onSignOut} className="btn btn-quiet" style={{ paddingInline: 10 }}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
};

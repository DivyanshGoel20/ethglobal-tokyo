"use client";

import React, { useState } from "react";
import { Rail } from "@/types";
import { LifelineMark } from "./Pulse";

interface HeaderProps {
  rail: Rail;
  setRail: (rail: Rail) => void;
  nullifierHash: string;
  onSignOut: () => void;
  /** Offer Sui only when it is deployed and configured here. */
  suiReady?: boolean;
}

const RAILS: { id: Rail; name: string }[] = [
  { id: "arc", name: "Arc" },
  { id: "sui", name: "Sui" },
];

/** A square two-way switch, as used for the rail. */
function Switch<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { id: T; name: string }[];
  onChange: (v: T) => void;
  disabled?: (v: T) => string | undefined;
}) {
  return (
    <nav className="flex items-stretch h-8" style={{ border: "1px solid var(--rule)" }} aria-label={label}>
      {options.map((o) => {
        const active = value === o.id;
        const why = disabled?.(o.id);
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            disabled={!!why}
            title={why}
            aria-pressed={active}
            className="px-3.5 flex items-center mono text-[10.5px] tracking-[0.08em] uppercase transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
            style={{
              background: active ? "var(--solid-bg)" : "transparent",
              color: active ? "var(--solid-fg)" : "var(--ink-2)",
            }}
          >
            {o.name}
          </button>
        );
      })}
    </nav>
  );
}

export const Header: React.FC<HeaderProps> = ({
  rail,
  setRail,
  nullifierHash,
  onSignOut,
  suiReady = true,
}) => {
  const [copied, setCopied] = useState(false);
  const short = nullifierHash ? `${nullifierHash.slice(0, 6)}…${nullifierHash.slice(-4)}` : "verified";

  return (
    <header className="rule-b" style={{ background: "var(--ground)" }}>
      <div className="max-w-[1180px] mx-auto px-6 sm:px-10 h-16 flex items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <LifelineMark size={18} />
            <span className="serif text-[25px] leading-none tracking-tight">Lifeline</span>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              label="Rail"
              value={rail}
              options={RAILS}
              onChange={setRail}
              disabled={(r) => (r === "sui" && !suiReady ? "Lifeline is not deployed on Sui here" : undefined)}
            />
          </div>
        </div>

        <div className="flex items-center gap-5">
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
          <button onClick={onSignOut} className="btn btn-quiet">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
};

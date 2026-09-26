"use client";

import React, { useEffect, useState } from "react";
import type { Rail } from "@/types";

type RailStanding = { status: "good" | "delinquent" | "defaulted"; overdueUsd: number; dueSince?: number; defaultsAt?: number };

const day = (ms?: number) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

/** Shown only when this rail's line is suspended or in default. */
export const StandingBanner: React.FC<{ rail: Rail; refreshTrigger?: number; onRepay: () => void }> = ({ rail, refreshTrigger, onRepay }) => {
  const [s, setS] = useState<RailStanding | null>(null);

  useEffect(() => {
    setS(null);
    fetch("/api/standing", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setS(d[rail]))
      .catch(() => {});
  }, [rail, refreshTrigger]);

  if (!s || s.status === "good") return null;
  const what = rail === "arc" ? "Arc" : "Sui";

  return (
    <div className="mt-6 px-4 py-3 flex flex-wrap items-center justify-between gap-3" style={{ background: "var(--alarm-soft)", border: "1px solid var(--alarm)" }}>
      <div className="min-w-0">
        <div className="lab" style={{ color: "var(--alarm)" }}>
          {s.status === "defaulted" ? `${what} line in default` : `${what} line suspended`}
        </div>
        <p className="text-[13.5px] leading-snug mt-1">
          ${s.overdueUsd.toFixed(2)} {s.status === "defaulted" ? "is unpaid" : `has been past due since ${day(s.dueSince)}`}. Your
          agents cannot borrow until it is repaid.
          {s.status === "delinquent" && s.defaultsAt ? ` Unpaid by ${day(s.defaultsAt)}, it becomes a default on chain and your record resets to the first tier.` : ""}
          {s.status === "defaulted" ? " The default is recorded on chain and your record is back at the first tier." : ""}
        </p>
      </div>
      <button className="btn btn-solid shrink-0" onClick={onRepay}>
        Repay
      </button>
    </div>
  );
};

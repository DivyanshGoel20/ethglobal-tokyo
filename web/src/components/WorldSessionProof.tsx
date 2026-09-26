"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CredentialRequest, any } from "@worldcoin/idkit";
import type { IDKitResultSession, IDKitErrorCodes, RpContext } from "@worldcoin/idkit";

const IDKitSessionWidget = dynamic(() => import("@worldcoin/idkit").then((m) => m.IDKitSessionWidget), { ssr: false });

// Whichever World ID credential the human holds.
const CONSTRAINTS = any(CredentialRequest("proof_of_human"), CredentialRequest("selfie"));

/**
 * A World ID session proof: how a human who has joined signs in again.
 *
 * `create` starts a session for the human who has just proved uniqueness;
 * `prove` proves the one saved to their account. Unlike the uniqueness proof,
 * this can be done as often as needed. The server verifies it and says who.
 */
export const WorldSessionProof: React.FC<{
  sessionId?: string | null;
  onDone: (human: string) => void;
  onError: (message: string) => void;
  onCancel: () => void;
}> = ({ sessionId, onDone, onError, onCancel }) => {
  const [rp, setRp] = useState<RpContext | null>(null);
  const human = useRef("");
  const failed = useRef(false);

  useEffect(() => {
    fetch("/api/auth/world-rp-context?kind=session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setRp({ rp_id: d.rp_id, nonce: d.nonce, created_at: Number(d.created_at), expires_at: Number(d.expires_at), signature: d.signature });
      })
      .catch((e) => onError(e.message || "Could not start World ID."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!rp) return null;

  const appId = (process.env.NEXT_PUBLIC_WORLD_APP_ID || "app_6ad9b6ef952f1c2a9a70a58e05aa9878") as `app_${string}`;

  return (
    <IDKitSessionWidget
      open
      onOpenChange={(o) => {
        if (!o && !human.current && !failed.current) onCancel();
      }}
      app_id={appId}
      rp_context={rp}
      constraints={CONSTRAINTS}
      existing_session_id={(sessionId || undefined) as `session_${string}` | undefined}
      environment={(process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT as "production" | "staging") || "production"}
      handleVerify={async (result: IDKitResultSession) => {
        const res = await fetch("/api/auth/world-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.verified) {
          failed.current = true;
          onError(data.error || "World ID could not confirm it is you.");
          throw new Error(data.error);
        }
        human.current = String(data.nullifierHash);
      }}
      onSuccess={() => onDone(human.current)}
      onError={(code: IDKitErrorCodes) => {
        failed.current = true;
        onError(`World ID did not complete (${code}).`);
      }}
    />
  );
};

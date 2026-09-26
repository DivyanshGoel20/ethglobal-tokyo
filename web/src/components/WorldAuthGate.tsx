"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { proofOfHuman, setDebug } from "@worldcoin/idkit";
import type { RpContext, IDKitResult, IDKitErrorCodes, IDKitDebugReport } from "@worldcoin/idkit";
import { LifelineMark } from "./Pulse";

// Dynamically load the widget to prevent SSR window issues
const IDKitRequestWidget = dynamic(
  () => import("@worldcoin/idkit").then((mod) => mod.IDKitRequestWidget),
  { ssr: false }
);

interface WorldAuthGateProps {
  onVerified?: (nullifierHash: string) => void;
  onSignIn?: (nullifierHash?: string) => void;
}

/**
 * Sign in with World ID.
 *
 * One proof of human per sign-in. Its nullifier is the same for the same
 * person every time - here or in World App - so it is the human's identity
 * and the key to their one credit line.
 */
export const WorldAuthGate: React.FC<WorldAuthGateProps> = ({ onVerified, onSignIn }) => {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isVerifyingProof, setIsVerifyingProof] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Set in handleVerify, read in onSuccess - which fires before a state update
  // from handleVerify would be visible.
  const human = useRef("");

  const appId = (process.env.NEXT_PUBLIC_WORLD_APP_ID || "app_6ad9b6ef952f1c2a9a70a58e05aa9878") as `app_${string}`;
  const action = process.env.NEXT_PUBLIC_WORLD_ACTION || "lifeline-human-verify";
  const worldEnvironment = (process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT || "production") as "production" | "staging";

  useEffect(() => {
    try {
      setDebug(true);
    } catch {
      // ignore
    }
    setMounted(true);
  }, []);

  const handleStartSignIn = async () => {
    setIsPreparing(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/auth/world-rp-context", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not initialize World ID session signature.");
      setRpContext({
        rp_id: data.rp_id,
        nonce: data.nonce,
        created_at: Number(data.created_at),
        expires_at: Number(data.expires_at),
        signature: data.signature,
      });
      setOpen(true);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to connect to World ID Relying Party service.");
    } finally {
      setIsPreparing(false);
    }
  };

  const verify = async (result: IDKitResult) => {
    setIsVerifyingProof(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/auth/world-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rp_id: rpContext?.rp_id, idkitResponse: result, result }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.verified) throw new Error(data.error || "World ID Proof of Human verification failed.");
      human.current = String(data.nullifierHash);
    } catch (err: any) {
      setErrorMessage(err.message || "Verification rejected by World ID.");
      throw err;
    } finally {
      setIsVerifyingProof(false);
    }
  };

  const handleError = (errorCode: IDKitErrorCodes, debugReport?: IDKitDebugReport) => {
    console.error("[WorldAuthGate] IDKit error:", errorCode, debugReport);
    setOpen(false);
    setErrorMessage(
      String(errorCode) === "nullifier_replayed"
        ? "World ID will only verify this action once per person. Raise the action's max verifications in the World Developer Portal."
        : `World ID Error (${errorCode}). Check browser console for debug report.`
    );
  };

  const isBusy = isPreparing || isVerifyingProof || open;

  const label = isPreparing ? "Preparing World ID…" : isVerifyingProof ? "Verifying proof…" : "Sign in with World ID";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="max-w-[1180px] w-full mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <LifelineMark size={18} />
          <span className="serif text-[25px] leading-none tracking-tight">Lifeline</span>
        </div>
        <span className="lab">Arc · Sui · World ID</span>
      </header>

      <main className="flex-1 flex flex-col justify-center">
        {/* The line the whole product is named for: flat until a human signs in. */}
        <div className="w-full" aria-hidden>
          <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="w-full h-[110px]">
            <path
              className="trace draw"
              style={{ ["--len" as any]: 4000, strokeWidth: 1.6 }}
              vectorEffect="non-scaling-stroke"
              d="M0,78 L470,78 Q476,72 482,78 L492,78 L496,84 L502,20 L508,98 L512,78 L524,78 Q534,66 544,78 L610,78 Q616,72 622,78 L632,78 L636,82 L642,44 L648,90 L652,78 L664,78 Q674,70 684,78 L1200,78"
            />
            {/* The second beat is one Lifeline paid for: drawn again in red. */}
            <path
              className="trace trace-alarm draw"
              style={{ ["--len" as any]: 260, strokeWidth: 1.8, animationDelay: "1.35s", animationDuration: "0.5s", strokeDashoffset: 260 }}
              vectorEffect="non-scaling-stroke"
              d="M610,78 Q616,72 622,78 L632,78 L636,82 L642,44 L648,90 L652,78 L664,78 Q674,70 684,78"
            />
          </svg>
        </div>

        <div className="max-w-[1180px] w-full mx-auto px-6 sm:px-10 pt-10 pb-16 grid gap-12 lg:grid-cols-[1.25fr_1fr] items-end">
          <div className="rise">
            <div className="lab mb-5">Credit for autonomous agents</div>
            <h1 className="serif text-[52px] sm:text-[76px] leading-[0.92] tracking-tight">
              An agent can hold money.
              <br />
              <em className="ink-3">Only a human can hold debt.</em>
            </h1>
          </div>

          <div className="rise" style={{ animationDelay: "0.15s" }}>
            <p className="text-[15px] ink-2 leading-relaxed mb-7 max-w-[44ch]">
              Lifeline gives one World ID-verified human one credit line, and lets their agents spend it on Arc and
              Sui. When an agent is short at a paywall, Lifeline pays and the human owes. Every payment is a beat on
              the agent&apos;s line.
            </p>

            <button id="world-signin-btn" onClick={handleStartSignIn} disabled={isBusy} className="btn btn-solid h-12 px-6 text-[11.5px]">
              <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
                <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
                <circle cx="12" cy="12" r="3.5" fill="currentColor" />
              </svg>
              {label}
            </button>

            <div className="mt-4 mono text-[10.5px] ink-3 leading-relaxed max-w-[48ch]">
              Scan with World App. The same World ID is the same line here and in Lifeline&apos;s World App version.
            </div>

            {errorMessage && (
              <div className="mt-5 mono text-[11px] leading-relaxed px-3 py-2.5" style={{ color: "var(--alarm)", background: "var(--alarm-soft)" }}>
                {errorMessage}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="max-w-[1180px] w-full mx-auto px-6 sm:px-10 py-5 rule-t flex flex-wrap justify-between gap-2 lab">
        <span>One human · one line · two rails</span>
        <span>Proof of human by World ID</span>
      </footer>

      {mounted && rpContext && open && (
        <IDKitRequestWidget
          open
          onOpenChange={(o) => !o && !isVerifyingProof && setOpen(false)}
          app_id={appId}
          action={action}
          rp_context={rpContext}
          allow_legacy_proofs={true}
          environment={worldEnvironment}
          preset={proofOfHuman()}
          handleVerify={verify}
          onSuccess={() => {
            setOpen(false);
            if (human.current) {
              onVerified?.(human.current);
              onSignIn?.(human.current);
            }
          }}
          onError={handleError}
        />
      )}
    </div>
  );
};

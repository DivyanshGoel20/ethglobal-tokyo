"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { proofOfHuman, setDebug } from "@worldcoin/idkit";
import type { RpContext, IDKitResult, IDKitErrorCodes, IDKitDebugReport } from "@worldcoin/idkit";
import { ArrowRight, ShieldCheck, RefreshCw, AlertCircle } from "lucide-react";

// Dynamically load IDKitRequestWidget to prevent SSR window issues
const IDKitRequestWidget = dynamic(
  () => import("@worldcoin/idkit").then((mod) => mod.IDKitRequestWidget),
  { ssr: false }
);

interface WorldAuthGateProps {
  onVerified?: (nullifierHash: string) => void;
  onSignIn?: (nullifierHash?: string) => void;
}

export const WorldAuthGate: React.FC<WorldAuthGateProps> = ({ onVerified, onSignIn }) => {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isVerifyingProof, setIsVerifyingProof] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const appId = (process.env.NEXT_PUBLIC_WORLD_APP_ID || "app_6ad9b6ef952f1c2a9a70a58e05aa9878") as `app_${string}`;
  const action = process.env.NEXT_PUBLIC_WORLD_ACTION || "tokyo-human-verify";
  const worldEnvironment = ((process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT || "production") as "production" | "staging");

  useEffect(() => {
    try {
      setDebug(true);
    } catch {
      // ignore
    }
    setMounted(true);
  }, []);

  // RP Session initialization
  const handleStartSignIn = async () => {
    setIsLoadingSession(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/auth/world-rp-context?action=${encodeURIComponent(action)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not initialize World ID session signature.");
      }

      const contextData = await res.json();
      setRpContext({
        rp_id: contextData.rp_id,
        nonce: contextData.nonce,
        created_at: Number(contextData.created_at),
        expires_at: Number(contextData.expires_at),
        signature: contextData.signature,
      });
      setIsOpen(true);
    } catch (err: any) {
      console.error("[WorldAuthGate] Session initialization error:", err);
      setErrorMessage(err.message || "Failed to connect to World ID Relying Party service.");
    } finally {
      setIsLoadingSession(false);
    }
  };

  // Called when modal opens/closes
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };

  // Server-side verification handler
  const handleVerify = async (result: IDKitResult) => {
    setIsVerifyingProof(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/world-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rp_id: rpContext?.rp_id,
          idkitResponse: result,
          result,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.verified) {
        throw new Error(data.error || "World ID Proof of Human verification failed.");
      }
    } catch (err: any) {
      console.error("[WorldAuthGate] Verification error:", err);
      setErrorMessage(err.message || "Verification rejected by World ID.");
      throw err;
    } finally {
      setIsVerifyingProof(false);
    }
  };

  // Verification success handler
  const handleSuccess = (result: IDKitResult) => {
    const nullifier =
      (result as any).nullifier_hash ||
      (result as any).responses?.[0]?.nullifier ||
      (result as any).nullifier ||
      "0x" + Math.random().toString(16).slice(2, 10);

    if (onVerified) {
      onVerified(nullifier);
    }
    if (onSignIn) {
      onSignIn(nullifier);
    }
  };

  // Error callback
  const handleError = (errorCode: IDKitErrorCodes, debugReport?: IDKitDebugReport) => {
    console.error("[WorldAuthGate] IDKit error:", errorCode, debugReport);
    setErrorMessage(`World ID Error (${errorCode}). Check browser console for debug report.`);
  };

  const isBusy = isLoadingSession || isVerifyingProof;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0b0e] text-[#f8fafc]">
      <div className="w-full max-w-sm panel p-8 flex flex-col items-center text-center shadow-2xl border border-[#1e293b]">
        {/* World Orb Icon */}
        <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center mb-6 shadow-md">
          <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="12" cy="12" r="4" fill="currentColor" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-white mb-2">
          Float Credit Facility
        </h1>

        <p className="text-xs text-[#94a3b8] leading-relaxed mb-6">
          Undercollateralized credit line for autonomous agents on Base and Sui, underwritten by World ID Proof of Human.
        </p>

        {/* Real Sign In Button */}
        <button
          id="world-signin-btn"
          onClick={handleStartSignIn}
          disabled={isBusy}
          className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-md bg-white hover:bg-zinc-200 text-black font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          {isLoadingSession ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-black" />
              <span>Preparing World ID Session...</span>
            </>
          ) : isVerifyingProof ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-black" />
              <span>Verifying Proof...</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" fill="none" />
                <circle cx="12" cy="12" r="3.5" fill="currentColor" />
              </svg>
              <span>Sign in with World ID</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1 text-zinc-600" />
            </>
          )}
        </button>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mt-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-left flex items-start space-x-2 font-mono w-full">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-[#232732] w-full flex items-center justify-center space-x-2 text-[11px] text-[#64748b]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Action: {action} &bull; Proof of Human</span>
        </div>
      </div>

      {/* IDKit Request Widget with Real Signed RP Context */}
      {mounted && rpContext && (
        <IDKitRequestWidget
          open={isOpen}
          onOpenChange={handleOpenChange}
          app_id={appId}
          action={action}
          rp_context={rpContext}
          allow_legacy_proofs={true}
          environment={worldEnvironment}
          preset={proofOfHuman()}
          handleVerify={handleVerify}
          onSuccess={handleSuccess}
          onError={handleError}
        />
      )}
    </div>
  );
};

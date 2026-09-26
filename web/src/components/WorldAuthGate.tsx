"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { proofOfHuman, setDebug, any, CredentialRequest } from "@worldcoin/idkit";
import type {
  RpContext,
  IDKitResult,
  IDKitResultSession,
  IDKitErrorCodes,
  IDKitDebugReport,
} from "@worldcoin/idkit";
import { ArrowRight, ShieldCheck, RefreshCw, AlertCircle } from "lucide-react";

// Dynamically load the widgets to prevent SSR window issues
const IDKitRequestWidget = dynamic(
  () => import("@worldcoin/idkit").then((mod) => mod.IDKitRequestWidget),
  { ssr: false }
);
const IDKitSessionWidget = dynamic(
  () => import("@worldcoin/idkit").then((mod) => mod.IDKitSessionWidget),
  { ssr: false }
);

interface WorldAuthGateProps {
  onVerified?: (nullifierHash: string) => void;
  onSignIn?: (nullifierHash?: string) => void;
}

/**
 * Which World ID session this browser signs in with. An identifier, not a
 * credential: signing in still takes a fresh proof from World App, and the
 * server only honours a session it linked at sign-up.
 */
const SESSION_KEY = "float_world_session";

const readSaved = (): `session_${string}` | null => {
  try {
    const v = localStorage.getItem(SESSION_KEY);
    return v && v.startsWith("session_") ? (v as `session_${string}`) : null;
  } catch {
    return null;
  }
};
const save = (id: string | null) => {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* sign-in still works; it just asks to sign up again next time */
  }
};

/** Either credential can hold a session. */
const SESSION_CONSTRAINTS = any(CredentialRequest("proof_of_human"), CredentialRequest("selfie"));

/**
 * World ID 4 sign-in.
 *
 * Signing up spends the action's nullifier - that is what makes one human one
 * credit line - and World refuses to let it be spent twice. So there are two
 * paths:
 *
 *   first visit: uniqueness proof (sign up), then a session is created and
 *                linked to that human - two approvals in World App
 *   returning:   a proof of the saved session - one approval
 *
 * Asking a returning user for the uniqueness proof again is what produced
 * `nullifier_replayed`.
 */
export const WorldAuthGate: React.FC<WorldAuthGateProps> = ({ onVerified, onSignIn }) => {
  const [mounted, setMounted] = useState(false);
  const [savedSession, setSavedSession] = useState<`session_${string}` | null>(null);

  // Which World request is open, and the RP context signed for it.
  const [step, setStep] = useState<"idle" | "signup" | "create-session" | "prove-session">("idle");
  const [rpContext, setRpContext] = useState<RpContext | null>(null);

  const [isPreparing, setIsPreparing] = useState(false);
  const [isVerifyingProof, setIsVerifyingProof] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The human the last verified proof established. A ref, not state: the
  // widget's onSuccess fires straight after handleVerify, before a state
  // update from it would be visible.
  const human = useRef("");

  const appId = (process.env.NEXT_PUBLIC_WORLD_APP_ID || "app_6ad9b6ef952f1c2a9a70a58e05aa9878") as `app_${string}`;
  const action = process.env.NEXT_PUBLIC_WORLD_ACTION || "float-credit-line";
  const worldEnvironment = (process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT || "production") as "production" | "staging";

  useEffect(() => {
    try {
      setDebug(true);
    } catch {
      // ignore
    }
    setSavedSession(readSaved());
    setMounted(true);
  }, []);

  const finish = (human: string) => {
    setStep("idle");
    onVerified?.(human);
    onSignIn?.(human);
  };

  /** Fetch a fresh RP signature and open the given World request. */
  const open = async (next: "signup" | "create-session" | "prove-session") => {
    setIsPreparing(true);
    setErrorMessage(null);
    try {
      const url = next === "signup" ? "/api/auth/world-rp-context" : "/api/auth/world-rp-context?kind=session";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not initialize World ID session signature.");
      setRpContext({
        rp_id: data.rp_id,
        nonce: data.nonce,
        created_at: Number(data.created_at),
        expires_at: Number(data.expires_at),
        signature: data.signature,
      });
      setStep(next);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to connect to World ID Relying Party service.");
      setStep("idle");
    } finally {
      setIsPreparing(false);
    }
  };

  const handleStartSignIn = () => open(savedSession ? "prove-session" : "signup");

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  // --- Sign up: the one-time uniqueness proof.
  const verifySignup = async (result: IDKitResult) => {
    setIsVerifyingProof(true);
    setErrorMessage(null);
    try {
      const { res, data } = await post("/api/auth/world-verify", { rp_id: rpContext?.rp_id, idkitResponse: result, result });
      if (!res.ok || !data.verified) throw new Error(data.error || "World ID Proof of Human verification failed.");
      human.current = String(data.nullifierHash);
    } catch (err: any) {
      setErrorMessage(err.message || "Verification rejected by World ID.");
      throw err;
    } finally {
      setIsVerifyingProof(false);
    }
  };

  // --- Session: created and linked straight after sign-up, or proved on return.
  const verifySession = async (result: IDKitResultSession) => {
    setIsVerifyingProof(true);
    setErrorMessage(null);
    const mode = step === "create-session" ? "create" : "prove";
    try {
      const { res, data } = await post("/api/auth/world-session", { mode, result });
      if (!res.ok || !data.verified) {
        if (data.code === "unknown_session") save(null);
        throw new Error(data.error || "World ID session could not be verified.");
      }
      save(data.sessionId);
      setSavedSession(data.sessionId);
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
    setStep("idle");

    if (String(errorCode) === "nullifier_replayed") {
      // This World ID signed up already, but not from a browser that kept its
      // session. The nullifier cannot be spent twice, so there is no way to
      // sign up again with the same action.
      setErrorMessage(
        "This World ID has already signed up for Float. Sign in from the browser you signed up on - " +
          "this one has no saved World ID session to prove."
      );
      return;
    }
    if (step === "create-session" && human.current) {
      // Signed up but no session linked: usable now, but next time this browser
      // will ask to sign up again. Say so rather than failing the sign-in.
      setErrorMessage(`Signed in, but World ID did not create a session (${errorCode}). You may be asked to sign up again next time.`);
      finish(human.current);
      return;
    }
    setErrorMessage(`World ID Error (${errorCode}). Check browser console for debug report.`);
  };

  const isBusy = isPreparing || isVerifyingProof || step !== "idle";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0a0b0e] text-[#f8fafc]">
      <div className="w-full max-w-sm panel p-8 flex flex-col items-center text-center shadow-2xl border border-[#1e293b]">
        <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center mb-6 shadow-md">
          <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="12" cy="12" r="4" fill="currentColor" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-white mb-2">Float Credit Facility</h1>

        <p className="text-xs text-[#94a3b8] leading-relaxed mb-6">
          Undercollateralized credit line for autonomous agents on Arc and Sui, underwritten by World ID Proof of Human.
        </p>

        <button
          id="world-signin-btn"
          onClick={handleStartSignIn}
          disabled={isBusy}
          className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-md bg-white hover:bg-zinc-200 text-black font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          {isPreparing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-black" />
              <span>Preparing World ID Session...</span>
            </>
          ) : isVerifyingProof ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-black" />
              <span>Verifying Proof...</span>
            </>
          ) : step === "create-session" ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-black" />
              <span>Approve the session in World App...</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" fill="none" />
                <circle cx="12" cy="12" r="3.5" fill="currentColor" />
              </svg>
              <span>{savedSession ? "Sign in with World ID" : "Sign up with World ID"}</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1 text-zinc-600" />
            </>
          )}
        </button>

        {savedSession ? (
          <button
            onClick={() => {
              save(null);
              setSavedSession(null);
              setErrorMessage(null);
            }}
            disabled={isBusy}
            className="mt-3 text-[11px] text-[#64748b] hover:text-white underline cursor-pointer disabled:opacity-40"
          >
            Not you? Sign up with a different World ID
          </button>
        ) : (
          <p className="mt-3 text-[11px] text-[#64748b] leading-relaxed">
            First time only: World App asks twice - once to prove you are unique, once to open the session you sign in
            with from then on.
          </p>
        )}

        {errorMessage && (
          <div className="mt-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-left flex items-start space-x-2 font-mono w-full">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-[#232732] w-full flex items-center justify-center space-x-2 text-[11px] text-[#64748b]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>World ID Verified &bull; Proof of Human</span>
        </div>
      </div>

      {mounted && rpContext && step === "signup" && (
        <IDKitRequestWidget
          open
          onOpenChange={(o) => !o && !isVerifyingProof && setStep((s) => (s === "signup" ? "idle" : s))}
          app_id={appId}
          action={action}
          rp_context={rpContext}
          allow_legacy_proofs={true}
          environment={worldEnvironment}
          preset={proofOfHuman()}
          handleVerify={verifySignup}
          // Signed up; now open the session this browser will sign in with.
          onSuccess={() => void open("create-session")}
          onError={handleError}
        />
      )}

      {mounted && rpContext && (step === "create-session" || step === "prove-session") && (
        <IDKitSessionWidget
          key={step}
          open
          onOpenChange={(o) => {
            if (o || isVerifyingProof) return;
            // Closing the session step after sign-up still leaves a valid login.
            if (step === "create-session" && human.current) finish(human.current);
            else setStep("idle");
          }}
          app_id={appId}
          rp_context={rpContext}
          environment={worldEnvironment}
          constraints={SESSION_CONSTRAINTS}
          {...(step === "prove-session" && savedSession ? { existing_session_id: savedSession } : {})}
          handleVerify={verifySession}
          onSuccess={() => finish(human.current)}
          onError={handleError}
        />
      )}
    </div>
  );
};

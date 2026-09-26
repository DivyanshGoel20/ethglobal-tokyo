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
import { LifelineMark } from "./Pulse";

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
        "This World ID has already signed up for Lifeline. Sign in from the browser you signed up on - " +
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

  const label = isPreparing
    ? "Preparing World ID…"
    : isVerifyingProof
      ? "Verifying proof…"
      : step === "create-session"
        ? "Approve the session in World App…"
        : savedSession
          ? "Sign in with World ID"
          : "Sign up with World ID";

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
              {savedSession ? (
                <button
                  onClick={() => {
                    save(null);
                    setSavedSession(null);
                    setErrorMessage(null);
                  }}
                  disabled={isBusy}
                  className="underline underline-offset-2 hover:text-[color:var(--ink)] disabled:opacity-40"
                >
                  Not you? Sign up with a different World ID
                </button>
              ) : (
                "First time only: World App asks twice - once to prove you are unique, once to open the session you sign in with from then on."
              )}
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

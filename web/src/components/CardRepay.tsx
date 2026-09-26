"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { ErrorNote } from "./Sheet";
import { ApplePayMark, GooglePayMark } from "./WalletMarks";

type Wallet = "applePay" | "googlePay";
const WALLETS: { id: Wallet; mark: React.ReactNode; needs: string }[] = [
  {
    id: "applePay",
    mark: <ApplePayMark />,
    needs: "Apple Pay works in Safari on an iPhone, iPad or Mac with a card in Wallet, on a site registered with Stripe. Inside World App, pay by card below.",
  },
  {
    id: "googlePay",
    mark: <GooglePayMark />,
    needs: "Google Pay works in Chrome, signed in to a Google account with a saved card. Or pay by card below.",
  },
];

let stripePromise: Promise<Stripe | null> | null = null;
const getStripe = (key: string) => (stripePromise ??= loadStripe(key));

/**
 * Repay by Apple Pay, Google Pay or card.
 *
 * The payment is created on the server for what this agent's human owes;
 * Apple Pay and Google Pay appear where the device offers them, a card form
 * always. Once Stripe takes it, the server checks with Stripe and books the
 * repayment on Arc.
 */
export const CardRepay: React.FC<{
  publishableKey: string;
  agentAddress: string;
  amountUsd: number;
  onBooked: (message: string) => void;
  onCancel: () => void;
}> = ({ publishableKey, agentAddress, amountUsd, onBooked, onCancel }) => {
  const [intent, setIntent] = useState<{ clientSecret: string; paymentIntentId: string; amountUsd: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One payment per opening. React runs effects twice in development, and
  // each run created its own Stripe payment; the request is shared instead.
  const started = useRef<{ key: string; request: Promise<any> } | null>(null);

  useEffect(() => {
    let live = true;
    const key = `${agentAddress}:${amountUsd}`;
    if (started.current?.key !== key) {
      started.current = {
        key,
        request: fetch("/api/repay/card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentAddress, amount: amountUsd }),
        }).then((r) => r.json()),
      };
    }
    started.current.request
      .then((d) => {
        if (!live) return;
        if (!d.success) throw new Error(d.error);
        setIntent(d);
      })
      .catch((e) => live && setError(e.message || "Could not start the payment."));
    return () => {
      live = false;
    };
  }, [agentAddress, amountUsd]);

  const options = useMemo(
    () =>
      intent
        ? {
            clientSecret: intent.clientSecret,
            appearance: {
              theme: "stripe" as const,
              variables: { borderRadius: "0px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
            },
          }
        : null,
    [intent]
  );

  if (error) {
    return (
      <div className="space-y-3">
        <ErrorNote>{error}</ErrorNote>
        <button onClick={onCancel} className="btn btn-quiet">
          Back
        </button>
      </div>
    );
  }
  if (!intent || !options) return <p className="mono text-[11px] ink-3">Preparing the payment…</p>;

  return (
    <Elements stripe={getStripe(publishableKey)} options={options}>
      <Pay intent={intent} onBooked={onBooked} onCancel={onCancel} />
    </Elements>
  );
};

const Pay: React.FC<{
  intent: { clientSecret: string; paymentIntentId: string; amountUsd: number };
  onBooked: (message: string) => void;
  onCancel: () => void;
}> = ({ intent, onBooked, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which wallets this browser can actually use - Stripe's own buttons show
  // for those - and which one's requirements the human asked about.
  const [available, setAvailable] = useState<Record<string, boolean> | null>(null);
  const [why, setWhy] = useState<Wallet | null>(null);
  const missing = WALLETS.filter((w) => !available?.[w.id]);
  // Stripe says nothing at all when no wallet is available; after a moment,
  // take the silence as "none".
  useEffect(() => {
    const t = setTimeout(() => setAvailable((a) => a ?? {}), 4000);
    return () => clearTimeout(t);
  }, []);

  const pay = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    try {
      const submitted = await elements.submit();
      if (submitted.error) throw new Error(submitted.error.message);
      const { error: failed } = await stripe.confirmPayment({
        elements,
        clientSecret: intent.clientSecret,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });
      if (failed) throw new Error(failed.message);

      // Paid. The server checks with Stripe and books it on Arc.
      const res = await fetch("/api/repay/card/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId: intent.paymentIntentId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!d.success) throw new Error(d.error || "Paid, but not booked yet - it will be, once Stripe confirms.");
      onBooked(
        `Repaid $${Number(d.amountUsd).toFixed(2)} by card, booked on Arc` +
          (d.refundedUsd > 0 ? ` · $${Number(d.refundedUsd).toFixed(2)} refunded` : "")
      );
    } catch (e: any) {
      setError(e.message || "Payment failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between rule-b pb-3">
        <span className="lab">charged</span>
        <span className="readout text-[22px]">${intent.amountUsd.toFixed(2)}</span>
      </div>

      {/* Stripe's Apple Pay and Google Pay buttons, wherever this device has them. */}
      <ExpressCheckoutElement
        options={{
          buttonType: { applePay: "plain", googlePay: "plain" },
          buttonTheme: { applePay: "black", googlePay: "black" },
          buttonHeight: 44,
          paymentMethods: { applePay: "always", googlePay: "always", link: "never", amazonPay: "never", paypal: "never" },
          layout: { maxColumns: 2, maxRows: 1, overflow: "never" },
        }}
        onReady={(e) => setAvailable({ ...(e.availablePaymentMethods ?? {}) })}
        onConfirm={pay}
      />

      {/* The ones it does not have, so both are always on the page: dimmed,
          and a tap says what that wallet needs. */}
      {missing.length > 0 && (
        <div className={`grid gap-2 ${missing.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {missing.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWhy(why === w.id ? null : w.id)}
              className="h-11 flex items-center justify-center rounded-[4px]"
              style={{ background: "#000", color: "#fff" }}
              aria-label={`${w.id === "applePay" ? "Apple Pay" : "Google Pay"} - not available here`}
            >
              {w.mark}
            </button>
          ))}
        </div>
      )}
      {available && missing.length > 0 &&
        (why ? (
          <p className="text-[12px] ink-2 leading-snug">{WALLETS.find((w) => w.id === why)!.needs}</p>
        ) : (
          <p className="mono text-[10px] ink-3">
            {missing.length === 2 ? "Apple Pay and Google Pay are" : missing[0].id === "applePay" ? "Apple Pay is" : "Google Pay is"} not set up on
            this browser - tap for how.
          </p>
        ))}

      <div className="lab pt-1">or card</div>
      <PaymentElement options={{ layout: "tabs", wallets: { applePay: "never", googlePay: "never", link: "never" } }} />

      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn btn-quiet" disabled={busy}>
          Back
        </button>
        <button onClick={pay} className="btn btn-solid flex-1 sm:flex-none justify-center" disabled={busy || !stripe}>
          {busy ? "Paying…" : `Pay $${intent.amountUsd.toFixed(2)}`}
        </button>
      </div>
      <p className="mono text-[10px] ink-3">Stripe test mode · card 4242 4242 4242 4242, any future date, any CVC.</p>
    </div>
  );
};

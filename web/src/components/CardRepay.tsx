"use client";

import React, { useEffect, useMemo, useState } from "react";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { ErrorNote } from "./Sheet";

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

  useEffect(() => {
    let live = true;
    fetch("/api/repay/card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentAddress, amount: amountUsd }),
    })
      .then((r) => r.json())
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
  const [wallets, setWallets] = useState<string[] | null>(null);

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

      <ExpressCheckoutElement
        options={{ buttonType: { applePay: "plain", googlePay: "plain" }, paymentMethods: { applePay: "always", googlePay: "always", link: "never" } }}
        onReady={(e) => setWallets(Object.entries(e.availablePaymentMethods ?? {}).filter(([, on]) => on).map(([k]) => k))}
        onConfirm={pay}
      />
      {wallets && wallets.length === 0 && (
        <p className="mono text-[10.5px] ink-3">
          No Apple Pay or Google Pay on this browser. Apple Pay needs Safari; Google Pay needs Chrome with a saved card.
        </p>
      )}

      <div className="lab pt-1">or card</div>
      <PaymentElement options={{ layout: "tabs", wallets: { applePay: "never", googlePay: "never" } }} />

      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn btn-quiet" disabled={busy}>
          Back
        </button>
        <button onClick={pay} className="btn btn-solid" disabled={busy || !stripe}>
          {busy ? "Paying…" : `Pay $${intent.amountUsd.toFixed(2)}`}
        </button>
      </div>
      <p className="mono text-[10px] ink-3">Stripe test mode · card 4242 4242 4242 4242, any future date, any CVC.</p>
    </div>
  );
};

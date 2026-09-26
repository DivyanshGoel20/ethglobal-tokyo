import { NextRequest, NextResponse } from "next/server";
import { bookCardRepayment, stripe } from "@/lib/cardRepay";

/**
 * Stripe's word that a payment succeeded, signed with the webhook secret. It
 * books the repayment even if the human closed the page before the browser
 * could confirm it.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not set" }, { status: 503 });

  let event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch (err: any) {
    return NextResponse.json({ error: `Bad signature: ${err?.message}` }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const booked = await bookCardRepayment((event.data.object as { id: string }).id);
    // A booking already in flight elsewhere is fine; anything else, let Stripe retry.
    if (!booked.ok && booked.status !== 409 && booked.status !== 400) {
      return NextResponse.json({ error: booked.error }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true });
}

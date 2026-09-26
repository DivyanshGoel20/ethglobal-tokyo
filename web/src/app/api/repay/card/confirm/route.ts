import { NextRequest, NextResponse } from "next/server";
import { getHuman, unauthenticated } from "@/lib/session";
import { bookCardRepayment } from "@/lib/cardRepay";

/**
 * The browser says its payment went through. It is checked with Stripe, not
 * believed, and booked on Arc once - the webhook may already have done it.
 */
export async function POST(req: NextRequest) {
  const human = getHuman(req);
  if (!human) return unauthenticated();
  const { paymentIntentId } = await req.json().catch(() => ({}));
  if (typeof paymentIntentId !== "string" || !paymentIntentId.startsWith("pi_")) {
    return NextResponse.json({ success: false, error: "Missing payment." }, { status: 400 });
  }
  try {
    const booked = await bookCardRepayment(paymentIntentId, human);
    if (!booked.ok) return NextResponse.json({ success: false, error: booked.error }, { status: booked.status });
    return NextResponse.json({ success: true, ...booked });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Could not check the payment." }, { status: 502 });
  }
}

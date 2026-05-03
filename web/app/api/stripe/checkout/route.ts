// POST /api/stripe/checkout
//
// Creates a Stripe Checkout Session for a Pro subscription and returns the
// hosted-checkout URL. The client redirects the browser to that URL.
//
// STATUS: stub. Returns 501 until Stripe is wired. To turn on:
//   1. `npm i stripe`
//   2. Set STRIPE_SECRET_KEY + STRIPE_PRO_PRICE_ID in env
//   3. Replace the stub block below with the real implementation
//   4. Wire the success/cancel URLs to /upgrade?status=success and /upgrade
//
// Reference (when ready):
//   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
//   const session = await stripe.checkout.sessions.create({
//     mode: "subscription",
//     line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
//     customer_email: user.email,
//     client_reference_id: user.id,           // so the webhook can match it
//     success_url: `${origin}/upgrade?status=success`,
//     cancel_url: `${origin}/upgrade`,
//   });
//   return NextResponse.json({ url: session.url });

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase-server";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "auth_required" },
      { status: 401 },
    );
  }

  // ---- Stripe stub -------------------------------------------------------
  return NextResponse.json(
    {
      error: "billing_not_enabled",
      message:
        "Stripe is not yet wired. Email hello@cardex.app and we'll comp you a month when it launches.",
    },
    { status: 501 },
  );
}

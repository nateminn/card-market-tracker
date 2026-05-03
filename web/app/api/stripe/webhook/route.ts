// POST /api/stripe/webhook
//
// Receives Stripe webhook events to keep `profiles.tier` in sync with the
// subscription state. Stripe verifies the request via a signing secret.
//
// STATUS: stub. Returns 200 (so Stripe doesn't retry forever during initial
// setup) but does nothing. To turn on:
//   1. `npm i stripe`
//   2. Set STRIPE_WEBHOOK_SECRET in env (Dashboard → Webhooks → endpoint)
//   3. Replace the stub block below with the real handler
//   4. Make sure the route uses the secret-key Supabase client (server-only)
//      to bypass RLS when updating profiles
//
// Events to handle (minimum):
//   - checkout.session.completed       → set tier='pro', store subscription_id
//   - customer.subscription.updated    → update current_period_end
//   - customer.subscription.deleted    → set tier='free'
//
// Reference (when ready):
//   const sig = request.headers.get("stripe-signature")!;
//   const body = await request.text();
//   const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
//   switch (event.type) { ... }

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ received: true, stub: true });
}

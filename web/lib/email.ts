// Resend wrapper. Single import for any server-side caller that wants to
// send transactional email.
//
// Why a wrapper instead of using Resend directly:
//   - Centralises the from-address + sender name so we don't drift across
//     callers
//   - Lets us swap providers later without touching every call site
//   - Logs send attempts through lib/log so failures show up consistently
//
// IMPORTANT: server-only. Never import from a "use client" component — the
// API key would leak to the browser.
//
// Environment:
//   RESEND_API_KEY    — server secret from resend.com
//   RESEND_FROM_EMAIL — verified sender address (use onboarding@resend.dev
//                       for testing before your domain is verified)
//
// Auth-flow emails (signup confirmation, password reset) DO NOT go through
// this — they're sent by Supabase via its SMTP integration. This wrapper is
// for emails Cardex itself originates: welcome-after-signup, watchlist
// price alerts, weekly digests, etc.

import { Resend } from "resend";
import { logInfo, reportError } from "@/lib/log";

let cached: Resend | null = null;

function client(): Resend {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to web/.env.local.",
    );
  }
  cached = new Resend(key);
  return cached;
}

function fromAddress(): string {
  const addr = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  return `Cardex <${addr}>`;
}

type SendArgs = {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text fallback. Strongly recommended — improves deliverability. */
  text?: string;
  /** Used to dedupe in Resend's UI; keep it stable per email kind. */
  tag?: string;
};

export async function sendEmail({ to, subject, html, text, tag }: SendArgs) {
  try {
    const result = await client().emails.send({
      from: fromAddress(),
      to,
      subject,
      html,
      text,
      tags: tag ? [{ name: "kind", value: tag }] : undefined,
    });
    logInfo("email.send", { to, subject, tag, id: result.data?.id });
    return result;
  } catch (err) {
    reportError(err, { route: "lib/email.sendEmail", to, subject, tag });
    throw err;
  }
}

// /api/ebay/account-deletion - eBay Marketplace Account Deletion endpoint.
//
// Required by eBay before a Production API keyset can be enabled. Two
// behaviours:
//
//   GET  /api/ebay/account-deletion?challenge_code=<X>
//        Returns SHA-256 hex digest of (challenge_code + verification_token
//        + endpoint_url). eBay calls this to verify we own the URL and
//        know our verification token.
//
//   POST /api/ebay/account-deletion
//        Body is a JSON notification when an eBay user deletes their
//        account. We delete any data linked to that user and respond 200.
//        Cardex stores no eBay user PII today, so the deletion is a no-op
//        beyond logging the event for audit.
//
// Configure in eBay Developer Dashboard:
//   Marketplace account deletion notification endpoint:
//     https://card-market-tracker.netlify.app/api/ebay/account-deletion
//   Verification token:
//     value of EBAY_DELETION_VERIFICATION_TOKEN env var (any 32-80 char string)
//
// Spec: https://developer.ebay.com/marketplace-account-deletion

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { logInfo, logWarn, reportError } from "@/lib/log";

function token(): string {
  const t = process.env.EBAY_DELETION_VERIFICATION_TOKEN;
  if (!t || t.length < 32 || t.length > 80) {
    throw new Error(
      "EBAY_DELETION_VERIFICATION_TOKEN must be 32-80 chars (set in env).",
    );
  }
  return t;
}

/** Reconstruct the canonical endpoint URL from the request. eBay computes
 *  the verification hash using the endpoint URL EXACTLY as the developer
 *  registered it on their dashboard, so we must reproduce that string
 *  byte-for-byte. We honor X-Forwarded-Proto/Host (set by Netlify's edge)
 *  to handle the case where Netlify rewrites internally. */
function endpointUrl(request: Request): string {
  const url = new URL(request.url);
  const headers = request.headers;
  const proto = headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = headers.get("x-forwarded-host") || headers.get("host") || url.host;
  return `${proto}://${host}${url.pathname}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const challenge = url.searchParams.get("challenge_code");
  if (!challenge) {
    return NextResponse.json({ error: "missing challenge_code" }, { status: 400 });
  }
  let verificationToken: string;
  try {
    verificationToken = token();
  } catch (e) {
    reportError(e, { route: "/api/ebay/account-deletion GET" });
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const ep = endpointUrl(request);
  // eBay spec: hash = SHA256(challengeCode + verificationToken + endpointURL)
  const hash = crypto
    .createHash("sha256")
    .update(challenge + verificationToken + ep)
    .digest("hex");
  // Log the URL we hashed against — when validation fails, this is the
  // first thing to check vs what was registered on the eBay dashboard.
  logInfo("ebay.deletion.challenge", { challenge, endpointUrl: ep });
  return NextResponse.json({ challengeResponse: hash }, { status: 200 });
}

export async function POST(request: Request) {
  // Validate body shape and verification token (eBay sends them in the
  // payload). Cardex stores no eBay user PII, so we log + 200.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const data = payload as {
    metadata?: { topic?: string; schemaVersion?: string };
    notification?: {
      notificationId?: string;
      eventDate?: string;
      data?: { username?: string; userId?: string; eiasToken?: string };
    };
  };

  const topic = data.metadata?.topic;
  if (topic !== "MARKETPLACE_ACCOUNT_DELETION") {
    logWarn("ebay.notification.unknown_topic", { topic });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const userId = data.notification?.data?.userId;
  const username = data.notification?.data?.username;

  // No-op deletion: Cardex doesn't store eBay user PII (we ingest listing-
  // level data only). If we ever add user-linked features we delete here.
  logInfo("ebay.account_deletion.received", {
    notificationId: data.notification?.notificationId,
    userId,
    username,
    eventDate: data.notification?.eventDate,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

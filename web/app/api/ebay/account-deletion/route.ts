// /api/ebay/account-deletion - eBay Marketplace Account Deletion endpoint.
//
// Required by eBay before a Production API keyset can be enabled.
//
//   GET  /api/ebay/account-deletion?challenge_code=<X>
//        Returns SHA-256 hex of (challenge_code + verification_token + endpoint_url)
//   POST /api/ebay/account-deletion
//        Receives notification, returns 200. Cardex stores no eBay user PII so
//        deletion is logged-only.
//
// Spec: https://developer.ebay.com/marketplace-account-deletion

import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getToken(): string | null {
  const t = process.env.EBAY_DELETION_VERIFICATION_TOKEN;
  if (!t || t.length < 32 || t.length > 80) return null;
  return t;
}

function reconstructUrl(request: Request): string {
  // Reproduce the URL exactly as eBay registered it. Honors Netlify edge
  // headers (x-forwarded-proto/host) so we hash against the public URL,
  // not whatever internal hostname the function was invoked at.
  try {
    const u = new URL(request.url);
    const h = request.headers;
    const proto = h.get("x-forwarded-proto") || u.protocol.replace(":", "");
    const host = h.get("x-forwarded-host") || h.get("host") || u.host;
    return `${proto}://${host}${u.pathname}`;
  } catch {
    // Fallback if URL parsing somehow fails
    return "https://card-market-tracker.netlify.app/api/ebay/account-deletion";
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const challenge = url.searchParams.get("challenge_code");
    if (!challenge) {
      return NextResponse.json(
        { error: "missing challenge_code" },
        { status: 400 },
      );
    }
    const token = getToken();
    if (!token) {
      return NextResponse.json(
        { error: "server misconfigured: EBAY_DELETION_VERIFICATION_TOKEN missing or wrong length" },
        { status: 500 },
      );
    }
    const ep = reconstructUrl(request);
    const hash = crypto
      .createHash("sha256")
      .update(challenge + token + ep)
      .digest("hex");
    console.log(JSON.stringify({
      level: "info",
      msg: "ebay.deletion.challenge",
      challenge,
      endpointUrl: ep,
      hash,
    }));
    return NextResponse.json({ challengeResponse: hash }, { status: 200 });
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      msg: "ebay.deletion.GET.crash",
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      // Some eBay test pings come without a body. Accept anything.
      body = null;
    }
    console.log(JSON.stringify({
      level: "info",
      msg: "ebay.deletion.notification",
      body,
    }));
    // Cardex doesn't store eBay user PII; deletion is a no-op beyond logging.
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      msg: "ebay.deletion.POST.crash",
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }));
    // Still return 200 so eBay doesn't think the endpoint is broken.
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

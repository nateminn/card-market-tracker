// Next.js 16 proxy (formerly "middleware") — runs on every request.
// Refreshes Supabase sessions (rotates the access token before it expires)
// so a logged-in user stays signed in across navigations.
//
// Auth-gated routes: nothing yet. Once we lock down /portfolio etc., add a
// check here that redirects unauthenticated users to /auth/login.

import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const sb = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
  // Touching getUser refreshes the session if needed.
  await sb.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    // Skip static files and Next internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

// /auth/login — email + password sign-in via Supabase Auth.
// Server-rendered shell + a client form (since auth has to happen client-side
// to set the session cookie).

import Link from "next/link";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "Sign in · Cardex",
  description: "Sign in to your Cardex account.",
};

export default function LoginPage() {
  return (
    <div className="px-6 lg:px-10 py-16 max-w-md mx-auto">
      <h1 className="text-2xl text-fg leading-none mb-2">Sign in</h1>
      <p className="text-sm text-muted mb-8">
        Welcome back. Sign in to access your watchlist + portfolio.
      </p>
      <LoginForm />
      <p className="mt-6 text-sm text-muted">
        Don't have an account?{" "}
        <Link
          href="/auth/signup"
          className="text-accent hover:text-fg transition-colors duration-150"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}

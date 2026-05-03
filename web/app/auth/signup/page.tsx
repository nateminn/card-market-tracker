import Link from "next/link";
import SignupForm from "./SignupForm";

export const metadata = {
  title: "Sign up · Cardex",
  description: "Create your Cardex account.",
};

export default function SignupPage() {
  return (
    <div className="px-6 lg:px-10 py-16 max-w-md mx-auto">
      <h1 className="text-2xl text-fg leading-none mb-2">Create account</h1>
      <p className="text-sm text-muted mb-8">
        Free forever. Pro upgrade unlocks Signal full picks, alerts, and deep
        history.
      </p>
      <SignupForm />
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link
          href="/auth/login"
          className="text-accent hover:text-fg transition-colors duration-150"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

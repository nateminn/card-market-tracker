import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy · Cardex",
  description:
    "How Cardex collects, uses, and protects your personal information.",
};

const EFFECTIVE_DATE = "April 1, 2026";

export default function PrivacyPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">
          Privacy policy
        </h1>
        <p className="mt-2 text-xs font-mono uppercase tracking-wider text-muted-2">
          Effective {EFFECTIVE_DATE}
        </p>
      </header>

      <p>
        This policy explains what personal information Cardex collects, how we
        use it, and your rights. We aim to collect as little as we need to run
        the Service well.
      </p>

      <Section title="What we collect">
        <ul>
          <li>
            <strong>Account data</strong> — your email address and a hashed
            password, stored by Supabase (our auth provider).
          </li>
          <li>
            <strong>Subscription data</strong> — if you subscribe, Stripe
            handles your payment details. We see only metadata (subscription
            ID, plan, period end). We never store card numbers.
          </li>
          <li>
            <strong>Usage data</strong> — pages visited, features used, errors
            encountered. We use this to improve the Service.
          </li>
          <li>
            <strong>Watchlist + portfolio data</strong> — cards you save and
            trades you log are tied to your account so we can show them back to
            you.
          </li>
          <li>
            <strong>Cookies</strong> — strictly-necessary cookies for sign-in
            and session refresh. We don&rsquo;t use third-party advertising
            cookies.
          </li>
        </ul>
      </Section>

      <Section title="How we use it">
        <ul>
          <li>To provide, secure, and improve the Service.</li>
          <li>To process subscriptions and prevent fraud.</li>
          <li>
            To email you about your account, subscription, or alerts you have
            opted into. We don&rsquo;t send marketing emails without consent.
          </li>
        </ul>
      </Section>

      <Section title="Who we share with">
        <p>We share your data only with the providers we use to run Cardex:</p>
        <ul>
          <li>
            <strong>Supabase</strong> — auth + database hosting.
          </li>
          <li>
            <strong>Stripe</strong> — payment processing (only when you
            subscribe).
          </li>
          <li>
            <strong>Hosting + email providers</strong> — to serve the site and
            send transactional email.
          </li>
        </ul>
        <p>
          We don&rsquo;t sell your data. We don&rsquo;t share it with
          advertisers.
        </p>
      </Section>

      <Section title="Data retention">
        <p>
          We keep your account data for as long as your account is active. If
          you delete your account, we delete or anonymise your personal data
          within 30 days, except where we&rsquo;re required to retain it for
          legal or accounting reasons.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Depending on where you live, you may have rights to access, correct,
          delete, or port your data, or to object to certain processing. Email
          us at{" "}
          <a
            href="mailto:privacy@cardex.app"
            className="text-accent hover:text-fg"
          >
            privacy@cardex.app
          </a>{" "}
          and we&rsquo;ll honour any rights that apply.
        </p>
      </Section>

      <Section title="Security">
        <p>
          We use encrypted transport (HTTPS), strong password hashing, and
          row-level security on our database. No system is perfectly secure;
          if we discover a breach affecting you, we&rsquo;ll notify you
          promptly.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Cardex is for adults. We don&rsquo;t knowingly collect personal data
          from anyone under 18.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update this policy. Material changes will be announced by
          email or in-app at least 14 days before they take effect.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy? Email{" "}
          <a
            href="mailto:privacy@cardex.app"
            className="text-accent hover:text-fg"
          >
            privacy@cardex.app
          </a>
          .
        </p>
      </Section>

      <p className="text-[12px] text-muted-2 leading-relaxed pt-6 border-t border-border">
        Like the Terms, this policy is a starting template. Before launching,
        get a qualified attorney to verify compliance with the privacy laws
        applicable to you and your users (GDPR, CCPA, etc.).
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-fg pt-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

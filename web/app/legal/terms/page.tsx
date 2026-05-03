import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of service · Cardex",
  description:
    "The terms governing your use of Cardex, including subscriptions, acceptable use, and disclaimers.",
};

const EFFECTIVE_DATE = "April 1, 2026";

export default function TermsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">
          Terms of service
        </h1>
        <p className="mt-2 text-xs font-mono uppercase tracking-wider text-muted-2">
          Effective {EFFECTIVE_DATE}
        </p>
      </header>

      <p>
        Welcome to Cardex. These Terms govern your use of the Cardex website,
        applications, and services (collectively, the &ldquo;Service&rdquo;).
        By creating an account, subscribing to Cardex Pro, or otherwise using
        the Service, you agree to these Terms. If you don&rsquo;t agree,
        don&rsquo;t use the Service.
      </p>

      <Section title="1. The Service">
        <p>
          Cardex provides trading-card market analytics, including catalog
          data, sales history, and proprietary scoring (the &ldquo;Signal
          Engine&rdquo;). Some features are free; others require a paid
          subscription. We reserve the right to change which features are free
          or paid, with notice.
        </p>
      </Section>

      <Section title="2. Accounts">
        <p>
          You&rsquo;re responsible for the activity on your account and for
          keeping your login credentials secure. You must be at least 18 years
          old (or the age of majority in your jurisdiction) to create an
          account. One account per person.
        </p>
      </Section>

      <Section title="3. Subscriptions">
        <ul>
          <li>
            Cardex Pro is billed monthly via Stripe. The current price is
            displayed at checkout.
          </li>
          <li>
            Subscriptions auto-renew until you cancel. You can cancel any time
            from your account; cancellation takes effect at the end of the
            current billing period.
          </li>
          <li>
            We don&rsquo;t offer refunds for partial months, except where
            required by law.
          </li>
          <li>
            We may change pricing with at least 30 days&rsquo; notice. If you
            don&rsquo;t agree to the new price, cancel before the next renewal.
          </li>
        </ul>
      </Section>

      <Section title="4. Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>Resell, redistribute, or scrape Cardex data in bulk.</li>
          <li>Use the Service to violate any law or third-party right.</li>
          <li>
            Attempt to interfere with the Service&rsquo;s security or
            operation.
          </li>
          <li>Use automated tools to access the Service except via APIs we publicly authorise.</li>
        </ul>
      </Section>

      <Section title="5. Data and intellectual property">
        <p>
          Catalog identifiers, sales history, and pricing data are sourced from
          third-party providers and are licensed for your use within the
          Service only. The Cardex name, design, and proprietary analytics
          (including the Signal Engine) are owned by us. You may share
          screenshots and brief excerpts with attribution; you may not republish
          datasets in bulk.
        </p>
      </Section>

      <Section title="6. No investment advice">
        <p>
          Cardex is a research and analytics tool, not a broker, dealer,
          investment adviser, or financial planner. Nothing on the Service is a
          recommendation to buy or sell any card. Trading-card markets are
          illiquid, speculative, and subject to fad cycles. See our{" "}
          <a href="/legal/disclaimer" className="text-accent hover:text-fg">
            Investment disclaimer
          </a>{" "}
          for the full picture.
        </p>
      </Section>

      <Section title="7. Disclaimers and limitation of liability">
        <p>
          The Service is provided &ldquo;as is&rdquo; without warranty of any
          kind. We don&rsquo;t guarantee that data is accurate, complete, or
          timely. To the fullest extent permitted by law, our total liability
          for any claim arising from your use of the Service is limited to the
          amount you paid us in the 12 months preceding the claim.
        </p>
      </Section>

      <Section title="8. Termination">
        <p>
          You may cancel your subscription and delete your account at any time.
          We may suspend or terminate your account if you breach these Terms.
          Upon termination, your access to paid features ends; we may retain
          aggregated, anonymised usage data.
        </p>
      </Section>

      <Section title="9. Changes to these Terms">
        <p>
          We may update these Terms. If we make material changes, we&rsquo;ll
          notify you by email or in-app. Your continued use after the effective
          date constitutes acceptance.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Questions? Email{" "}
          <a
            href="mailto:hello@cardex.app"
            className="text-accent hover:text-fg"
          >
            hello@cardex.app
          </a>
          .
        </p>
      </Section>

      <p className="text-[12px] text-muted-2 leading-relaxed pt-6 border-t border-border">
        These Terms are a starting template, not a legal opinion. Before
        launching to the public, have a qualified attorney in your jurisdiction
        review and tailor them.
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

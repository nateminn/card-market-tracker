import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Investment disclaimer · Cardex",
  description:
    "Cardex is an analytics tool, not investment advice. Trading-card markets are speculative.",
};

export default function DisclaimerPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">
          Investment disclaimer
        </h1>
        <p className="mt-2 text-sm text-muted">
          Read this before acting on anything you see on Cardex.
        </p>
      </header>

      <p>
        Cardex is a research and analytics tool. It is{" "}
        <strong>not investment advice</strong>, and we are not registered as a
        broker, dealer, investment adviser, or financial planner in any
        jurisdiction.
      </p>

      <Section title="What we do - and don't - do">
        <p>
          We surface what the trading-card market looks like: catalog
          identifiers, recent sales, volume-weighted averages, momentum, and a
          proprietary score we call Signal. Signal is a screener - a tool to
          shorten the list of cards you might want to look at - not a
          prediction.
        </p>
        <p>
          We don&rsquo;t guarantee that any data is accurate, complete, or
          timely. Card sales data comes from third-party feeds (eBay listings,
          aggregators, public auction records); these feeds have gaps and
          delays.
        </p>
      </Section>

      <Section title="Risks of trading cards">
        <ul>
          <li>
            <strong>Illiquidity.</strong> Many cards trade thinly. The price you
            see today may not be the price you can sell at tomorrow.
          </li>
          <li>
            <strong>Fad cycles.</strong> Card values are influenced by player
            performance, hobby trends, and broader collectibles cycles. A card
            that looks &ldquo;hot&rdquo; can lose 50%+ of value in weeks.
          </li>
          <li>
            <strong>Grading variance.</strong> The same physical card can be a
            PSA 9 or PSA 10. Re-grading is expensive and outcomes are not
            guaranteed.
          </li>
          <li>
            <strong>Counterparty risk.</strong> eBay, auction houses, and
            consignment platforms each carry their own settlement and
            authentication risks.
          </li>
          <li>
            <strong>Storage and damage.</strong> Cards can be damaged in
            transit, in storage, or by environmental factors.
          </li>
        </ul>
      </Section>

      <Section title="Backtests and historical performance">
        <p>
          Where we publish backtests of the Signal Engine or any other model,
          past performance is not indicative of future results. Backtests are
          subject to selection bias, survivorship bias, and look-ahead bias
          even when we do our best to avoid them. Treat them as a sanity check
          on the model, not a guarantee.
        </p>
      </Section>

      <Section title="Do your own research">
        <p>
          Before buying or selling any card, verify the data independently,
          consider your own financial situation, and if anything material is at
          stake, talk to a qualified financial professional. Never invest more
          than you can afford to lose.
        </p>
      </Section>

      <p className="text-[12px] text-muted-2 leading-relaxed pt-6 border-t border-border">
        By using Cardex, you acknowledge that you&rsquo;ve read and understood
        this disclaimer.
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

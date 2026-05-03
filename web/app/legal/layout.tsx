import Link from "next/link";

const LEGAL_NAV = [
  { href: "/legal/terms", label: "Terms of service" },
  { href: "/legal/privacy", label: "Privacy policy" },
  { href: "/legal/disclaimer", label: "Investment disclaimer" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 lg:px-10 py-10 max-w-4xl mx-auto">
      <nav className="text-xs font-mono uppercase tracking-[0.08em] text-muted mb-6">
        <Link href="/" className="hover:text-fg transition-colors duration-150">
          Market
        </Link>
        <span className="mx-2 text-muted-2">/</span>
        <span className="text-fg-2">Legal</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-8">
        <aside className="text-sm">
          <ul className="space-y-1">
            {LEGAL_NAV.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="block py-1 text-muted hover:text-fg transition-colors"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <article className="prose-legal text-sm text-fg-2 leading-relaxed">
          {children}
        </article>
      </div>
    </div>
  );
}

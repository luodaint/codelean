import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import "./marketing.css";

const github = "https://github.com/luodaint/codelean";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="marketing">
      <header className="marketing-header">
        <Link className="marketing-brand" href="/" aria-label="Codelean home">
          <span className="marketing-brand-mark" aria-hidden="true">
            &lt;/&gt;
          </span>
          <span>
            codelean<span className="marketing-brand-dot">.</span>
          </span>
        </Link>
        <nav aria-label="Site navigation">
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#pricing">Pricing</Link>
          <a href={github} target="_blank" rel="noreferrer">
            GitHub <ArrowUpRight size={14} />
          </a>
        </nav>
        <Link className="marketing-header-cta" href="/login">
          Get started <ArrowUpRight size={15} />
        </Link>
      </header>
      <main>{children}</main>
      <footer className="marketing-footer">
        <div>
          <Link className="marketing-brand" href="/">
            codelean<span className="marketing-brand-dot">.</span>
          </Link>
          <p>Thoughtful reviews for every pull request.</p>
        </div>
        <div className="marketing-footer-links">
          <a href={github} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <a href="mailto:hello@codelean.dev">hello@codelean.dev</a>
        </div>
        <small>© {new Date().getFullYear()} Luodaint LLC</small>
      </footer>
    </div>
  );
}

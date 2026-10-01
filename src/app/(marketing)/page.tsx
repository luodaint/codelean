import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  GitPullRequest,
  LockKeyhole,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { pricing } from "@/lib/billing-policy";

export const metadata: Metadata = {
  title: "Codelean — A second look at every pull request",
  description:
    "Open-source pull request reviews with static security checks and AI analysis. Self-host for free or use the hosted cloud service.",
};

const github = "https://github.com/luodaint/codelean";

export default function LandingPage() {
  const monthly = pricing.monthlyCents / 100;
  const included = Number(pricing.includedTokens) / 1_000_000;
  const overage = 1_000_000 / Number(pricing.tokensPerCent) / 100;

  return (
    <>
      <section className="marketing-hero">
        <div className="marketing-hero-copy">
          <div className="marketing-eyebrow">
            <span /> OPEN SOURCE PR REVIEWER
          </div>
          <h1>
            Catch what slips through <em>before the merge.</em>
          </h1>
          <p>
            Codelean gives every GitHub pull request a considered second look.
            Security checks, AI review, and clear findings land where your team
            already works.
          </p>
          <div className="marketing-actions">
            <Link className="marketing-button primary" href="/login">
              Start with Codelean <ArrowRight size={18} />
            </Link>
            <a
              className="marketing-button outline"
              href={github}
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub <ArrowUpRight size={17} />
            </a>
          </div>
          <div className="marketing-hero-note">
            MIT licensed <span>·</span> Self-host or use our cloud{" "}
            <span>·</span> You decide what merges
          </div>
        </div>
        <div
          className="marketing-preview"
          aria-label="Example pull request review"
        >
          <div className="marketing-preview-top">
            <span className="marketing-preview-dots">
              <i />
              <i />
              <i />
            </span>
            <span>pull request / review</span>
            <span className="marketing-preview-check">
              ● &nbsp; Checks complete
            </span>
          </div>
          <div className="marketing-preview-body">
            <div className="marketing-preview-label">
              <GitPullRequest size={16} /> PR #128 <span>·</span> Add session
              refresh
            </div>
            <h2>A clearer path to merge.</h2>
            <p>
              Codelean reviewed the latest commit and surfaced what deserves a
              closer look.
            </p>
            <div className="marketing-preview-row">
              <span className="marketing-preview-icon amber">!</span>
              <div>
                <strong>Check authorization before updating</strong>
                <small>src/auth/session.ts · line 84</small>
              </div>
              <span className="marketing-preview-tag">Correctness</span>
            </div>
            <div className="marketing-preview-row">
              <span className="marketing-preview-icon blue">⌕</span>
              <div>
                <strong>Review token exposure in logs</strong>
                <small>src/auth/session.ts · line 112</small>
              </div>
              <span className="marketing-preview-tag">Security</span>
            </div>
            <div className="marketing-preview-end">
              <span>
                <i /> Advisory review
              </span>
              <span>Commit 6e4a1c2</span>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-band" aria-label="Product principles">
        <span>Built for teams that ship with care</span>
        <div>
          <span>01 / GITHUB NATIVE</span>
          <span>02 / OPEN SOURCE</span>
          <span>03 / HUMAN DECISION</span>
        </div>
      </section>

      <section className="marketing-section" id="how-it-works">
        <div className="marketing-section-heading">
          <div>
            <span className="marketing-kicker">WHAT YOU GET</span>
            <h2>
              More signal.
              <br />
              Less review fatigue.
            </h2>
          </div>
          <p>
            Codelean combines focused static checks with AI analysis, then puts
            actionable findings back on the exact pull request commit.
          </p>
        </div>
        <div className="marketing-features">
          <article>
            <div className="marketing-feature-icon">
              <ScanSearch size={23} />
            </div>
            <span>01</span>
            <h3>Security checks first</h3>
            <p>
              Gitleaks looks for exposed secrets. Bundled Semgrep rules catch
              selected risky patterns before AI review begins.
            </p>
          </article>
          <article>
            <div className="marketing-feature-icon">
              <Sparkles size={23} />
            </div>
            <span>02</span>
            <h3>A thoughtful second look</h3>
            <p>
              AI reviews changed code for concrete security, correctness,
              performance, and maintainability issues.
            </p>
          </article>
          <article>
            <div className="marketing-feature-icon">
              <LockKeyhole size={23} />
            </div>
            <span>03</span>
            <h3>Keep control</h3>
            <p>
              See checks, comments, and review history in GitHub and the
              dashboard. Reviews are advisory; your team owns the merge.
            </p>
          </article>
        </div>
      </section>

      <section className="marketing-open-source">
        <div>
          <span className="marketing-kicker">OPEN BY DESIGN</span>
          <h2>
            Read the code.
            <br />
            Run it your way.
          </h2>
          <p>
            Codelean is open source under the MIT license. Bring your own
            infrastructure, GitHub App, and compatible model provider, or let us
            host the service for your team.
          </p>
          <a href={github} target="_blank" rel="noreferrer">
            Explore the repository <ArrowUpRight size={17} />
          </a>
        </div>
        <div className="marketing-terminal">
          <div>
            <span>● ● ●</span>
            <span>terminal</span>
          </div>
          <pre>
            <span>$</span> git clone https://github.com/luodaint/codelean.git
            <br />
            <span>$</span> cd codelean
            <br />
            <span>$</span> npm ci
            <br />
            <span>$</span> npm run setup
            <br />
            <br />
            <i># Your code. Your infrastructure. Your call.</i>
          </pre>
        </div>
      </section>

      <section className="marketing-section marketing-pricing" id="pricing">
        <div className="marketing-section-heading">
          <div>
            <span className="marketing-kicker">SIMPLE PRICING</span>
            <h2>
              Choose your
              <br />
              starting point.
            </h2>
          </div>
          <p>
            The same open-source foundation, with a choice between running
            Codelean yourself and a managed cloud workspace.
          </p>
        </div>
        <div className="marketing-plans">
          <article>
            <div className="marketing-plan-top">
              <span>SELF-HOSTED</span>
              <span>MIT LICENSE</span>
            </div>
            <h3>
              Free <small>/ forever</small>
            </h3>
            <p>Run Codelean on infrastructure you control.</p>
            <ul>
              <li>No Codelean subscription</li>
              <li>Bring your own model provider</li>
              <li>Full source code on GitHub</li>
            </ul>
            <a
              className="marketing-button outline"
              href={github}
              target="_blank"
              rel="noreferrer"
            >
              Self-host from GitHub <ArrowUpRight size={17} />
            </a>
            <small className="marketing-plan-note">
              Infrastructure and model provider costs are yours.
            </small>
          </article>
          <article className="featured">
            <div className="marketing-plan-top">
              <span>CODELEAN CLOUD</span>
              <span>MANAGED HOSTING</span>
            </div>
            <h3>
              ${monthly} <small>/ workspace / month</small>
            </h3>
            <p>Get reviews without operating the stack yourself.</p>
            <ul>
              <li>{included} million review tokens included each month</li>
              <li>All review features included</li>
              <li>${overage.toFixed(2)} per million additional tokens</li>
            </ul>
            <Link className="marketing-button primary" href="/login">
              Get started <ArrowRight size={17} />
            </Link>
            <small className="marketing-plan-note">
              Additional usage and applicable taxes are billed separately. A
              spending cap is available.
            </small>
          </article>
        </div>
      </section>

      <section className="marketing-bottom-cta">
        <span className="marketing-kicker">READY FOR A SECOND LOOK?</span>
        <h2>Make every review count.</h2>
        <p>
          Connect your repositories and let Codelean surface the things worth
          discussing.
        </p>
        <Link className="marketing-button light" href="/login">
          Get started <ArrowRight size={18} />
        </Link>
      </section>
    </>
  );
}

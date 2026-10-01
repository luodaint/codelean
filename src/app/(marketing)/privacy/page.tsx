import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy — Codelean" };

export default function PrivacyPage() {
  return (
    <article className="marketing-legal">
      <Link href="/" className="marketing-back">
        ← Back to Codelean
      </Link>
      <span className="marketing-kicker">LEGAL</span>
      <h1>Privacy Policy</h1>
      <p className="marketing-legal-intro">
        Effective October 1, 2026. This policy describes how Luodaint LLC
        handles information in the Codelean hosted service and website. If you
        self-host Codelean, your operator controls that deployment’s data
        practices.
      </p>
      <section>
        <h2>1. Information we process</h2>
        <p>
          We process account details such as your name, verified email address,
          GitHub identity and avatar; workspace membership and settings;
          connected repository details; pull request content needed for reviews;
          findings, comments, checks, and review history; billing and usage
          records; and technical information such as session data and service
          logs. Payment card details are handled by our payment provider, not
          stored by Codelean.
        </p>
      </section>
      <section>
        <h2>2. How we use it</h2>
        <p>
          We use this information to sign you in, connect repositories, run and
          publish reviews, manage workspaces, provide support, bill for hosted
          usage, secure and improve the service, and comply with legal
          obligations. We use necessary session cookies for authentication. We
          do not sell personal information.
        </p>
      </section>
      <section>
        <h2>3. Code and third parties</h2>
        <p>
          When a repository is enabled, Codelean retrieves bounded pull request
          content from GitHub. A scanner checks for secrets and selected risky
          patterns; detected secrets and common credentials are redacted on a
          best-effort basis before model analysis. The remaining review input is
          sent to the model provider configured for the service. Review results
          are published back to GitHub and stored with the workspace. GitHub,
          our hosting and infrastructure providers, the model provider, email
          provider, and payment processor may process information as needed to
          deliver their parts of the service. Their own policies also apply.
        </p>
      </section>
      <section>
        <h2>4. Retention and security</h2>
        <p>
          We keep account, workspace, review, and billing records while needed
          to operate the service and meet legitimate legal, security, or
          accounting requirements. Historical review findings may include code
          excerpts. We use access controls and other reasonable safeguards, but
          no system is perfectly secure. Contact us to request deletion; we will
          explain any records we must keep.
        </p>
      </section>
      <section>
        <h2>5. Your choices and rights</h2>
        <p>
          You can disconnect repositories through workspace settings or GitHub
          and cancel a hosted subscription through billing controls. You may
          request access, correction, or deletion of your personal information
          by emailing us. Depending on where you live, additional privacy rights
          may apply. We will respond in accordance with applicable law.
        </p>
      </section>
      <section>
        <h2>6. International processing and changes</h2>
        <p>
          Our providers may process information in countries other than yours.
          We may update this policy as the service changes and will post the new
          effective date here. For material changes, we will provide notice
          through the service or another reasonable channel.
        </p>
      </section>
      <section>
        <h2>7. Contact</h2>
        <p>
          Luodaint LLC
          <br />8 The Green #20373
          <br />
          Dover, DE 19901
          <br />
          <a href="mailto:hello@codelean.dev">hello@codelean.dev</a>
        </p>
      </section>
    </article>
  );
}

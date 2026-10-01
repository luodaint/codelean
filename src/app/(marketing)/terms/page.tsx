import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Service — Codelean" };

export default function TermsPage() {
  return (
    <article className="marketing-legal">
      <Link href="/" className="marketing-back">
        ← Back to Codelean
      </Link>
      <span className="marketing-kicker">LEGAL</span>
      <h1>Terms of Service</h1>
      <p className="marketing-legal-intro">
        Effective October 1, 2026. These terms govern the Codelean hosted
        service operated by Luodaint LLC. The separately distributed open-source
        software is governed by its MIT license.
      </p>
      <section>
        <h2>1. Using the service</h2>
        <p>
          You must have authority to connect any GitHub account, organization,
          or repository you use with Codelean. You are responsible for your
          workspace, its members, connected repositories, and activity under
          your account. Keep your credentials secure and use the service
          lawfully.
        </p>
      </section>
      <section>
        <h2>2. What Codelean does</h2>
        <p>
          Codelean analyzes selected pull requests using static checks and a
          configured AI model, then may publish checks, comments, and labels to
          GitHub. Reviews are advisory and may be incomplete or incorrect. You
          remain responsible for reviewing code, security decisions, and merges.
          Codelean does not approve or merge pull requests for you.
        </p>
      </section>
      <section>
        <h2>3. Your code and permissions</h2>
        <p>
          You retain ownership of your code and other content. You grant us the
          limited permission needed to access, process, store, and share that
          content with service providers to deliver the hosted service.
          Connecting a repository authorizes analysis of its selected pull
          requests, including sending bounded, redacted code to the configured
          model provider. Do not connect content you lack permission to process.
        </p>
      </section>
      <section>
        <h2>4. Plans and billing</h2>
        <p>
          The self-hosted software has no Codelean subscription fee; your own
          infrastructure and model costs still apply. The hosted plan is $10 per
          workspace per month and includes 20 million review tokens monthly.
          Additional review usage is $0.50 per million tokens, plus applicable
          taxes. Workspace owners can set an extra-usage spending limit. Prices
          and applicable charges are shown before checkout. Subscription
          cancellation takes effect at the end of the paid period; any accrued
          charges remain payable. Purchased token packs, if offered, are
          described at checkout.
        </p>
      </section>
      <section>
        <h2>5. Availability and changes</h2>
        <p>
          We may change, suspend, or discontinue features, including to protect
          the service or comply with law. We may update these terms and will
          post the revised date here. Material changes will be communicated
          through the service or another reasonable channel. Continued use after
          the effective date means you accept the updated terms.
        </p>
      </section>
      <section>
        <h2>6. Ending use</h2>
        <p>
          You may stop using the service and cancel a hosted subscription
          through workspace billing controls. We may suspend or terminate access
          for misuse, nonpayment, security concerns, or legal requirements.
          Contact us to request account or workspace deletion; some records may
          be retained for legitimate billing, security, or legal needs.
        </p>
      </section>
      <section>
        <h2>7. Warranties and liability</h2>
        <p>
          To the extent permitted by law, the hosted service is provided “as is”
          and without warranties of uninterrupted operation or error-free
          findings. Neither party is liable for indirect or consequential
          damages. Our total liability arising from the hosted service is
          limited to the amount you paid us for that service during the 12
          months before the claim. These limits do not apply where prohibited by
          law.
        </p>
      </section>
      <section>
        <h2>8. Contact</h2>
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

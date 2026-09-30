import { Brand } from "@/components/shell";
import { GitHubLogin } from "@/components/github-login";
import { EmailLogin } from "@/components/email-login";
import { isAdmin } from "@/lib/auth";
import { localOtpBypass } from "@/lib/auth-policy";
import {
  appUrl,
  githubLoginConfigured,
  emailLoginConfigured,
} from "@/lib/config";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const local = localOtpBypass(
    process.env.NODE_ENV,
    process.env.DEV_AUTH_BYPASS,
    appUrl(),
  );
  if (await isAdmin()) redirect("/");
  return (
    <div className="login-page">
      <div className="login-story">
        <Brand />
        <div>
          <div className="review-mark">&lt;/&gt;</div>
          <h1>
            A second look.
            <br />A better merge.
          </h1>
          <p>
            Security checks and thoughtful code reviews, on infrastructure you
            control.
          </p>
        </div>
        <small>Your code. Your models. Your call.</small>
      </div>
      <div className="login-form">
        <h2>Welcome to your workspace</h2>
        <p>
          Sign in with GitHub to bring your developer identity into Codelean.
        </p>
        {error && (
          <p className="notice danger" role="alert">
            GitHub sign-in did not complete. Try again, and make sure a verified
            email on your GitHub account is allowed for this workspace.
          </p>
        )}
        <GitHubLogin configured={githubLoginConfigured()} />
        {(local || emailLoginConfigured()) && (
          <details
            className="email-fallback"
            open={local && !githubLoginConfigured()}
          >
            <summary>
              {local
                ? "Local development sign-in"
                : "Use an email code instead"}
            </summary>
            <EmailLogin local={local} />
          </details>
        )}
        <p className="login-note">
          Access is limited to the administrator emails configured for this
          instance.
        </p>
      </div>
    </div>
  );
}

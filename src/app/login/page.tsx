import { Brand } from "@/components/shell";
import { EmailLogin } from "@/components/email-login";
import { isAdmin } from "@/lib/auth";
import { localOtpBypass } from "@/lib/auth-policy";
import { appUrl } from "@/lib/config";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Login() {
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
        <p>We’ll send a sign-in code to your email. No password needed.</p>
        <EmailLogin
          local={localOtpBypass(
            process.env.NODE_ENV,
            process.env.DEV_AUTH_BYPASS,
            appUrl(),
          )}
        />
        <p className="login-note">
          Access is limited to the administrator emails configured for this
          instance.
        </p>
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
const client = createAuthClient({ plugins: [emailOTPClient()] });
export function EmailLogin({ local }: { local: boolean }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send() {
    setBusy(true);
    setError("");
    try {
      const result = await client.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });
      if (result.error)
        setError(result.error.message || "Could not send a code. Try again.");
      else setSent(true);
    } catch {
      setError("Could not reach the sign-in service. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setError("");
    try {
      const result = await client.signIn.emailOtp({ email, otp });
      if (result.error)
        setError(
          result.error.message || "That code did not work. Request a new one.",
        );
      else window.location.assign("/");
    } catch {
      setError("Could not complete sign-in. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void (sent ? verify() : send());
        }}
      >
        {!sent ? (
          <>
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              maxLength={254}
            />
          </>
        ) : (
          <>
            <p>
              {local
                ? "Development mode: enter any numeric code."
                : `Enter the six-digit code sent to ${email}.`}
            </p>
            <label htmlFor="otp">Sign-in code</label>
            <input
              className="otp-input"
              id="otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern={local ? "[0-9]{1,12}" : "[0-9]{6}"}
              maxLength={local ? 12 : 6}
              autoFocus
            />
          </>
        )}
        {error && (
          <p className="notice danger" role="alert">
            {error}
          </p>
        )}
        <button className="button" disabled={busy}>
          {busy
            ? "One moment…"
            : sent
              ? "Verify and sign in"
              : "Send sign-in code"}
        </button>
      </form>
      {sent && (
        <div className="login-options">
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setSent(false);
              setOtp("");
              setError("");
            }}
          >
            Use a different email
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void send()}
          >
            Send a new code
          </button>
        </div>
      )}
      {local && (
        <p className="notice">
          Local development: no email is sent. Request a code, then enter any
          number to sign in.
        </p>
      )}
    </>
  );
}

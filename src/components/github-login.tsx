"use client";
import { useState } from "react";
import { Github } from "lucide-react";
import { createAuthClient } from "better-auth/react";
const client = createAuthClient();
export function GitHubLogin({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const result = await client.signIn.social({
        provider: "github",
        callbackURL: "/dashboard",
        errorCallbackURL: "/login",
      });
      if (result.error) {
        setError("Could not start GitHub sign-in. Please try again.");
        setBusy(false);
      }
    } catch {
      setError("Could not reach the sign-in service. Please try again.");
      setBusy(false);
    }
  }
  return (
    <div className="github-login">
      <button
        className="button github-button"
        disabled={!configured || busy}
        onClick={() => void signIn()}
      >
        <Github size={19} />
        {busy ? "Opening GitHub…" : "Continue with GitHub"}
      </button>
      {!configured && (
        <p className="notice">
          GitHub sign-in is awaiting configuration by the instance
          administrator.
        </p>
      )}
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

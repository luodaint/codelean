export function adminEmailAllowed(email: unknown, configured: string) {
  return (
    typeof email === "string" &&
    configured
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.trim().toLowerCase())
  );
}
// An optional deployment gate, never a workspace authorization mechanism.
export function signupAllowed(email: unknown) {
  return (
    (process.env.SIGNUP_MODE || "open") === "open" ||
    (process.env.SIGNUP_MODE === "restricted" &&
      adminEmailAllowed(email, process.env.ADMIN_EMAILS || ""))
  );
}
export function localOtpBypass(
  nodeEnv: string | undefined,
  enabled: string | undefined,
  url: string,
) {
  if (nodeEnv !== "development" || enabled !== "true") return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

import { createHmac, timingSafeEqual } from "node:crypto";
export function constantEqual(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function verifyWebhook(body: string, signature: string, secret: string) {
  return constantEqual(
    signature,
    `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
  );
}
export function safePath(path: string) {
  return (
    path.length > 0 &&
    path.length <= 500 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").some((p) => p === ".." || p === "." || !p) &&
    !/[\x00-\x1f]/.test(path)
  );
}
export function redact(text: string) {
  return text
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
      (match) =>
        match
          .split("\n")
          .map(() => "[REDACTED PRIVATE KEY]")
          .join("\n"),
    )
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16})\b/g,
      "[REDACTED]",
    )
    .replace(
      /((?:password|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["'])([^"'\n]{8,})(["'])/gi,
      "$1[REDACTED]$3",
    );
}

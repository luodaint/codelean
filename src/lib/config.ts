export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}
export function appUrl() {
  return required("APP_URL").replace(/\/$/, "");
}
export function githubConfigured() {
  return Boolean(
    process.env.GITHUB_APP_ID &&
    process.env.GITHUB_PRIVATE_KEY_BASE64 &&
    process.env.GITHUB_APP_SLUG,
  );
}
export const limits = {
  files: 30,
  fileBytes: 100_000,
  totalBytes: 500_000,
  findings: 20,
  comments: 5,
  modelOutputTokens: 32_768,
  modelTimeoutMs: 360_000,
  modelBatchBytes: 50_000,
  modelBatchFiles: 5,
};

export function githubLoginConfigured() {
  return Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  );
}

export function emailLoginConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.EMAIL_FROM,
  );
}

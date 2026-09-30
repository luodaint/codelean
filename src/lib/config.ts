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
};

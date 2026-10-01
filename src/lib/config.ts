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
  modelOutputTokens: 65_536,
  modelTimeoutMs: 360_000,
  modelConcurrency: 5,
  modelRunTimeoutMs: 600_000,
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

// Select one complete configuration family so a legacy key is never sent to a new endpoint.
export function modelConfig() {
  const generic = [
    "LLM_BASE_URL",
    "LLM_API_KEY",
    "LLM_MODEL",
    "LLM_FALLBACK_MODEL",
  ].some((name) => Boolean(process.env[name]?.trim()));
  const prefix = generic ? "LLM" : "NAN";
  return {
    baseUrl:
      process.env[`${prefix}_BASE_URL`]?.trim() ||
      (generic ? "https://api.openai.com/v1" : "https://api.nan.builders/v1"),
    apiKey: process.env[`${prefix}_API_KEY`]?.trim() || "",
    model: process.env[`${prefix}_MODEL`]?.trim() || "",
    fallbackModel: process.env[`${prefix}_FALLBACK_MODEL`]?.trim() || "",
    prefix,
  };
}
export function configuredModel() {
  const config = modelConfig();
  if (!config.model)
    throw new Error(`Missing configuration: ${config.prefix}_MODEL`);
  return config.model;
}
export function creemConfigured() {
  return [
    "CREEM_API_KEY",
    "CREEM_WEBHOOK_SECRET",
    "CREEM_PLAN_PRODUCT_ID",
    "CREEM_TOKEN_PRODUCT_ID",
    "CREEM_METER_ID",
  ].every((name) => Boolean(process.env[name]?.trim()));
}

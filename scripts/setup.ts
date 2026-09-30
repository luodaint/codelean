import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const random = () => randomBytes(32).toString("hex");
let template = await readFile(".env.example", "utf8");
const databasePassword = random();
for (const [key, value] of Object.entries({
  BETTER_AUTH_SECRET: random(),
  POSTGRES_PASSWORD: databasePassword,
  GITHUB_WEBHOOK_SECRET: random(),
  SCANNER_TOKEN: random(),
})) {
  template = template.replace(
    new RegExp(`^${key}=.*$`, "m"),
    `${key}=${value}`,
  );
}
template = template.replace(
  "postgresql://luoda:replace-me@",
  `postgresql://luoda:${databasePassword}@`,
);
await writeFile(".env", template, { mode: 0o600, flag: "wx" });
console.log(
  "Created .env with restricted permissions. Fill in APP_URL, ADMIN_EMAILS, SMTP, GitHub App credentials, and NAN_API_KEY/NAN_MODEL. Existing files are never overwritten.",
);

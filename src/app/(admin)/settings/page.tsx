import { CircleCheck, CircleDashed } from "lucide-react";
import { appUrl } from "@/lib/config";
import { requireAdmin } from "@/lib/auth";
export default async function Settings() {
  await requireAdmin();
  const checks = [
    ["GitHub App ID", "GITHUB_APP_ID"],
    ["GitHub private key", "GITHUB_PRIVATE_KEY_BASE64"],
    ["GitHub App slug", "GITHUB_APP_SLUG"],
    ["Webhook secret", "GITHUB_WEBHOOK_SECRET"],
    ["Review model", "NAN_MODEL"],
    ["Email server", "SMTP_HOST"],
    ["Allowed administrators", "ADMIN_EMAILS"],
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Your instance’s connections and review defaults.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Connections</h2>
              <p>Credentials are managed in your deployment environment.</p>
            </div>
          </div>
          <div className="settings-list">
            {checks.map(([label, key]) => (
              <div key={key}>
                <span>{label}</span>
                <span className={process.env[key] ? "configured" : "muted"}>
                  {process.env[key] ? (
                    <>
                      <CircleCheck size={16} /> Configured
                    </>
                  ) : (
                    <>
                      <CircleDashed size={16} /> Missing
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Review policy</h2>
          </div>
          <dl className="policy-list">
            <dt>Mode</dt>
            <dd>Advisory</dd>
            <dt>Automatic approvals</dt>
            <dd>Disabled</dd>
            <dt>GitHub check outcome</dt>
            <dd>Neutral</dd>
            <dt>Model</dt>
            <dd>{process.env.NAN_MODEL || "Not configured"}</dd>
            <dt>Concurrent scans</dt>
            <dd>1</dd>
            <dt>Changed files per run</dt>
            <dd>Up to 30</dd>
            <dt>Inline comments</dt>
            <dd>Up to 5</dd>
          </dl>
        </section>
      </div>
      <section className="panel endpoint">
        <h2>GitHub webhook</h2>
        <p>
          Use this endpoint when registering your GitHub App. Subscribe to pull
          request, installation, and installation repositories events.
        </p>
        <code>{appUrl()}/api/webhooks/github</code>
      </section>
      <p className="help-text">
        The web interface never displays saved credentials. Restart affected
        services after changing deployment environment variables.
      </p>
    </>
  );
}

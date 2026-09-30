import { FolderGit2, ArrowUpRight, RefreshCw } from "lucide-react";
import { overview } from "@/lib/data";
import { githubConfigured } from "@/lib/config";
import { sync, updateRepository } from "@/app/actions";
import { Submit } from "@/components/submit";
export default async function Repositories({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; synced?: string }>;
}) {
  const data = await overview();
  const params = await searchParams;
  const configured = githubConfigured();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Repositories</h1>
          <p>Choose where Codelean reviews, and how it contributes.</p>
        </div>
        {configured && (
          <a
            className="button"
            href={`https://github.com/apps/${encodeURIComponent(process.env.GITHUB_APP_SLUG!)}/installations/new`}
            target="_blank"
            rel="noreferrer"
          >
            Install GitHub App <ArrowUpRight size={16} />
          </a>
        )}
      </div>
      {!configured && (
        <div className="notice">
          Configure your GitHub App credentials in the deployment environment
          first. The Settings page shows what is missing.
        </div>
      )}
      {params.error && (
        <div role="alert" className="notice danger">
          Could not sync GitHub installations. Check the App ID, private key,
          and permissions, then try again.
        </div>
      )}
      {params.synced && (
        <div className="notice success">
          Repository access is up to date. Enable reviews for the repositories
          you want to monitor.
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Connected repositories</h2>
            <p>
              After installing the App, sync to verify its repository access.
            </p>
          </div>
          {configured && (
            <form action={sync}>
              <Submit pending="Syncing…" className="button secondary">
                <RefreshCw size={16} /> Sync from GitHub
              </Submit>
            </form>
          )}
        </div>
        {!data.repositories.length ? (
          <div className="empty">
            <FolderGit2 size={36} strokeWidth={1.3} />
            <h2>Your repositories, connected</h2>
            <p>
              Install your GitHub App on selected repositories, then sync.
              Reviews start when you explicitly enable them.
            </p>
          </div>
        ) : (
          <div className="repo-list">
            {data.repositories.map((repo) => (
              <form
                action={updateRepository}
                key={repo.id}
                className="repo-row"
              >
                <input type="hidden" name="id" value={repo.id} />
                <FolderGit2 size={24} />
                <div className="repo-name">
                  <h3>{repo.full_name}</h3>
                  <small>
                    {repo.connected
                      ? `Installation ${repo.installation_id}`
                      : "Access removed — sync after reconnecting"}
                  </small>
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={repo.enabled}
                    disabled={!repo.connected}
                  />{" "}
                  Review PRs
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    name="labels"
                    defaultChecked={repo.labels_enabled}
                    disabled={!repo.connected}
                  />{" "}
                  Update labels
                </label>
                {repo.connected && (
                  <Submit className="button secondary">Save</Submit>
                )}
              </form>
            ))}
          </div>
        )}
      </section>
      <p className="help-text">
        New repositories start paused. Reviews publish advisory comments and a
        neutral check. Label updates require the GitHub App’s Issues write
        permission.
      </p>
    </>
  );
}

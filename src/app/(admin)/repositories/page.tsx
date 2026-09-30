import { FolderGit2, ArrowUpRight, RefreshCw } from "lucide-react";
import { overview } from "@/lib/data";
import { userInstallations, type UserInstallation } from "@/lib/github";
import { userGitHub } from "@/lib/github-user";
import { canManage } from "@/lib/workspaces";
import { githubConfigured } from "@/lib/config";
import { sync, updateRepository } from "@/app/actions";
import { Submit } from "@/components/submit";
import { InstallationRefresh } from "@/components/installation-refresh";
export default async function Repositories({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; synced?: string }>;
}) {
  const data = await overview();
  const params = await searchParams;
  const configured = githubConfigured();
  const managing = canManage(data.workspace);
  let installations: UserInstallation[] = [];
  let githubError = false;
  if (configured && managing) {
    try {
      installations = await userInstallations(await userGitHub());
    } catch {
      githubError = true;
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Repositories</h1>
          <p>Choose where Codelean reviews, and how it contributes.</p>
        </div>
        {configured && managing && (
          <div className="repository-actions">
            <InstallationRefresh />
            <a
              className="button"
              href={`https://github.com/apps/${encodeURIComponent(process.env.GITHUB_APP_SLUG!)}/installations/new`}
              target="_blank"
              rel="noreferrer"
            >
              Install GitHub App <ArrowUpRight size={16} />
            </a>
          </div>
        )}
      </div>
      {!configured && (
        <div className="notice">
          GitHub integration is not configured yet. Ask the instance operator to
          finish the GitHub App setup.
        </div>
      )}
      {params.error && (
        <div role="alert" className="notice danger">
          {params.error === "organization-permission" ? (
            <>
              GitHub could not verify your organization role. The App needs
              Organization permissions → Members: Read-only, and the
              organization owner must approve the updated installation
              permissions. Also check any organization access restrictions, then
              retry.
            </>
          ) : params.error === "organization-owner" ? (
            <>
              An active GitHub organization owner must connect this
              installation. Ask an owner to sign in and sync it from this
              workspace.
            </>
          ) : (
            <>
              Could not connect this installation. You must own the GitHub
              account or organization and manage this workspace. An installation
              can belong to only one workspace. Check the App credentials and
              try again.
            </>
          )}
        </div>
      )}
      {githubError && (
        <div role="alert" className="notice danger">
          GitHub access could not be verified. Sign out and sign in with GitHub
          again, or ask the instance operator to check the App configuration.
        </div>
      )}
      {configured && managing && !githubError && installations.length === 0 && (
        <div className="notice">
          No installation is available for your signed-in GitHub account yet.
          Install the App on an account you own, then refresh installations.
          Organization installations may need approval from an organization
          owner.
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
              Install the App, then select an installation to connect to this
              workspace. GitHub organization owners can connect their company.
            </p>
          </div>
          {configured && managing && installations.length > 0 && (
            <form action={sync} className="installation-connect">
              <label>
                GitHub account{" "}
                <select
                  name="installation"
                  required
                  defaultValue={
                    installations.length === 1
                      ? String(installations[0].id)
                      : ""
                  }
                >
                  <option value="" disabled>
                    Select an installation
                  </option>
                  {installations.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.account.login}
                    </option>
                  ))}
                </select>
              </label>
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
                    disabled={!repo.connected || !managing}
                  />{" "}
                  Review PRs
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    name="labels"
                    defaultChecked={repo.labels_enabled}
                    disabled={!repo.connected || !managing}
                  />{" "}
                  Update labels
                </label>
                {repo.connected && managing && (
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

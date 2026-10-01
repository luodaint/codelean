import { modelConfig } from "@/lib/config";
import { headers } from "next/headers";
import { auth, requireWorkspace } from "@/lib/auth";
import { canManage } from "@/lib/workspaces";
import { Submit } from "@/components/submit";
import {
  inviteMember,
  removeMember,
  cancelInvitation,
} from "@/app/workspaces/actions";
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invited?: string }>;
}) {
  const { session, workspace } = await requireWorkspace();
  const params = await searchParams;
  const organization = await auth().api.getFullOrganization({
    headers: await headers(),
    query: { organizationId: workspace.id },
  });
  const managing = canManage(workspace);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>{workspace.name} · Workspace members and review policy.</p>
        </div>
      </div>
      <section className="panel workspace-panel">
        <h2>Your account</h2>
        <p>
          {session.user.name ? `${session.user.name} · ` : ""}
          {session.user.email}
        </p>
        <p>
          {session.user.githubUsername
            ? `@${session.user.githubUsername}`
            : "Sign in with GitHub to connect repositories."}{" "}
          · {workspace.role}
        </p>
      </section>
      <section className="panel workspace-panel">
        <h2>Team members</h2>
        <p>
          Members can view reviews. Owners and administrators can manage
          repositories, retry reviews, and invite teammates.
        </p>
        {organization?.members.map((m) => (
          <div key={m.id} className="workspace-row">
            <div>
              <strong>{m.user.name}</strong>
              <small>
                {m.user.email} · {m.role}
              </small>
            </div>
            {managing && m.role !== "owner" && m.userId !== session.user.id && (
              <form action={removeMember}>
                <input type="hidden" name="memberId" value={m.id} />
                <Submit className="button secondary">Remove member</Submit>
              </form>
            )}
          </div>
        ))}
      </section>
      {managing && (
        <section className="panel workspace-panel">
          <h2>Invite a teammate</h2>
          <p>
            Use their verified GitHub sign-in email. They’ll see the invitation
            on their Workspaces page. No email is sent.
          </p>
          {params.error && (
            <p role="alert" className="notice danger">
              Could not create the invitation. Check the email, existing
              invitations, and your workspace role.
            </p>
          )}
          {params.invited && (
            <p className="notice success">
              Invitation created. Ask your teammate to sign in and open
              Workspaces.
            </p>
          )}
          <form action={inviteMember} className="workspace-form">
            <label>
              Email
              <input type="email" name="email" required />
            </label>
            <label>
              Role
              <select name="role" defaultValue="member">
                <option value="member">Member — view reviews</option>
                <option value="admin">Administrator — manage workspace</option>
              </select>
            </label>
            <Submit className="button">Create invitation</Submit>
          </form>
          {organization?.invitations
            .filter((i) => i.status === "pending")
            .map((i) => (
              <form
                key={i.id}
                action={cancelInvitation}
                className="workspace-row"
              >
                <input type="hidden" name="invitationId" value={i.id} />
                <span>
                  {i.email} · {i.role}
                </span>
                <Submit className="button secondary">Cancel invitation</Submit>
              </form>
            ))}
        </section>
      )}
      <section className="panel workspace-panel">
        <h2>Review policy</h2>
        <p>
          Reviews are advisory. Automatic approvals and merges are disabled.
        </p>
        <p>
          Code review and the separate PR-focused security audit use the enabled
          skills assigned to each phase in{" "}
          <code>review-skills/skills.json</code>. Edit the Markdown files in{" "}
          <code>review-skills/</code> to tune it. Each run records the skill
          versions and security results it actually used.
        </p>
        <dl className="policy-list">
          <dt>Model</dt>
          <dd>{modelConfig().model || "Not configured"}</dd>
          <dt>Changed files per run</dt>
          <dd>Up to 30</dd>
          <dt>Inline comments</dt>
          <dd>Up to 5</dd>
        </dl>
      </section>
    </>
  );
}

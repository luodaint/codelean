import { localOtpBypass } from "@/lib/auth-policy";
import { appUrl } from "@/lib/config";
import { headers } from "next/headers";
import { auth, requireUser } from "@/lib/auth";
import { workspacesFor } from "@/lib/workspaces";
import { Shell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { isOperator } from "@/lib/billing-policy";
import { acceptInvitation, createWorkspace, switchWorkspace } from "./actions";
import type { Metadata } from "next";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Workspaces() {
  const session = await requireUser();
  const canCreate =
    Boolean(session.user.githubId) ||
    localOtpBypass(process.env.NODE_ENV, process.env.DEV_AUTH_BYPASS, appUrl());
  const workspaces = await workspacesFor(session.user.id);
  const invitations = await auth().api.listUserInvitations({
    headers: await headers(),
  });
  return (
    <Shell
      operator={isOperator(session.user)}
      email={session.user.email}
      name={session.user.name}
      githubUsername={session.user.githubUsername}
      image={session.user.image}
    >
      <div className="page-heading">
        <div>
          <h1>Your workspaces</h1>
          <p>Each company has its own repositories, reviews, and members.</p>
        </div>
      </div>
      <section className="panel workspace-panel">
        <h2>Choose a workspace</h2>
        {workspaces.length ? (
          workspaces.map((w) => (
            <form action={switchWorkspace} key={w.id} className="workspace-row">
              <input type="hidden" name="organizationId" value={w.id} />
              <div>
                <strong>{w.name}</strong>
                <small>{w.role}</small>
              </div>
              <Submit className="button secondary">Open workspace</Submit>
            </form>
          ))
        ) : (
          <p>Create your first workspace or accept an invitation below.</p>
        )}
      </section>
      <section className="panel workspace-panel">
        <h2>Create a company workspace</h2>
        <p>
          You’ll be its owner. Invite teammates and connect GitHub after
          creating it.
        </p>
        {canCreate ? (
          <form action={createWorkspace} className="workspace-form">
            <label>
              Company or workspace name
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                placeholder="Acme Engineering"
              />
            </label>
            <Submit className="button">Create workspace</Submit>
          </form>
        ) : (
          <p>
            Sign out and sign in with GitHub to create a workspace. You can
            still accept a team invitation below.
          </p>
        )}
      </section>
      <section className="panel workspace-panel">
        <h2>Invitations</h2>
        <p>
          Invitations must match your verified sign-in email:{" "}
          {session.user.email}.
        </p>
        {invitations
          .filter(
            (i) => i.status === "pending" && new Date(i.expiresAt) > new Date(),
          )
          .map((i) => (
            <form
              action={acceptInvitation}
              key={i.id}
              className="workspace-row"
            >
              <input type="hidden" name="invitationId" value={i.id} />
              <span>
                {i.organizationName} · {i.role}
              </span>
              <Submit className="button secondary">Accept invitation</Submit>
            </form>
          ))}
      </section>
    </Shell>
  );
}

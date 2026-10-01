import Link from "next/link";
import { LogOut, ShieldCheck, ArrowUpRight } from "lucide-react";
import { logout } from "@/app/actions";
import { billingEnabled } from "@/lib/billing-policy";
import { Navigation } from "./navigation";
export function Brand() {
  return (
    <span className="brand">
      <img
        className="brand-mark"
        src="/brand/codelean-mark.png"
        width={42}
        height={42}
        alt=""
      />
      <span>
        codelean<span className="brand-sub">PR checker</span>
      </span>
    </span>
  );
}
export function Shell({
  children,
  workspace,
  email,
  name,
  githubUsername,
  image,
  operator = false,
}: {
  children: React.ReactNode;
  workspace?: { name: string; role: string };
  email: string;
  name?: string;
  githubUsername?: string | null;
  image?: string | null;
  operator?: boolean;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" aria-label="Codelean home">
          <Brand />
        </Link>
        <Link href="/workspaces" className="workspace">
          <span className="workspace-avatar">C</span>
          <div>
            {workspace?.name || "Workspaces"}
            <small>
              {workspace
                ? `${workspace.role} · Switch workspace`
                : "Create or join a company"}
            </small>
          </div>
          <span className="workspace-dot" />
        </Link>
        <Navigation operator={operator} billing={billingEnabled()} />
        <div className="sidebar-bottom">
          <div className="advisory">
            <ShieldCheck size={20} />
            <span>
              Built for a second look
              <small>Advisory reviews. You decide.</small>
            </span>
          </div>
          <a
            href="https://github.com/settings/installations"
            target="_blank"
            rel="noreferrer"
          >
            GitHub installations <ArrowUpRight size={15} />
          </a>
          <form action={logout}>
            <button className="logout">
              <LogOut size={16} /> Sign out
            </button>
          </form>
          <span className="version">Codelean · v0.1.0</span>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span>
            Engineering / <strong>Code review</strong>
          </span>
          <div className="signed-in-user">
            {githubUsername && (
              <span className="signed-in-label">
                {name}
                <small>@{githubUsername}</small>
              </span>
            )}
            <span
              className="admin-avatar"
              title={`Signed in as ${email}`}
              aria-label={`Signed in as ${email}`}
            >
              {githubUsername && image ? (
                <img src={image} alt="" referrerPolicy="no-referrer" />
              ) : (
                email[0].toUpperCase()
              )}
            </span>
          </div>
        </header>
        <main>{children}</main>
        <footer>
          Every review belongs to a specific commit.{" "}
          <span>Powered by your configured AI provider.</span>
        </footer>
      </div>
    </div>
  );
}

import Link from "next/link";
import { LogOut, ShieldCheck, ArrowUpRight } from "lucide-react";
import { logout } from "@/app/actions";
import { Navigation } from "./navigation";
export function Brand() {
  return (
    <span className="brand">
      <ShieldCheck size={28} strokeWidth={1.7} />
      <span>
        luoda<span className="brand-sub">PR checker</span>
      </span>
    </span>
  );
}
export function Shell({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" aria-label="Luoda home">
          <Brand />
        </Link>
        <div className="workspace">
          <span className="workspace-avatar">L</span>
          <div>
            My workspace<small>Self-hosted instance</small>
          </div>
          <span className="workspace-dot" />
        </div>
        <Navigation />
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
          <span className="version">Luoda PR Checker · v0.1.0</span>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span>
            Engineering / <strong>Code review</strong>
          </span>
          <span
            className="admin-avatar"
            title={`Signed in as ${email}`}
            aria-label={`Signed in as ${email}`}
          >
            {email[0].toUpperCase()}
          </span>
        </header>
        <main>{children}</main>
        <footer>
          Every review belongs to a specific commit.{" "}
          <span>Powered by your models on NaN.</span>
        </footer>
      </div>
    </div>
  );
}

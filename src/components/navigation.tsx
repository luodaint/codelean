"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GitPullRequest,
  FolderGit2,
  ChartNoAxesCombined,
  Settings2,
} from "lucide-react";
export function Navigation({
  operator = false,
  billing = false,
}: {
  operator?: boolean;
  billing?: boolean;
}) {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation">
      {[
        { href: "/dashboard", name: "Review runs", Icon: GitPullRequest },
        { href: "/repositories", name: "Repositories", Icon: FolderGit2 },
        { href: "/statistics", name: "Statistics", Icon: ChartNoAxesCombined },
        { href: "/settings", name: "Settings", Icon: Settings2 },
        ...(billing
          ? [{ href: "/billing", name: "Billing & usage", Icon: Settings2 }]
          : []),
        ...(operator
          ? [{ href: "/super-admin", name: "Super admin", Icon: Settings2 }]
          : []),
      ].map(({ href, name, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={
            (
              href === "/dashboard"
                ? path === "/dashboard" || path.startsWith("/runs/")
                : path === href
            )
              ? "page"
              : undefined
          }
        >
          <Icon size={19} />
          {name}
        </Link>
      ))}
    </nav>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GitPullRequest,
  FolderGit2,
  ChartNoAxesCombined,
  Settings2,
} from "lucide-react";
export function Navigation() {
  const path = usePathname();
  return (
    <nav aria-label="Main navigation">
      {[
        { href: "/", name: "Review runs", Icon: GitPullRequest },
        { href: "/repositories", name: "Repositories", Icon: FolderGit2 },
        { href: "/statistics", name: "Statistics", Icon: ChartNoAxesCombined },
        { href: "/settings", name: "Settings", Icon: Settings2 },
      ].map(({ href, name, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={
            (
              href === "/"
                ? path === "/" || path.startsWith("/runs/")
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

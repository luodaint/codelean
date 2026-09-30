import { requireWorkspace } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { isOperator } from "@/lib/billing-policy";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, workspace } = await requireWorkspace();
  return (
    <Shell
      workspace={workspace}
      operator={isOperator(session.user)}
      email={session.user.email}
      name={session.user.name}
      githubUsername={session.user.githubUsername}
      image={session.user.image}
    >
      {children}
    </Shell>
  );
}

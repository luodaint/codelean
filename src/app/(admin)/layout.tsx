import { requireAdmin } from "@/lib/auth";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  return (
    <Shell
      email={session.user.email}
      name={session.user.name}
      githubUsername={session.user.githubUsername}
      image={session.user.image}
    >
      {children}
    </Shell>
  );
}

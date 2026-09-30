"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Installation opens GitHub in another tab. Refresh when the user comes back.
export function InstallationRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [router]);
  return (
    <a className="button secondary" href="/repositories">
      Refresh installations
    </a>
  );
}

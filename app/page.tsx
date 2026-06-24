import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getAuthUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const uid = await getAuthUserId();
  if (!uid) redirect("/login");
  return <AppShell />;
}

import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getAuthUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const uid = await getAuthUserId();
  if (uid) redirect("/");
  return <LoginForm />;
}

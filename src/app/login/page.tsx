import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { devInboxEnabled } from "@/lib/env";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getSession()) redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">Enosis Solutions</p>
        <h1 className="mt-1 mb-1 text-xl font-semibold">Talent Profile Studio</h1>
        <p className="mb-5 text-sm text-slate-600">Admin sign-in. We&apos;ll email you a one-time link.</p>
        <LoginForm devInbox={devInboxEnabled} />
      </Card>
    </main>
  );
}

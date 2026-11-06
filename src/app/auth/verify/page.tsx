import { Button, Card, buttonClass } from "@/components/ui";
import { verifyAction } from "@/app/login/actions";

// The sign-in happens on a button press (POST), not on page load, so email
// link scanners that prefetch URLs can't use up the one-time token.
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6 text-center">
        {error || !token ? (
          <>
            <h1 className="mb-2 text-lg font-semibold">This link has expired</h1>
            <p className="mb-5 text-sm text-slate-600">Sign-in links work once and expire after 15 minutes. Please ask for a new one.</p>
            <a href="/login" className={buttonClass("primary", "w-full")}>
              Back to sign-in
            </a>
          </>
        ) : (
          <form action={verifyAction}>
            <input type="hidden" name="token" value={token} />
            <h1 className="mb-2 text-lg font-semibold">Sign in to Talent Profile Studio</h1>
            <p className="mb-5 text-sm text-slate-600">Click below to finish signing in.</p>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}

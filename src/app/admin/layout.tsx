import Link from "next/link";
import { signOutAction } from "@/app/login/actions";
import { requireAdmin } from "@/lib/auth";
import { devInboxEnabled } from "@/lib/env";

const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/requirements", label: "Requirements" },
  { href: "/admin/resources", label: "Resources" },
  { href: "/admin/requests", label: "Requests" },
  { href: "/admin/import", label: "Import" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="leading-tight">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-brand">Enosis Solutions</span>
            <span className="block text-sm font-semibold text-slate-900">Talent Profile Studio</span>
          </Link>
          <nav className="flex max-w-full gap-1 overflow-x-auto text-sm whitespace-nowrap">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100">
                {n.label}
              </Link>
            ))}
            {devInboxEnabled && (
              <Link href="/dev/inbox" className="rounded-md px-3 py-1.5 text-amber-800 hover:bg-amber-50">
                Dev inbox
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline">{session.email}</span>
            <form action={signOutAction}>
              <button className="cursor-pointer rounded-md px-2 py-1 hover:bg-slate-100">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

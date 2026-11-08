import Link from "next/link";
import { getSession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isOperator, user, profile } = await getSession();
  const links = isOperator
    ? [
        { href: "/dashboard", label: "Vendors" },
        { href: "/dashboard/escalations", label: "Escalations" },
        { href: "/dashboard/usage", label: "AI costs" },
        { href: "/dashboard/billing", label: "Billing" },
      ]
    : [{ href: "/dashboard", label: "My shop" }];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">S</span>
            <span className="hidden sm:inline">SalesPadi</span>
          </Link>
          <nav className="flex flex-1 gap-1 overflow-x-auto text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-gray-700 hover:bg-gray-100">
                {l.label}
              </Link>
            ))}
          </nav>
          <form action="/auth/signout" method="post" className="flex items-center gap-3">
            <span className="hidden text-xs text-gray-500 md:inline">{profile?.full_name || user.email}</span>
            <button className="text-sm text-gray-600 hover:text-gray-900">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

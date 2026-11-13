import { getSession } from "@/lib/auth";
import { getTheme } from "@/lib/theme-server";
import { AppHeader, type HeaderLink } from "@/components/app-header";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isOperator, user, profile, supabase } = await getSession();
  const theme = await getTheme();
  let links: HeaderLink[] = [{ href: "/dashboard", label: "My shop", icon: "shop" }];
  if (isOperator) {
    const { count } = await supabase.from("conversations").select("id", { count: "exact", head: true }).eq("needs_attention", true);
    links = [
      { href: "/dashboard", label: "Vendors", icon: "vendors" },
      { href: "/dashboard/escalations", label: "Escalations", icon: "escalations", badge: count ?? 0 },
      { href: "/dashboard/usage", label: "AI costs", icon: "usage" },
      { href: "/dashboard/billing", label: "Billing", icon: "billing" },
    ];
  }
  const name = profile?.full_name || user.email?.split("@")[0] || "Account";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader links={links} name={name} email={user.email ?? ""} theme={theme} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-5 sm:pt-8">{children}</main>
    </div>
  );
}

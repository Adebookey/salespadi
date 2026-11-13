"use client";
// Shop navigation: underline tabs on desktop, a bottom tab bar with a "More" sheet on phones.
import { Home, MessageCircle, MoreHorizontal, Package, Settings2, ShoppingBag, Sparkles, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Sheet } from "./sheet";
import { cn } from "./ui";

const TABS = [
  { href: "", label: "Overview", short: "Home", icon: Home, primary: true },
  { href: "/inbox", label: "Inbox", short: "Inbox", icon: MessageCircle, primary: true },
  { href: "/orders", label: "Orders", short: "Orders", icon: ShoppingBag, primary: true },
  { href: "/catalog", label: "Catalog", short: "Catalog", icon: Package, primary: true },
  { href: "/setup", label: "Setup", short: "Setup", icon: Settings2, primary: false },
  { href: "/studio", label: "AI studio", short: "AI studio", icon: Sparkles, primary: false },
  { href: "/growth", label: "Growth", short: "Growth", icon: TrendingUp, primary: false },
  { href: "/team", label: "Team", short: "Team", icon: Users, primary: false },
];

export function VendorNav({ base, inboxBadge }: { base: string; inboxBadge: number }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const close = useCallback(() => setMore(false), []);
  const active = (href: string) => (href === "" ? path === base : path.startsWith(`${base}${href}`));
  const moreActive = TABS.some((t) => !t.primary && active(t.href));
  const badge = (n: number) =>
    n > 0 && <span className="tabular rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold leading-[18px] text-black">{n > 99 ? "99+" : n}</span>;

  return (
    <>
      <nav className="no-scrollbar -mx-4 mb-6 hidden gap-1 overflow-x-auto border-b border-line px-4 md:flex" aria-label="Shop">
        {TABS.map((t) => (
          <Link key={t.href} href={`${base}${t.href}`}
            className={cn("-mb-px inline-flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition",
              active(t.href) ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}>
            {t.label}
            {t.href === "/inbox" && badge(inboxBadge)}
          </Link>
        ))}
      </nav>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-xl md:hidden" aria-label="Shop">
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {TABS.filter((t) => t.primary).map((t) => (
            <Link key={t.href} href={`${base}${t.href}`}
              className={cn("relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition",
                active(t.href) ? "text-accent-text" : "text-subtle")}>
              <t.icon className="size-[22px]" strokeWidth={active(t.href) ? 2.3 : 1.9} />
              {t.short}
              {t.href === "/inbox" && inboxBadge > 0 && (
                <span className="tabular absolute left-1/2 top-1.5 ml-2 min-w-[18px] rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold leading-[18px] text-black">
                  {inboxBadge > 99 ? "99+" : inboxBadge}
                </span>
              )}
            </Link>
          ))}
          <button onClick={() => setMore(true)}
            className={cn("flex flex-col items-center justify-center gap-1 text-[11px] font-medium", moreActive ? "text-accent-text" : "text-subtle")}>
            <MoreHorizontal className="size-[22px]" />
            More
          </button>
        </div>
      </nav>

      <Sheet open={more} onClose={close} title="More">
        <div className="grid grid-cols-2 gap-2">
          {TABS.filter((t) => !t.primary).map((t) => (
            <Link key={t.href} href={`${base}${t.href}`} onClick={close}
              className={cn("flex flex-col gap-3 rounded-xl border p-4 transition",
                active(t.href) ? "border-accent/40 bg-accent-soft text-accent-text" : "border-line bg-surface-2/60 text-fg hover:bg-surface-2")}>
              <t.icon className="size-5 opacity-80" />
              <span className="text-[15px] font-medium">{t.label}</span>
            </Link>
          ))}
        </div>
      </Sheet>
    </>
  );
}

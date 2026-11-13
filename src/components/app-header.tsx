"use client";
import { AlertCircle, CreditCard, LayoutGrid, LogOut, Menu, Store, UserRound, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import type { Theme } from "@/lib/theme";
import { Logo } from "./logo";
import { Sheet } from "./sheet";
import { ThemeRow, ThemeToggle } from "./theme-toggle";
import { Avatar, cn } from "./ui";

const ICONS = { vendors: Store, escalations: AlertCircle, usage: Wallet, billing: CreditCard, shop: LayoutGrid } as const;
export interface HeaderLink { href: string; label: string; icon: keyof typeof ICONS; badge?: number }

function isActive(path: string, href: string) {
  return href === "/dashboard" ? path === "/dashboard" || path.startsWith("/dashboard/v/") || path.startsWith("/dashboard/vendors") : path.startsWith(href);
}

export function AppHeader({ links, name, email, theme }: { links: HeaderLink[]; name: string; email: string; theme: Theme }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const totalBadge = links.reduce((s, l) => s + (l.badge ?? 0), 0);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:h-16 sm:gap-6">
        <Link href="/dashboard" className="shrink-0" aria-label="SalesPadi home">
          <Logo />
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href}
              className={cn("relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition",
                isActive(path, l.href) ? "bg-surface-2 text-fg" : "text-muted hover:text-fg")}>
              {l.label}
              {!!l.badge && <span className="tabular rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold leading-[18px] text-black">{l.badge}</span>}
            </Link>
          ))}
        </nav>
        <div className="flex-1 md:hidden" />

        <div className="flex items-center gap-1">
          <ThemeToggle initial={theme} />
          <Link href="/dashboard/account" className="hidden items-center gap-2 rounded-lg py-1 pl-1 pr-2.5 text-sm text-muted transition hover:bg-surface-2 hover:text-fg md:inline-flex" title={email}>
            <Avatar name={name} className="size-8 text-xs" />
            <span className="max-w-36 truncate">{name}</span>
          </Link>
          <button onClick={() => setOpen(true)} className="relative inline-flex size-10 items-center justify-center rounded-lg text-fg hover:bg-surface-2 md:hidden" aria-label="Open menu">
            <Menu className="size-[22px]" />
            {totalBadge > 0 && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-canvas" />}
          </button>
        </div>
      </div>

      <Sheet open={open} onClose={close} title="Menu">
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-3">
          <Avatar name={name} />
          <div className="min-w-0">
            <div className="truncate font-medium text-fg">{name}</div>
            <div className="truncate text-sm text-muted">{email}</div>
          </div>
        </div>
        <nav className="space-y-0.5" aria-label="Main">
          {links.map((l) => {
            const Icon = ICONS[l.icon];
            return (
              <Link key={l.href} href={l.href} onClick={close}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] transition",
                  isActive(path, l.href) ? "bg-accent-soft font-medium text-accent-text" : "text-fg hover:bg-surface-2")}>
                <Icon className="size-5 opacity-80" />
                <span className="flex-1">{l.label}</span>
                {!!l.badge && <span className="tabular rounded-full bg-amber-500 px-2 text-xs font-semibold leading-5 text-black">{l.badge}</span>}
              </Link>
            );
          })}
          <Link href="/dashboard/account" onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] text-fg hover:bg-surface-2">
            <UserRound className="size-5 opacity-80" /> Account
          </Link>
        </nav>
        <div className="my-2 border-t border-line" />
        <ThemeRow initial={theme} />
        <form action="/auth/signout" method="post">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] text-red-600 hover:bg-red-500/10 dark:text-red-400">
            <LogOut className="size-5" /> Sign out
          </button>
        </form>
      </Sheet>
    </header>
  );
}

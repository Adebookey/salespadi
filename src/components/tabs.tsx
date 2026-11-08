"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

export function Tabs({ base, tabs }: { base: string; tabs: { href: string; label: string; badge?: number }[] }) {
  const path = usePathname();
  return (
    <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-gray-200 px-4 text-sm">
      {tabs.map((t) => {
        const href = `${base}${t.href}`;
        const active = t.href === "" ? path === base : path.startsWith(href);
        return (
          <Link key={t.href} href={href}
            className={cn("flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5", active ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-gray-600 hover:text-gray-900")}>
            {t.label}
            {!!t.badge && <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{t.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

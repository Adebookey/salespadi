// SalesPadi UI kit. Semantic colour tokens (see globals.css) so every component works in dark and light.
// Mobile-first: 44px touch targets and 16px inputs on phones (stops iOS zooming into fields).
import Link from "next/link";
import { extendTailwindMerge } from "tailwind-merge";
import type { ComponentProps, ReactNode } from "react";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types";

// Teach tailwind-merge our custom font size so it doesn't treat it as a colour.
const twMerge = extendTailwindMerge({ extend: { classGroups: { "font-size": [{ text: ["[15px]", "[13px]", "[11px]", "[10px]"] }] } } });
/** Joins class names; later classes win over earlier conflicting ones (e.g. "p-4" then "p-0"). */
export const cn = (...c: (string | false | null | undefined)[]) => twMerge(c.filter(Boolean).join(" "));

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
type Size = "md" | "sm";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg shadow-card hover:bg-accent-hover disabled:opacity-50",
  secondary: "bg-surface text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-2 disabled:opacity-50",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
  "danger-ghost": "text-red-600 hover:bg-red-500/10 dark:text-red-400 disabled:opacity-50",
};
const sizes: Record<Size, string> = {
  md: "min-h-11 px-4 text-[15px] sm:min-h-10 sm:text-sm",
  sm: "min-h-9 px-3 text-sm",
};
const btn = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed";

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={cn(btn, variants[variant], sizes[size], className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cn(btn, variants[variant], sizes[size], className)} {...props} />;
}

const field =
  "block w-full rounded-lg border-0 bg-surface px-3 py-2.5 text-base text-fg ring-1 ring-inset ring-line-strong placeholder:text-subtle transition focus:outline-none focus:ring-2 focus:ring-focus disabled:opacity-60 sm:py-2 sm:text-sm";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(field, className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(field, "min-h-24", className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(field, "pr-8", className)} {...props} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="block text-xs leading-relaxed text-subtle">{hint}</span>}
    </label>
  );
}

export function Checkbox({ label, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-[15px] text-fg sm:min-h-0 sm:text-sm">
      <input type="checkbox" className="size-5 shrink-0 rounded accent-[var(--accent)] sm:size-4" {...props} />
      {label}
    </label>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5", className)} {...props} />;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
    </div>
  );
}

const tones = {
  gray: "bg-surface-3 text-muted ring-line-strong/60",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20",
  red: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20",
  purple: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20",
};
export type Tone = keyof typeof tones;

export function Badge({ colour = "gray", children, className }: { colour?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tones[colour], className)}>
      {children}
    </span>
  );
}

const statusTone: Record<OrderStatus, Tone> = {
  pending: "gray", awaiting_payment: "amber", paid: "green", packed: "blue",
  out_for_delivery: "purple", delivered: "green", cancelled: "red",
};
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge colour={statusTone[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted sm:text-[13px]">{label}</span>
        {icon && <span className="text-subtle [&>svg]:size-4">{icon}</span>}
      </div>
      <div className="tabular mt-2 truncate text-xl font-semibold tracking-tight text-fg sm:text-2xl">{value}</div>
      {hint && <div className="mt-1 text-xs leading-snug text-subtle">{hint}</div>}
    </Card>
  );
}

export function Empty({ title, children, icon, action }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface/50 px-6 py-12 text-center">
      {icon && <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-surface-2 text-subtle [&>svg]:size-5">{icon}</div>}
      <p className="font-medium text-fg">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const noticeTone = {
  info: "border-sky-600/20 bg-sky-50 text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200",
  warn: "border-amber-600/20 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
  error: "border-red-600/20 bg-red-50 text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200",
  success: "border-emerald-600/20 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200",
};
export function Notice({ tone = "info", children, className }: { tone?: keyof typeof noticeTone; children: ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed", noticeTone[tone], className)}>{children}</div>;
}

/** Pill-shaped filter links that scroll sideways on phones. */
export function FilterChips({ items, active }: { items: { id: string; label: string; href: string }[]; active: string }) {
  return (
    <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {items.map((x) => (
        <Link key={x.id} href={x.href}
          className={cn("inline-flex min-h-9 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition",
            active === x.id ? "bg-fg text-canvas" : "bg-surface text-muted ring-1 ring-inset ring-line hover:text-fg")}>
          {x.label}
        </Link>
      ))}
    </div>
  );
}

/** Rows inside a card: tappable list on phones and desktop alike. */
export function List({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card", className)} {...props} />;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return (
    <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm font-semibold text-muted", className)}>
      {initials}
    </span>
  );
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "-";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });
}

export function lagosDateTime(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

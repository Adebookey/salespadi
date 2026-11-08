// Small, dependency-free UI kit in the shadcn style. Mobile-first.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50",
  secondary: "bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50",
  ghost: "text-gray-700 hover:bg-gray-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
};
const btn = "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cn(btn, variants[variant], className)} {...props} />;
}

export function LinkButton({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(btn, variants[variant], className)} {...props} />;
}

const field = "block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-600 outline-none";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(field, className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(field, "min-h-24", className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(field, className)} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-gray-800">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

export function Checkbox({ label, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-800">
      <input type="checkbox" className="size-4 rounded accent-brand-600" {...props} />
      {label}
    </label>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-5", className)} {...props} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

const badgeColours = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-brand-50 text-brand-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  blue: "bg-blue-50 text-blue-700",
  purple: "bg-purple-50 text-purple-700",
};
export function Badge({ colour = "gray", children }: { colour?: keyof typeof badgeColours; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", badgeColours[colour])}>{children}</span>;
}

const statusColour: Record<OrderStatus, keyof typeof badgeColours> = {
  pending: "gray", awaiting_payment: "amber", paid: "green", packed: "blue",
  out_for_delivery: "purple", delivered: "green", cancelled: "red",
};
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge colour={statusColour[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
    </Card>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center">
      <p className="font-medium text-gray-900">{title}</p>
      {children && <div className="mt-1 text-sm text-gray-600">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode }) {
  const c = { info: "bg-blue-50 text-blue-800", warn: "bg-amber-50 text-amber-800", error: "bg-red-50 text-red-800", success: "bg-brand-50 text-brand-800" }[tone];
  return <div className={cn("rounded-lg px-3 py-2 text-sm", c)}>{children}</div>;
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

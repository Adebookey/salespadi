import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getVendorForUser } from "@/lib/auth";
import { Badge } from "@/components/ui";
import { VendorNav } from "@/components/vendor-nav";

const STATUS = { live: { tone: "green", label: "Live" }, onboarding: { tone: "amber", label: "Onboarding" }, paused: { tone: "red", label: "Paused" } } as const;

export default async function VendorLayout({ children, params }: { children: React.ReactNode; params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  const { vendor, supabase, isOperator } = await getVendorForUser(vendorId);
  const { count } = await supabase.from("conversations").select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId).eq("needs_attention", true);
  const status = STATUS[vendor.status];
  return (
    <div className="pb-20 md:pb-0">
      {isOperator && (
        <Link href="/dashboard" className="-ml-1 mb-2 inline-flex items-center gap-0.5 text-sm text-muted hover:text-fg">
          <ChevronLeft className="size-4" /> All vendors
        </Link>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 md:mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{vendor.name}</h1>
        <div className="flex items-center gap-1.5">
          <Badge colour={status.tone}>{status.label}</Badge>
          {!vendor.ai_enabled && <Badge colour="red">AI paused</Badge>}
        </div>
        {vendor.instagram_handle && <span className="hidden text-sm text-subtle sm:inline">@{vendor.instagram_handle}</span>}
      </div>
      <VendorNav base={`/dashboard/v/${vendorId}`} inboxBadge={count ?? 0} />
      {children}
    </div>
  );
}

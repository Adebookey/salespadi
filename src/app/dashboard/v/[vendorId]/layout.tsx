import { getVendorForUser } from "@/lib/auth";
import { Badge } from "@/components/ui";
import { Tabs } from "@/components/tabs";

export default async function VendorLayout({ children, params }: { children: React.ReactNode; params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  const { vendor, supabase, isOperator } = await getVendorForUser(vendorId);
  const { count } = await supabase.from("conversations").select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId).eq("needs_attention", true);
  const tabs = [
    { href: "", label: "Overview" },
    { href: "/inbox", label: "Inbox", badge: count ?? 0 },
    { href: "/orders", label: "Orders" },
    { href: "/catalog", label: "Catalog" },
    { href: "/setup", label: "Setup" },
    { href: "/studio", label: "AI studio" },
    { href: "/growth", label: "Growth" },
    { href: "/team", label: "Team" },
  ];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{vendor.name}</h1>
        <Badge colour={vendor.status === "live" ? "green" : vendor.status === "paused" ? "red" : "amber"}>{vendor.status}</Badge>
        {!vendor.ai_enabled && <Badge colour="red">AI paused</Badge>}
        {isOperator && vendor.instagram_handle && <span className="text-sm text-gray-500">@{vendor.instagram_handle}</span>}
      </div>
      <Tabs base={`/dashboard/v/${vendorId}`} tabs={tabs} />
      {children}
    </div>
  );
}

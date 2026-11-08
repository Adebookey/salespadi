import { getVendorForUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Studio } from "./studio";

export default async function StudioPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  const { vendor } = await getVendorForUser(vendorId);
  return (
    <>
      <PageHeader title="AI studio" description={`Chat with ${vendor.name}'s assistant as if you were a customer. It uses the live catalog, but orders and handoffs here are only simulated.`} />
      <Studio vendorId={vendorId} />
    </>
  );
}

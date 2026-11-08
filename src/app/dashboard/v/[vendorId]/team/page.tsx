import { getVendorForUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { inviteMember, removeMember } from "../../../_actions/vendor";

export default async function TeamPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  const { supabase, user } = await getVendorForUser(vendorId);
  const { data: members } = await supabase.from("vendor_members").select("user_id, role, created_at").eq("vendor_id", vendorId);
  const { data: canManage } = await supabase.rpc("is_vendor_owner", { v: vendorId });
  const emails = new Map<string, string>();
  for (const m of members ?? []) {
    const { data } = await adminClient().auth.admin.getUserById(m.user_id);
    if (data.user?.email) emails.set(m.user_id, data.user.email);
  }

  return (
    <>
      <PageHeader title="Team" description="People who can sign in to see this shop's chats, orders and stock." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <ul className="divide-y divide-gray-100">
            {(members ?? []).map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span>{emails.get(m.user_id) ?? m.user_id}{m.user_id === user.id && <span className="text-gray-500"> (you)</span>}</span>
                <span className="flex items-center gap-2">
                  <Badge colour={m.role === "operator" ? "purple" : m.role === "owner" ? "green" : "gray"}>{m.role}</Badge>
                  {canManage && m.user_id !== user.id && (
                    <form action={removeMember.bind(null, vendorId, m.user_id)}><Button variant="ghost" className="text-red-600">Remove</Button></form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        {canManage && (
          <Card>
            <h2 className="font-medium">Add someone</h2>
            <ActionForm action={inviteMember.bind(null, vendorId)} className="mt-3 space-y-3">
              <Field label="Email"><Input name="email" type="email" required /></Field>
              <Field label="Name"><Input name="full_name" /></Field>
              <Field label="Role" hint="Owners can add or remove people. Staff can do everything else.">
                <Select name="role" defaultValue="staff"><option value="staff">Staff</option><option value="owner">Owner</option></Select>
              </Field>
              <SubmitButton>Send invite</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}

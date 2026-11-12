import { getSession } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const { user } = await getSession();
  return (
    <>
      <PageHeader title="Account" description={`Signed in as ${user.email}`} />
      <Card className="max-w-md">
        <h2 className="mb-3 font-medium">Change password</h2>
        <PasswordForm />
      </Card>
    </>
  );
}

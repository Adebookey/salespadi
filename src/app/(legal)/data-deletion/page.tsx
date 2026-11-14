import Link from "next/link";
import { contactEmail } from "@/lib/env";

export const metadata = { title: "Delete your data", description: "How to have your data deleted from SalesPadi." };

export default function DataDeletionPage() {
  const email = contactEmail();
  return (
    <>
      <h1>Delete your data</h1>
      <p>
        If you chatted with a business that uses SalesPadi on WhatsApp or Instagram, you can ask for your data to be
        deleted at any time.
      </p>

      <h2>How to ask</h2>
      <ul>
        <li>
          <b>In the chat:</b> send the business a message saying you want your data deleted. The assistant passes it
          to a member of their team.
        </li>
        {email && (
          <li>
            <b>By email:</b> write to <a href={`mailto:${email}`}>{email}</a> with the business&apos;s name and the
            WhatsApp number or Instagram username you used.
          </li>
        )}
      </ul>
      <p>We may need to confirm the request comes from you before deleting anything.</p>

      <h2>What gets deleted</h2>
      <ul>
        <li>Your chat history with that business, including photos, voice notes and payment receipts.</li>
        <li>Your name, phone number and delivery address, including on past orders.</li>
        <li>Your contact details and your choice about promotional messages.</li>
      </ul>
      <p>
        Order amounts may be kept for the business&apos;s accounts, without anything that identifies you. Deletion is
        done within 30 days of your request.
      </p>

      <h2>Your data held by Meta</h2>
      <p>
        Messages also exist in your own WhatsApp or Instagram app and on Meta&apos;s services, under Meta&apos;s own
        policies. Deleting your data from SalesPadi doesn&apos;t delete it there.
      </p>
      <p>
        More about how we handle data is in our <Link href="/privacy">privacy policy</Link>.
      </p>
    </>
  );
}

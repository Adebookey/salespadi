import Link from "next/link";
import { contactEmail } from "@/lib/env";

export const metadata = { title: "Privacy policy", description: "How SalesPadi handles personal data." };

const UPDATED = "14 November 2026";

export default function PrivacyPage() {
  const email = contactEmail();
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="text-sm text-subtle">Last updated {UPDATED}</p>

      <p>
        SalesPadi (&ldquo;we&rdquo;) provides an AI sales assistant to small businesses in Nigeria (&ldquo;vendors&rdquo;).
        When you message a vendor that uses SalesPadi on WhatsApp or Instagram, our assistant answers your questions,
        takes your order and helps you pay, on that vendor&apos;s behalf. This policy explains what personal data is
        involved, why, who it is shared with, and how to have it deleted.
      </p>
      <p>
        For your chats and orders, the vendor you are buying from decides how your data is used, and we process it
        for them. We aim to comply with the Nigeria Data Protection Act 2023.
      </p>

      <h2>What we collect</h2>
      <p><b>If you chat with a vendor:</b></p>
      <ul>
        <li>Your WhatsApp number or Instagram account ID, and the profile name you use there.</li>
        <li>Your messages to the vendor, including photos, voice notes and payment receipts you send.</li>
        <li>Details you give to place an order: your name, phone number and delivery address.</li>
        <li>Your orders and their payment status. Card and bank payments are handled by Paystack; we never see or store your card details.</li>
        <li>Whether you agreed to receive news and promotions from the vendor.</li>
      </ul>
      <p><b>If you use the SalesPadi dashboard</b> (vendors and their staff): your name, email address, and the business information, products and settings you enter.</p>

      <h2>How we use it</h2>
      <ul>
        <li>To answer your questions about the vendor&apos;s products, prices and delivery.</li>
        <li>To take and manage your orders, confirm payments and send you order and delivery updates.</li>
        <li>To pass your chat to a member of the vendor&apos;s team when the assistant can&apos;t help.</li>
        <li>To send at most one follow-up message if you asked about a product but didn&apos;t order, and payment reminders for unpaid orders.</li>
        <li>To send promotions only if you agreed to receive them. You can ask the vendor in the chat to stop at any time.</li>
      </ul>
      <p>We don&apos;t sell personal data, and we don&apos;t use your messages to advertise to you.</p>

      <h2>Who we share it with</h2>
      <p>We use these service providers to run SalesPadi. Each receives only what it needs:</p>
      <ul>
        <li><b>Meta</b> (WhatsApp and Instagram), to receive and send messages.</li>
        <li><b>Anthropic</b> (Claude), which reads the conversation to write the assistant&apos;s replies.</li>
        <li><b>Supabase</b>, which stores our database and files, in Ireland (EU).</li>
        <li><b>Vercel</b>, which hosts the SalesPadi website and servers.</li>
        <li><b>Paystack</b>, which processes card, bank and USSD payments for the vendor.</li>
        <li><b>Google</b>, only if the vendor chooses to keep their orders in a Google Sheet.</li>
      </ul>
      <p>Some of these providers process data outside Nigeria. We may also disclose data where the law requires it.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Chats and orders are kept for as long as the vendor uses SalesPadi, or until deletion is requested.</li>
        <li>Raw copies of incoming messages, used only to process them, are deleted after 30 days.</li>
        <li>When data is deleted, order amounts may be kept for the vendor&apos;s accounts, without your name, phone number or address.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask to see the personal data held about you, to correct it, or to have it deleted. You can also stop
        promotional messages at any time. See <Link href="/data-deletion">how to delete your data</Link>.
        {email && <> You can also email <a href={`mailto:${email}`}>{email}</a>.</>}
        {" "}If you are not satisfied with our response, you can complain to the Nigeria Data Protection Commission.
      </p>

      <h2>Security</h2>
      <p>
        Access to each vendor&apos;s data is restricted to that vendor&apos;s team and SalesPadi staff who support them.
        Access keys for messaging and payment accounts are stored encrypted, and all connections use HTTPS.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy, we will update the date at the top of this page.</p>
    </>
  );
}
